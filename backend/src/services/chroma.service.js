import { ChromaClient } from "chromadb";
import { config } from "../config/config.js";

const client = new ChromaClient({
  host: config.chroma.host,
  port: config.chroma.port,
  ssl: config.chroma.ssl,
});

const collectionName = config.chroma.collectionName;

let collectionCache = null;

const noEmbed = {
  async generate() {
    throw new Error("Embeddings required");
  },
};

function isVector(value) {
  return Array.isArray(value) && value.length > 0 && typeof value[0] === "number";
}

export async function getCollection() {
  if (collectionCache) return collectionCache;

  collectionCache = await client.getOrCreateCollection({
    name: collectionName,
    metadata: { "hnsw:space": "cosine" },
    embeddingFunction: noEmbed,
  });

  return collectionCache;
}

export async function addRecords(records, options = {}) {
  const batchSize = Number(options.batchSize ?? config.chroma.defaultBatchSize);
  const list = Array.isArray(records) ? records : [];
  if (list.length === 0) return { added: 0 };

  const collection = await getCollection();

  for (let startIndex = 0; startIndex < list.length; startIndex += batchSize) {
    const batch = list.slice(startIndex, startIndex + batchSize);

    const ids = [];
    const documents = [];
    const embeddings = [];
    const metadatas = [];

    for (const record of batch) {
      if (!record?.id) continue;
      if (!isVector(record.embedding)) throw new Error("Bad embedding");

      ids.push(record.id);
      documents.push(record.text ?? "");
      embeddings.push(record.embedding);
      metadatas.push(record.meta ?? {});
    }

    if (ids.length) await collection.add({ ids, documents, embeddings, metadatas });
  }

  return { added: list.length };
}

export async function queryRecords(queryEmbedding, topK = config.chroma.defaultTopK, options = {}) {
  if (!isVector(queryEmbedding)) throw new Error("Missing embedding");

  const collection = await getCollection();
  const queryResult = await collection.query({
    queryEmbeddings: [queryEmbedding],
    nResults: topK,
    include: ["documents", "metadatas", "distances"],
    ...(options.where ? { where: options.where } : {}),
  });

  const ids = queryResult.ids?.[0] ?? [];
  const docs = queryResult.documents?.[0] ?? [];
  const metas = queryResult.metadatas?.[0] ?? [];
  const dists = queryResult.distances?.[0] ?? [];

  return ids.map((id, index) => {
    const distance = typeof dists[index] === "number" ? dists[index] : null;
    return {
      id,
      text: docs[index],
      meta: metas[index] ?? {},
      distance,
      score: typeof distance === "number" ? 1 - distance : null,
    };
  });
}

export async function listByDoc(docId, options = {}) {
  const limit = typeof options.limit === "number" ? options.limit : 50;

  const collection = await getCollection();
  const result = await collection.get({
    where: { docId },
    include: ["documents", "metadatas"],
    limit,
  });

  const ids = result.ids ?? [];
  const docs = result.documents ?? [];
  const metas = result.metadatas ?? [];

  const chunks = ids.map((id, index) => ({
    id,
    text: docs[index],
    meta: metas[index] ?? {},
    distance: null,
    score: null,
  }));

  chunks.sort((a, b) => {
    const ap = Number(a.meta?.page ?? 0);
    const bp = Number(b.meta?.page ?? 0);
    if (ap !== bp) return ap - bp;
    return Number(a.meta?.chunkIndex ?? 0) - Number(b.meta?.chunkIndex ?? 0);
  });

  return chunks;
}

export async function deleteByIds(ids, options = {}) {
  const batchSize = Number(options.batchSize ?? config.chroma.deleteBatchSize);
  const list = Array.isArray(ids) ? ids : [];
  if (list.length === 0) return { deleted: 0 };

  const collection = await getCollection();

  for (let startIndex = 0; startIndex < list.length; startIndex += batchSize) {
    await collection.delete({ ids: list.slice(startIndex, startIndex + batchSize) });
  }

  return { deleted: list.length };
}

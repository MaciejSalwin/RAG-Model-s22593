import fs from "node:fs/promises";
import path from "node:path";
import { config } from "../config/config.js";

const indexPath = config.docsIndex.indexPath;
const maxEntries = config.docsIndex.maxEntries;

async function ensureIndex() {
  await fs.mkdir(path.dirname(indexPath), { recursive: true });
  try {
    await fs.access(indexPath);
  } catch {
    await fs.writeFile(indexPath, JSON.stringify({ docs: [] }, null, 2), "utf8");
  }
}

async function readDocs() {
  await ensureIndex();
  try {
    const raw = await fs.readFile(indexPath, "utf8");
    return JSON.parse(raw).docs ?? [];
  } catch {
    return [];
  }
}

async function writeDocs(docs) {
  await ensureIndex();
  await fs.writeFile(indexPath, JSON.stringify({ docs }, null, 2), "utf8");
}

export async function saveEntry(entry) {
  const docs = await readDocs();

  docs.push({
    docId: entry.docId,
    originalName: entry.originalName,
    savedAs: entry.savedAs,
    uploadedAt: entry.uploadedAt ?? new Date().toISOString(),
    pages: entry.pages ?? null,
    chunks: entry.chunks ?? null,
  });

  if (docs.length > maxEntries) docs.splice(0, docs.length - maxEntries);

  await writeDocs(docs);
}

export async function getLatest() {
  const docs = await readDocs();
  return docs[docs.length - 1] ?? null;
}

export async function findByName(filename) {
  const docs = await readDocs();
  const target = String(filename ?? "").toLowerCase();

  for (let i = docs.length - 1; i >= 0; i--) {
    const name = String(docs[i]?.originalName ?? "").toLowerCase();
    if (name === target) return docs[i];
  }

  return null;
}

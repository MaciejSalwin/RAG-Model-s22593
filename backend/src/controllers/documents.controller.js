import crypto from "node:crypto";
import { config } from "../config/config.js";

import { saveEntry } from "../services/documentsIndex.service.js";
import { extractPages } from "../services/pdf.service.js";
import { splitPages } from "../services/chunk.service.js";
import { createEmbedding } from "../services/embed.service.js";
import { addRecords, deleteByIds } from "../services/chroma.service.js";

function makeChunkId(docId, page, chunkIndex) {
  return `${docId}-p${page}-c${chunkIndex}`;
}

export async function uploadDocs(request, response) {
  const uploadedFiles = request.files ?? [];
  if (uploadedFiles.length === 0) return response.status(400).json({ error: "Missing files" });

  const results = [];

  const {
    maxPagesPerFile,
    chromaBatchSize,
    chunkSizeWords,
    overlapWords,
    maxChunkChars,
  } = config.documents;

  for (const uploadedFile of uploadedFiles) {
    const docId = crypto.randomUUID();
    const originalName = uploadedFile.originalname;
    const savedAs = uploadedFile.filename;
    const pdfPath = uploadedFile.path;

    const insertedChunkIds = [];

    try {
      console.log("Upload started");

      const pages = await extractPages(pdfPath);
      if (pages.length > maxPagesPerFile) throw new Error("Too many pages");

      const chunks = splitPages(pages, {
        filename: originalName,
        docId,
        chunkSizeWords,
        overlapWords,
        maxChunkChars,
      });

      for (let startIndex = 0; startIndex < chunks.length; startIndex += chromaBatchSize) {
        const chunkBatch = chunks.slice(startIndex, startIndex + chromaBatchSize);

        const chromaRecords = [];
        for (const chunkItem of chunkBatch) {
          const embedding = await createEmbedding(chunkItem.text);
          const chunkId = makeChunkId(docId, chunkItem.page, chunkItem.chunkIndex);

          chromaRecords.push({
            id: chunkId,
            text: chunkItem.text,
            embedding,
            meta: {
              docId,
              filename: originalName,
              page: chunkItem.page,
              chunkIndex: chunkItem.chunkIndex,
            },
          });

          insertedChunkIds.push(chunkId);
        }

        await addRecords(chromaRecords, { batchSize: chromaBatchSize });
      }

      await saveEntry({
        docId,
        originalName,
        savedAs,
        pages: pages.length,
        chunks: chunks.length,
      });

      results.push({
        docId,
        originalName,
        savedAs,
        size: uploadedFile.size,
        mimetype: uploadedFile.mimetype,
        pages: pages.length,
        chunks: chunks.length,
      });

      console.log("Upload done");
    } catch (error) {
      try {
        if (insertedChunkIds.length) await deleteByIds(insertedChunkIds);
      } catch {
        console.log("Cleanup failed");
      }

      console.log("Upload failed");
      return response.status(400).json({
        error: error?.message ?? "Upload failed",
        docId,
        originalName,
      });
    }
  }

  const totals = results.reduce(
    (total, file) => ({
      files: total.files + 1,
      pages: total.pages + (file.pages ?? 0),
      chunks: total.chunks + (file.chunks ?? 0),
    }),
    { files: 0, pages: 0, chunks: 0 }
  );

  return response.status(201).json({ status: "ok", files: results, totals });
}

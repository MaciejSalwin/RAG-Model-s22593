import { config } from "../config/config.js";

export function splitPages(pages, options = {}) {
  const list = Array.isArray(pages) ? pages : [];
  const filename = options.filename;
  const docId = options.docId;

  if (!filename) throw new Error("Missing filename");
  if (!docId) throw new Error("Missing docId");

  const chunkSizeWords = Number(options.chunkSizeWords ?? config.documents.chunkSizeWords);
  const overlapWords = Number(options.overlapWords ?? config.documents.overlapWords);
  const maxChunkChars = Number(options.maxChunkChars ?? config.documents.maxChunkChars);

  const chunks = [];
  let chunkIndex = 0;

  for (const pageItem of list) {
    const pageNumber = pageItem?.page;
    const pageText = String(pageItem?.text ?? "");

    if (!Number.isFinite(pageNumber)) continue;

    const words = pageText.replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
    if (words.length === 0) continue;

    let startWord = 0;

    while (startWord < words.length) {
      const endWord = Math.min(startWord + chunkSizeWords, words.length);

      let text = words.slice(startWord, endWord).join(" ");
      if (maxChunkChars && text.length > maxChunkChars) text = text.slice(0, maxChunkChars).trim();

      if (text) {
        chunks.push({
          docId,
          filename,
          page: pageNumber,
          chunkIndex,
          text,
        });
        chunkIndex += 1;
      }

      if (endWord >= words.length) break;

      startWord = endWord - overlapWords;
      if (startWord < 0) startWord = 0;
      if (startWord >= endWord) startWord = endWord;
    }
  }

  return chunks;
}

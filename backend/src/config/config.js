import path from "node:path";

export const config = {
  documents: {
    maxPagesPerFile: 60,
    chromaBatchSize: 40,
    chunkSizeWords: 240,
    overlapWords: 40,
    maxChunkChars: 3500,
  },

  qa: {
    topK: 6,
    docSummaryLimit: 40,
    summaryDefaultSentences: 6,
    summaryMaxSentences: 60,
    minTextChars: 30,
  },

  chroma: {
    host: "chroma",
    port: 8000,
    ssl: false,
    collectionName: "global-docs",
    defaultBatchSize: 50,
    defaultTopK: 5,
    deleteBatchSize: 200,
  },

  docsIndex: {
    indexPath: path.join(process.cwd(), "storage", "documents.json"),
    maxEntries: 500,
  },

  ollama: {
    host: "http://ollama:11434",
    timeoutMs: 180000,

    embedModel: "mxbai-embed-large",
    embed: {
      endpoint: "/api/embeddings",
      maxConcurrency: 3,
      maxRetries: 3,
      baseDelayMs: 250,
      maxChars: 3500,
    },

    llmModel: "llama2",
    llm: {
      numPredict: 900,
      chatEndpoint: "/api/chat",
    },
  },

  llm: {
    maxContextChars: 2200,
    maxContexts: 10,
    noInfoText: "No information found in the provided documents.",
  },

  pdf: {
    diacritics: [
      "ą","ć","ę","ł","ń","ó","ś","ź","ż",
      "Ą","Ć","Ę","Ł","Ń","Ó","Ś","Ź","Ż",
    ],
    stopwords: [
      "w","we","i","a","o","z","ze","do","na","od","po","u","za","nie","się","to","że","czy",
    ],
    pdfjs: {
      getDocument: {
        stopAtErrors: false,
        ignoreErrors: true,
        disableWorker: true,
        useSystemFonts: true,
        verbosity: 0,
      },
      getTextContent: {
        normalizeWhitespace: true,
        disableCombineTextItems: false,
      },
    },
  },
};

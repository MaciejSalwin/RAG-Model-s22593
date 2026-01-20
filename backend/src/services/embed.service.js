import axios from "axios";
import { config } from "../config/config.js";

const host = config.ollama.host;
const modelName = config.ollama.embedModel;

const endpoint = config.ollama.embed.endpoint;
const timeoutMs = config.ollama.timeoutMs;

const maxChars = config.ollama.embed.maxChars;

const maxConcurrency = config.ollama.embed.maxConcurrency;
const maxRetries = config.ollama.embed.maxRetries;
const baseDelayMs = config.ollama.embed.baseDelayMs;

let activeJobs = 0;
const queue = [];

function sleepMs(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function cleanText(text) {
  return String(text ?? "").replace(/\s+/g, " ").trim();
}

function cutText(text, limit) {
  const value = cleanText(text);
  if (!limit) return value;
  return value.length <= limit ? value : value.slice(0, limit).trim();
}

function shouldRetry(error) {
  const code = error?.code;
  const status = error?.response?.status;

  return (
    code === "ECONNRESET" ||
    code === "ETIMEDOUT" ||
    code === "ECONNABORTED" ||
    status === 429 ||
    (typeof status === "number" && status >= 500)
  );
}

async function withRetry(action) {
  let attempt = 0;

  while (attempt <= maxRetries) {
    try {
      return await action();
    } catch (error) {
      attempt += 1;
      if (!shouldRetry(error) || attempt > maxRetries) throw error;
      await sleepMs(baseDelayMs * attempt);
    }
  }
}

function withLimit(action) {
  return new Promise((resolve, reject) => {
    const run = async () => {
      activeJobs += 1;
      try {
        resolve(await action());
      } catch (error) {
        reject(error);
      } finally {
        activeJobs -= 1;
        const next = queue.shift();
        if (next) next();
      }
    };

    if (activeJobs < maxConcurrency) run();
    else queue.push(run);
  });
}

async function callEmbed(prompt) {
  const response = await axios.post(
    `${host}${endpoint}`,
    { model: modelName, prompt },
    { timeout: timeoutMs }
  );

  const embedding = response?.data?.embedding;
  if (!Array.isArray(embedding) || embedding.length === 0) throw new Error("Embed failed");

  return embedding;
}

export async function createEmbedding(text) {
  return withLimit(() => withRetry(() => callEmbed(cutText(text, maxChars))));
}

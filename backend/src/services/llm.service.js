import axios from "axios";
import { config } from "../config/config.js";

const host = config.ollama.host;
const modelName = config.ollama.llmModel;

const endpoint = config.ollama.llm.chatEndpoint;
const timeoutMs = config.ollama.timeoutMs;
const numPredict = config.ollama.llm.numPredict;

const maxContextChars = config.llm.maxContextChars;
const maxContexts = config.llm.maxContexts;

export const NO_INFO = config.llm.noInfoText;

function cleanText(text) {
  return String(text ?? "").replace(/\s+/g, " ").trim();
}

function clipText(text, limit) {
  const value = cleanText(text);
  if (!limit) return value;
  return value.length <= limit ? value : value.slice(0, limit).trim() + "…";
}

function splitSentences(text) {
  const value = cleanText(text);
  if (!value) return [];
  return value.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean);
}

function countSentences(text) {
  return splitSentences(text).length;
}

function uniqContexts(contexts) {
  const list = Array.isArray(contexts) ? contexts : [];
  const seen = new Set();

  return list.filter((ctx) => {
    const meta = ctx?.meta ?? {};
    const key =
      String(meta.filename ?? "?") +
      ":" +
      String(meta.page ?? "?") +
      ":" +
      String(meta.chunkIndex ?? "?") +
      ":" +
      cleanText(String(ctx?.text ?? "").slice(0, 80));

    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function formatContexts(contexts) {
  return contexts.slice(0, maxContexts).map((ctx) => {
    const meta = ctx?.meta ?? {};
    const header = `[${ctx.id}] ${meta.filename ?? "unknown"} page ${meta.page ?? "?"}`;
    const body = clipText(ctx?.text, maxContextChars);
    return `${header}\n${body}`;
  }).join("\n\n---\n\n");
}

function fixCites(text) {
  return String(text ?? "")
    .replace(/\[\s*n\s*(\d+)\s*\]/gi, "[$1]")
    .replace(/\[\s*nr\s*(\d+)\s*\]/gi, "[$1]");
}

function addAutoCites(text, maxSourceId) {
  const value = fixCites(text);
  if (value === NO_INFO) return NO_INFO;
  if (/\[\d+\]/.test(value)) return value;

  const sentences = splitSentences(value);
  if (sentences.length === 0) return NO_INFO;

  const maxId = Math.max(1, Number(maxSourceId));
  return sentences.map((s, i) => `${s} [${(i % maxId) + 1}]`).join(" ");
}

function buildPrompt({ question, contexts, mode, constraints }) {
  const exact = Number(constraints?.exactSentences ?? 6);
  const min = Number(constraints?.minSentences ?? 1);
  const max = Number(constraints?.maxSentences ?? 3);

  const ruleLine = mode === "summary"
    ? `Exactly ${exact} sentences.`
    : `Answer ${min} to ${max} sentences.`;

  const system =
    "You are a Q&A assistant for documents." +
    "RULES:" +
    "Always answer in English." +
    "Answer ONLY using the provided fragments." +
    "Be concrete (facts, dates, roles, decisions, deadlines)." +
    "Citations must be only [1], [2] etc" +
    "Do NOT repeat the question." +
    `If the answer cannot be found: return exactly "${NO_INFO}".` +
    ruleLine;

  const user =
    "Question\n" +
    cleanText(question) +
    "\n\nFragments\n" +
    formatContexts(contexts) +
    "\n\nReturn only the answer.";

  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}

async function chatOnce(messages) {
  const payload = {
    model: modelName,
    messages,
    stream: false,
    options: { temperature: 0.2, top_p: 0.9, num_predict: numPredict },
  };

  const response = await axios.post(`${host}${endpoint}`, payload, { timeout: timeoutMs });
  const text = response?.data?.message?.content;

  if (!text) throw new Error("LLM failed");
  return String(text).trim();
}

export async function generateAnswer(options = {}) {
  const question = options.question;
  const mode = options.mode ?? "qa";
  const constraints = options.constraints ?? {};

  const contexts = uniqContexts(options.contexts ?? []).slice(0, maxContexts);
  const maxSourceId = Math.max(1, contexts.length);

  const messages = buildPrompt({ question, contexts, mode, constraints });
  const raw = await chatOnce(messages);

  const output = fixCites(String(raw).trim());
  if (output === NO_INFO) return NO_INFO;

  if (mode === "summary" && Number.isFinite(constraints.exactSentences)) {
    if (countSentences(output) !== constraints.exactSentences) return NO_INFO;
  }

  return addAutoCites(output, maxSourceId);
}

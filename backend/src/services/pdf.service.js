import fs from "node:fs/promises";
import path from "node:path";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import { config } from "../config/config.js";

const polishChars = new Set(config.pdf.diacritics ?? []);
const stopwords = new Set(config.pdf.stopwords ?? []);

const pdfDocOptions = config.pdf.pdfjs?.getDocument ?? {};
const pdfTextOptions = config.pdf.pdfjs?.getTextContent ?? {};

function cleanSpaces(text) {
  return String(text ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\t/g, " ")
    .replace(/[\u00A0\u202F\u2007\u2009]/g, " ")
    .replace(/\u00AD/g, "");
}

function joinHyphens(text) {
  return String(text ?? "").replace(/(\p{L}{2,})-\n(\p{L}{2,})/gu, "$1$2");
}

function isLetters(token) {
  return token && /^\p{L}+$/u.test(token);
}

function hasPolishStart(token) {
  return token ? polishChars.has(token[0]) : false;
}

function fixKerning(line) {
  const tokens = String(line ?? "").split(" ").filter(Boolean);
  if (tokens.length < 4) return String(line ?? "");

  const output = [];
  let index = 0;

  while (index < tokens.length) {
    const token = tokens[index];

    if (!isLetters(token)) {
      output.push(token);
      index += 1;
      continue;
    }

    let runEnd = index;
    while (runEnd < tokens.length && isLetters(tokens[runEnd])) runEnd += 1;

    const run = tokens.slice(index, runEnd);
    const singleLetters = run.filter((t) => t.length === 1).length;

    const shouldJoin =
      (run.length >= 4 && singleLetters / run.length >= 0.5) ||
      (run.length === 3 && run[1]?.length === 1) ||
      (run.length === 2 &&
        run[0]?.length >= 2 &&
        !stopwords.has(run[0].toLowerCase()) &&
        run[1]?.length <= 3 &&
        hasPolishStart(run[1]));

    output.push(shouldJoin ? run.join("") : run.join(" "));
    index = runEnd;
  }

  return output.join(" ");
}

export function normalizeText(rawText) {
  if (!rawText) return "";

  const text = joinHyphens(cleanSpaces(rawText));
  const lines = text.split("\n").map((line) => line.replace(/[ ]{2,}/g, " ").trim());
  const fixed = lines.map(fixKerning).join("\n");

  return fixed
    .split("\n")
    .map((line) => line.replace(/[ ]+$/g, ""))
    .join("\n")
    .replace(/[ ]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export async function extractPages(pdfPath) {
  const absolutePath = path.resolve(String(pdfPath ?? ""));
  const fileBuffer = await fs.readFile(absolutePath);

  let pdfDoc;
  try {
    pdfDoc = await pdfjs.getDocument({ data: new Uint8Array(fileBuffer), ...pdfDocOptions }).promise;
  } catch {
    throw new Error("PDF failed");
  }

  const pages = [];

  for (let pageNumber = 1; pageNumber <= pdfDoc.numPages; pageNumber++) {
    const page = await pdfDoc.getPage(pageNumber);
    const textContent = await page.getTextContent({ ...pdfTextOptions });

    let rawText = "";
    for (const item of textContent.items) {
      const part = item?.str ?? "";
      if (!part) continue;
      rawText += part;
      rawText += item?.hasEOL ? "\n" : " ";
    }

    pages.push({ page: pageNumber, text: normalizeText(rawText) });
  }

  return pages;
}

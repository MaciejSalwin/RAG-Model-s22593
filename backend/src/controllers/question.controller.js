import { config } from "../config/config.js";

import { createEmbedding } from "../services/embed.service.js";
import { queryRecords, listByDoc } from "../services/chroma.service.js";
import { generateAnswer, NO_INFO } from "../services/llm.service.js";
import { getLatest, findByName } from "../services/documentsIndex.service.js";
import { normalizeText } from "../services/pdf.service.js";

const qaConfig = config.qa;

function cleanText(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function wantsSummary(questionText) {
  const text = cleanText(questionText).toLowerCase();
  return (
    text.includes("summarize") ||
    text.includes("summary") ||
    text.includes("tldr") ||
    text.includes("tl;dr") ||
    text.includes("recap") ||
    /\b\d{1,3}\s+sentences?\b/i.test(text)
  );
}

function sentenceCountFromQuestion(questionText) {
  const text = cleanText(questionText);
  const match = text.match(/\b(\d{1,3})\s+sentences?\b/i);
  const count = match ? Number(match[1]) : null;
  if (!Number.isFinite(count)) return null;
  return Math.max(1, Math.min(count, qaConfig.summaryMaxSentences));
}

async function pickDoc(docId, filename) {
  if (docId) return { docId, selected: { docId } };

  const byName = filename ? await findByName(filename) : null;
  if (byName?.docId) return { docId: byName.docId, selected: { docId: byName.docId, filename: byName.originalName } };

  const latest = await getLatest();
  if (latest?.docId) {
    return {
      docId: latest.docId,
      selected: { docId: latest.docId, filename: latest.originalName, uploadedAt: latest.uploadedAt },
    };
  }

  return { docId: null, selected: null };
}

function filterHits(hits) {
  const list = Array.isArray(hits) ? hits : [];
  const good = list.filter((hit) => normalizeText(hit?.text ?? "").length >= qaConfig.minTextChars);
  return good.length ? good : list;
}

function buildContexts(hits) {
  return hits.map((hit, index) => ({
    id: index + 1,
    text: normalizeText(hit?.text ?? ""),
    meta: { ...(hit?.meta ?? {}), chunkId: hit?.id ?? null },
  }));
}

function buildSources(contexts, hits) {
  return contexts.map((contextItem, index) => ({
    id: contextItem.id,
    docId: contextItem.meta?.docId ?? null,
    filename: contextItem.meta?.filename ?? null,
    page: contextItem.meta?.page ?? null,
    chunkIndex: contextItem.meta?.chunkIndex ?? null,
    chunkId: contextItem.meta?.chunkId ?? null,
    distance: hits?.[index]?.distance ?? null,
    score: hits?.[index]?.score ?? null,
  }));
}

export async function askQuestion(request, response, next) {
  try {
    const question = cleanText(request.body?.question);
    if (!question) return response.status(400).json({ error: "Missing question" });

    const requestedDocId = request.body?.docId ? String(request.body.docId) : null;
    const requestedFilename = request.body?.filename ? String(request.body.filename) : null;

    console.log("Answer started");

    if (wantsSummary(question)) {
      const picked = await pickDoc(requestedDocId, requestedFilename);
      const usedDocId = picked.docId;

      if (!usedDocId) {
        console.log("Answer empty");
        return response.json({ answer: NO_INFO, sources: [], selected: null });
      }

      const rawHits = await listByDoc(usedDocId, { limit: qaConfig.docSummaryLimit });
      const hits = filterHits(rawHits);

      if (hits.length === 0) {
        console.log("Answer empty");
        return response.json({ answer: NO_INFO, sources: [], selected: picked.selected });
      }

      const exactSentences = sentenceCountFromQuestion(question) ?? qaConfig.summaryDefaultSentences;

      const contexts = buildContexts(hits);
      const answer = await generateAnswer({
        question,
        contexts,
        mode: "summary",
        constraints: { mode: "summary", exactSentences },
      });

      console.log("Answer done");
      return response.json({
        answer,
        sources: buildSources(contexts, hits),
        usedDocId,
        selected: picked.selected,
      });
    }

    const embedding = await createEmbedding(question);

    const firstHits = await queryRecords(embedding, qaConfig.topK, {
      where: requestedDocId ? { docId: requestedDocId } : undefined,
    });

    let hits = filterHits(firstHits);

    if (hits.length === 0) {
      hits = filterHits(await queryRecords(embedding, Math.max(qaConfig.topK * 3, 12)));
    }

    if (hits.length === 0 && requestedDocId) {
      hits = filterHits(await listByDoc(requestedDocId, { limit: qaConfig.docSummaryLimit }));
    }

    if (hits.length === 0) {
      console.log("Answer empty");
      return response.json({ answer: NO_INFO, sources: [] });
    }

    const contexts = buildContexts(hits);
    const answer = await generateAnswer({
      question,
      contexts,
      mode: "qa",
      constraints: { mode: "qa", minSentences: 1, maxSentences: 4 },
    });

    console.log("Answer done");
    return response.json({ answer, sources: buildSources(contexts, hits) });
  } catch (error) {
    console.log("Answer failed");
    next(error);
  }
}

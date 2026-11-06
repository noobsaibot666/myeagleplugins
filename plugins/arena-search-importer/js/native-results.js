/* global URL */
"use strict";

const { normalizeImageUrl } = require("./arena-bridge.js");

function normalizePinterestResult(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = /** @type {Record<string, unknown>} */ (value);
  const pinUrl = typeof input.pinUrl === "string" && /^https:\/\/www\.are\.na\/block\/[1-9]\d*$/.test(input.pinUrl) ? input.pinUrl : null;
  const rawImageUrl = normalizeImageUrl(input.imageUrl);
  const imageUrl = rawImageUrl
    ? (() => {
        const url = new URL(rawImageUrl);
        url.search = "";
        return url.href;
      })()
    : null;
  if (!pinUrl || !imageUrl) return null;
  const pinId = pinUrl.split("/")[4];
  if (input.pinId !== undefined && input.pinId !== pinId) return null;
  const text = (field) => (typeof input[field] === "string" ? input[field].trim() : "");
  return {
    pinId,
    pinUrl,
    imageUrl,
    ...(input.imageVariants && typeof input.imageVariants === "object" && !Array.isArray(input.imageVariants)
      ? { imageVariants: Object.fromEntries(["1200x", "original", "600x"].map((key) => [key, normalizeImageUrl(input.imageVariants[key])]).filter(([, url]) => url)) }
      : {}),
    title: text("title"),
    description: text("description"),
    author: text("author"),
    isVideo: input.isVideo === true,
  };
}

/** @param {unknown} query @returns {string[]} */
function searchTokens(query) {
  return String(query || "").toLowerCase().match(/[\p{L}\p{N}]+/gu) || [];
}

function scoreResult(result, query) {
  const phrase = String(query || "").trim().toLowerCase();
  if (!phrase) return 0;
  const title = `${result.title || ""}`.toLowerCase();
  const description = `${result.description || ""}`.toLowerCase();
  const author = `${result.author || ""}`.toLowerCase();
  const combined = `${title} ${description} ${author}`;
  const tokens = searchTokens(phrase);
  let score = 0;
  if (title === phrase) score += 1000;
  if (title.includes(phrase)) score += 400;
  if (description.includes(phrase)) score += 120;
  if (author.includes(phrase)) score += 40;
  score += tokens.reduce((total, token) => total + (title.includes(token) ? 80 : 0) + (description.includes(token) ? 20 : 0) + (author.includes(token) ? 8 : 0), 0);
  if (tokens.length && tokens.every((token) => combined.includes(token))) score += 160;
  return score;
}

function dedupePinterestResults(results, query = "") {
  const output = [];
  const seen = new Set();
  const seenImages = new Set();
  for (const result of Array.isArray(results) ? results : []) {
    const normalized = normalizePinterestResult(result);
    if (!normalized || seen.has(normalized.pinId) || seenImages.has(normalized.imageUrl)) continue;
    seen.add(normalized.pinId);
    seenImages.add(normalized.imageUrl);
    output.push(normalized);
  }
  return output.map((result, index) => ({ result, index, score: scoreResult(result, query) })).sort((a, b) => b.score - a.score || a.index - b.index).map(({ result }) => result);
}

module.exports = { normalizePinterestResult, dedupePinterestResults, scoreResult };

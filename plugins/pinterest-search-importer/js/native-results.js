/* global URL */
"use strict";

const { normalizePinUrl, normalizeImageUrl } = require("./pinterest-bridge.js");

function normalizePinterestResult(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = /** @type {Record<string, unknown>} */ (value);
  const pinUrl = normalizePinUrl(input.pinUrl);
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

function dedupePinterestResults(results) {
  const output = [];
  const seen = new Set();
  for (const result of Array.isArray(results) ? results : []) {
    const normalized = normalizePinterestResult(result);
    if (!normalized || seen.has(normalized.pinId)) continue;
    seen.add(normalized.pinId);
    output.push(normalized);
  }
  return output;
}

module.exports = { normalizePinterestResult, dedupePinterestResults };

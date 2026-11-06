/* global URL */
"use strict";

const https = require("node:https");

/** @typedef {Partial<Record<"display"|"large"|"original"|"thumb", string>>} ImageVariants */

const API_URL = "https://api.are.na/v2/search";
const USER_AGENT = "Eagle Are.na Search Importer/0.1 (+https://github.com/noobsaibot666/myeagleplugins)";

function requestJson(url) {
  return new Promise((resolve, reject) => {
    const request = https.get(url, { headers: { Accept: "application/json", "User-Agent": USER_AGENT } }, (response) => {
      let body = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => { body += chunk; });
      response.on("end", () => resolve({
        ok: response.statusCode >= 200 && response.statusCode < 300,
        status: response.statusCode || 0,
        async json() { return JSON.parse(body); },
      }));
    });
    request.once("error", reject);
  });
}

/** @param {unknown} value @returns {string|null} */
function normalizeImageUrl(value) {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.port)
      return null;
    if (!/(^|\.)images\.are\.na$/.test(url.hostname) && !/(^|\.)cloudfront\.net$/.test(url.hostname)) return null;
    url.hash = "";
    return url.href;
  } catch (_error) {
    return null;
  }
}

/** @param {unknown} value @returns {string} */
function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

/** @param {unknown} value */
function normalizeArenaBlock(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const block = /** @type {Record<string, any>} */ (value);
  const id = Number(block.id);
  if (!Number.isInteger(id) || id < 1 || !block.image) return null;
  const image = block.image;
  /** @type {ImageVariants} */
  const imageVariants = {};
  for (const key of ["display", "large", "original", "thumb"]) {
    const url = normalizeImageUrl(image[key]?.url);
    if (url) imageVariants[key] = url;
  }
  const imageUrl = imageVariants.display || imageVariants.large || imageVariants.original || imageVariants.thumb;
  if (!imageUrl) return null;
  const title = text(block.title) || text(block.generated_title) || text(block.content);
  return {
    pinId: String(id),
    pinUrl: `https://www.are.na/block/${id}`,
    imageUrl,
    imageVariants,
    title,
    description: text(block.description),
    author: text(block.user?.name || block.user?.slug),
    isVideo: false,
  };
}

function buildSearchUrl(query, page = 1, per = 20) {
  const url = new URL(API_URL);
  url.searchParams.set("q", query.trim());
  url.searchParams.set("page", String(Math.max(1, Math.floor(page))));
  url.searchParams.set("per", String(Math.min(20, Math.max(1, Math.floor(per)))));
  return url.href;
}

async function searchArena(query, page = 1, per = 20, fetchImpl = requestJson) {
  if (!query?.trim()) throw new Error("Enter an Are.na search term.");
  if (typeof fetchImpl !== "function") throw new Error("Are.na search is unavailable in this Eagle version.");
  const response = await fetchImpl(buildSearchUrl(query, page, per));
  if (!response.ok) throw new Error(`Are.na search returned HTTP ${response.status}`);
  const payload = await response.json();
  const results = Array.isArray(payload?.blocks) ? payload.blocks.map(normalizeArenaBlock).filter(Boolean) : [];
  return {
    results,
    currentPage: Number(payload?.current_page) || page,
    totalPages: Number(payload?.total_pages) || page,
    hasMore: (Number(payload?.current_page) || page) < (Number(payload?.total_pages) || page),
  };
}

module.exports = { normalizeImageUrl, normalizeArenaBlock, buildSearchUrl, searchArena };

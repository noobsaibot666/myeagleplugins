/* global URL */
"use strict";

const API_URL = "https://frameset.app/api/search";
const IMAGE_HOST = "https://d13mryl9xv19vu.cloudfront.net/";
const DEFAULT_PAGE_SIZE = 50;

function requestJson(url) {
  return new Promise((resolve, reject) => {
    const request = require("node:https").get(
      url,
      { headers: { Accept: "application/json", "User-Agent": "Eagle Frame Set Search Importer/0.1" } },
      (response) => {
        let body = "";
        response.setEncoding("utf8");
        response.on("data", (chunk) => { body += chunk; });
        response.on("end", () => resolve({
          ok: response.statusCode >= 200 && response.statusCode < 300,
          status: response.statusCode || 0,
          async json() { return JSON.parse(body); },
        }));
      },
    );
    request.once("error", reject);
  });
}

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function safeFrameId(value) {
  return typeof value === "string" && /^[a-z0-9-]{8,}$/i.test(value) ? value : null;
}

function normalizeFrameSetResult(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const frame = /** @type {Record<string, any>} */ (value);
  const frameId = safeFrameId(frame.id);
  if (!frameId || frame.type !== "still") return null;

  const title = frame.title && typeof frame.title === "object" ? frame.title : {};
  const entity = Array.isArray(title.entity) ? title.entity : [];
  const brand = text(entity.find((entry) => entry && typeof entry.name === "string")?.name);
  const titlePath = text(title.href);
  const framePageUrl = titlePath.startsWith("/")
    ? `https://frameset.app${titlePath}`
    : "https://frameset.app/search";
  const width = Number(frame.size?.width);
  const height = Number(frame.size?.height);
  const aspect = Number(frame.size?.aspect) || (width > 0 && height > 0 ? width / height : 0);
  const frameUrl = `${IMAGE_HOST}${frameId}_sm.avif`;

  if (!Number.isFinite(width) || width < 1 || !Number.isFinite(height) || height < 1 || !aspect) return null;
  return {
    frameId,
    frameUrl,
    frameVariants: { small: frameUrl },
    framePageUrl,
    title: text(title.title) || `Frame Set ${frameId}`,
    brand,
    type: "still",
    width,
    height,
    aspect,
  };
}

function buildSearchUrl(query, page = 1, size = DEFAULT_PAGE_SIZE) {
  const url = new URL(API_URL);
  url.searchParams.set("page", String(Math.max(1, Math.floor(page))));
  url.searchParams.set("size", String(Math.min(DEFAULT_PAGE_SIZE, Math.max(1, Math.floor(size)))));
  url.searchParams.set("search", String(query || "").trim());
  return url.href;
}

async function searchFrameSet(query, page = 1, size = DEFAULT_PAGE_SIZE, fetchImpl = requestJson) {
  if (!String(query || "").trim()) throw new Error("Enter a Frame Set search term.");
  const response = await fetchImpl(buildSearchUrl(query, page, size));
  if (!response.ok) throw new Error(`Frame Set search returned HTTP ${response.status}`);
  const payload = await response.json();
  if (payload?.success !== true || !payload?.data) throw new Error("Frame Set returned an invalid search response.");
  const results = Array.isArray(payload.data.results)
    ? payload.data.results.map(normalizeFrameSetResult).filter(Boolean)
    : [];
  return {
    results,
    currentPage: Math.max(1, Math.floor(page)),
    hasMore: payload.data.cursor?.hasMore === true,
  };
}

module.exports = { buildSearchUrl, normalizeFrameSetResult, searchFrameSet };

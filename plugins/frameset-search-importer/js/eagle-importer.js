/* global URL, Buffer, btoa */
"use strict";

const MAX_DOWNLOAD_BYTES = 20 * 1024 * 1024;
const IMAGE_HOST = "d13mryl9xv19vu.cloudfront.net";
const { normalizeSettings, buildImportTags } = require("./settings");

function uniqueStrings(value) {
  return Array.isArray(value) ? [...new Set(value.filter((item) => typeof item === "string" && item.trim()))] : [];
}

async function getCurrentTargetFolderIds(eagleApi) {
  try {
    const folders = await eagleApi?.folder?.getSelected?.();
    return Array.isArray(folders) ? uniqueStrings(folders.map((folder) => folder?.id)) : [];
  } catch (_error) {
    return [];
  }
}

function normalizeFrameUrl(value) {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.hostname !== IMAGE_HOST || url.username || url.password || url.port) return null;
    if (!/^\/[a-z0-9-]{8,}_sm\.avif$/i.test(url.pathname)) return null;
    url.search = "";
    url.hash = "";
    return url.href;
  } catch (_error) {
    return null;
  }
}

function encodeBase64(bytes) {
  if (typeof Buffer !== "undefined") return Buffer.from(bytes).toString("base64");
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

async function fetchImageAsDataUrl(imageUrl, fetchImpl = globalThis.fetch) {
  const normalized = normalizeFrameUrl(imageUrl);
  if (!normalized) throw new Error("A valid HTTPS Frame Set image URL is required");
  if (typeof fetchImpl !== "function") throw new Error("Browser image fallback is unavailable");
  const response = await fetchImpl(normalized, { headers: { Accept: "image/avif,image/*" } });
  if (!response.ok) throw new Error(`Frame Set image returned HTTP ${response.status}`);
  const contentType = response.headers?.get?.("content-type") || "image/avif";
  if (!/^image\//i.test(contentType)) throw new Error("Frame Set URL did not return an image");
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > MAX_DOWNLOAD_BYTES) throw new Error("Frame Set image exceeds 20 MiB");
  return `data:${contentType.split(";", 1)[0]};base64,${encodeBase64(bytes)}`;
}

function importOptions(frame, folderIds, tags) {
  return {
    name: frame.title || `Frame Set ${frame.frameId}`,
    website: frame.framePageUrl,
    annotation: [
      frame.brand ? `Brand: ${frame.brand}` : "",
      frame.type ? `Type: ${frame.type}` : "",
      frame.width && frame.height ? `Dimensions: ${frame.width} × ${frame.height}` : "",
    ].filter(Boolean).join("\n"),
    tags: uniqueStrings(tags),
    folders: [...folderIds],
  };
}

async function importFrameSetFrame(eagleApi, frame, options = {}) {
  if (!frame || typeof frame !== "object" || !frame.frameId || !normalizeFrameUrl(frame.frameUrl) || typeof frame.framePageUrl !== "string") {
    throw new Error("A valid Frame Set still is required");
  }
  const folderIds = options.folderIds === undefined ? await getCurrentTargetFolderIds(eagleApi) : uniqueStrings(options.folderIds);
  const settings = normalizeSettings(options.settings);
  const tags = uniqueStrings([
    ...buildImportTags(settings, options.searchTerm),
    ...(options.tags || []),
  ]);
  const itemApi = eagleApi?.item;
  if (!itemApi) throw new Error("Eagle image import is unavailable");
  const metadata = importOptions(frame, folderIds, tags);
  if (typeof itemApi.addFromURL === "function") {
    try {
      const itemId = await itemApi.addFromURL(frame.frameUrl, metadata);
      if (typeof itemId === "string" && itemId.trim()) return { itemId, folderIds };
    } catch (_error) {
      // CloudFront may challenge Eagle's background URL fetch; use renderer fallback below.
    }
  }
  if (typeof itemApi.addFromBase64 !== "function") throw new Error("Eagle base64 image import is unavailable");
  const imageData = await fetchImageAsDataUrl(frame.frameUrl, options.fetchImpl);
  const itemId = await itemApi.addFromBase64(imageData, metadata);
  if (typeof itemId !== "string" || !itemId.trim()) throw new Error("Eagle did not return an imported item ID");
  return { itemId, folderIds };
}

module.exports = { getCurrentTargetFolderIds, normalizeFrameUrl, fetchImageAsDataUrl, importFrameSetFrame };

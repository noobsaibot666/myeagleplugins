/* global setTimeout, clearTimeout */
"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const https = require("node:https");
const { Transform } = require("node:stream");
const { pipeline } = require("node:stream/promises");
const { normalizeImageUrl } = require("./arena-bridge");
const { buildImportTags, normalizeSettings } = require("./settings");

const MAX_DOWNLOAD_BYTES = 20 * 1024 * 1024;
const DOWNLOAD_TIMEOUT_MS = 15000;

function uniqueStrings(value) {
  return Array.isArray(value) ? [...new Set(value.filter((item) => typeof item === "string" && item.trim()))] : [];
}

async function getCurrentTargetFolderIds(eagleApi) {
  try {
    const folders = await eagleApi?.folder?.getSelected?.();
    return Array.isArray(folders) ? uniqueStrings(folders.map((folder) => folder?.id)) : [];
  } catch (_error) { return []; }
}

async function downloadImage(imageUrl, destination) {
  const normalized = normalizeImageUrl(imageUrl);
  if (!normalized) throw new Error("A valid HTTPS Are.na image URL is required");
  /** @type {import("node:http").ClientRequest|undefined} */
  let request;
  const timer = setTimeout(() => request?.destroy(new Error("Are.na image download timed out")), DOWNLOAD_TIMEOUT_MS);
  try {
    const response = await new Promise((resolve, reject) => {
      request = https.get(normalized, { headers: { Accept: "image/*", "User-Agent": "Eagle Are.na Search Importer/0.1 (+https://github.com/noobsaibot666/myeagleplugins)" } }, resolve);
      request.once("error", reject);
    });
    try {
      if (response.statusCode !== 200) throw new Error(`Are.na image returned HTTP ${response.statusCode}`);
      if (!/^image\//i.test(response.headers["content-type"] || "")) throw new Error("Are.na URL did not return an image");
      if (Number(response.headers["content-length"]) > MAX_DOWNLOAD_BYTES) throw new Error("Are.na image exceeds 20 MiB");
      let bytes = 0;
      const limit = new Transform({
        transform(chunk, _encoding, callback) {
          bytes += chunk.length;
          callback(bytes > MAX_DOWNLOAD_BYTES ? new Error("Are.na image exceeds 20 MiB") : null, chunk);
        },
      });
      await pipeline(response, limit, fs.createWriteStream(destination, { flags: "wx", mode: 0o600 }));
    } finally {
      response.destroy();
    }
  } finally {
    clearTimeout(timer);
    if (request) request.destroy();
  }
}

async function finishImport(eagleApi, itemId, folderIds, settings) {
  if (settings.openItemAfterImport && typeof eagleApi.item.open === "function") await eagleApi.item.open(itemId).catch(() => {});
  return { itemId, folderIds };
}

async function importArenaBlock(eagleApi, block, options = {}) {
  if (!block || typeof block !== "object" || !normalizeImageUrl(block.imageUrl)) throw new Error("A valid Are.na image block is required");
  const folderIds = options.folderIds === undefined ? await getCurrentTargetFolderIds(eagleApi) : uniqueStrings(options.folderIds);
  const settings = normalizeSettings(options.settings);
  const imageUrl = normalizeImageUrl(block.imageVariants?.original) || normalizeImageUrl(block.imageVariants?.large) || normalizeImageUrl(block.imageUrl);
  const metadata = [block.title ? `Title: ${block.title}` : "", block.description || "", block.author ? `Author: ${block.author}` : ""].filter(Boolean).join("\n\n");
  const importOptions = {
    name: block.title || `Are.na ${block.pinId}`,
    website: block.pinUrl,
    annotation: metadata,
    tags: uniqueStrings([...(block.tags || []), ...buildImportTags(settings, options.searchTerm)]),
    folders: folderIds,
  };
  if (typeof eagleApi.item.addFromPath === "function") {
    const tempFs = options.tempFs || fs.promises;
    let temporaryDirectory;
    try {
      temporaryDirectory = await tempFs.mkdtemp(path.join(os.tmpdir(), "eagle-arena-"));
      const temporaryFile = path.join(temporaryDirectory, "image.jpg");
      await (options.download || downloadImage)(imageUrl, temporaryFile);
      const result = await eagleApi.item.addFromPath(temporaryFile, importOptions);
      if (typeof result !== "string" || !result.trim()) throw new Error("Eagle did not return an imported item ID");
      return await finishImport(eagleApi, result, folderIds, settings);
    } finally {
      if (temporaryDirectory) await tempFs.rm(temporaryDirectory, { recursive: true, force: true }).catch(() => {});
    }
  }
  if (typeof eagleApi.item.addFromURL !== "function") throw new Error("Eagle image import is unavailable");
  const result = await eagleApi.item.addFromURL(imageUrl, importOptions);
  if (typeof result !== "string" || !result.trim()) throw new Error("Eagle did not return an imported item ID");
  return finishImport(eagleApi, result, folderIds, settings);
}

module.exports = { getCurrentTargetFolderIds, importArenaBlock, downloadImage };

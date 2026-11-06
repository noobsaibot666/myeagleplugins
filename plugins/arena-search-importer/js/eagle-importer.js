"use strict";

const { normalizeImageUrl } = require("./arena-bridge");
const { buildImportTags, normalizeSettings } = require("./settings");

function uniqueStrings(value) {
  return Array.isArray(value) ? [...new Set(value.filter((item) => typeof item === "string" && item.trim()))] : [];
}

async function getCurrentTargetFolderIds(eagleApi) {
  try {
    const folders = await eagleApi?.folder?.getSelected?.();
    return Array.isArray(folders) ? uniqueStrings(folders.map((folder) => folder?.id)) : [];
  } catch (_error) { return []; }
}

async function importArenaBlock(eagleApi, block, options = {}) {
  if (!block || typeof block !== "object" || !normalizeImageUrl(block.imageUrl)) throw new Error("A valid Are.na image block is required");
  const folderIds = options.folderIds === undefined ? await getCurrentTargetFolderIds(eagleApi) : uniqueStrings(options.folderIds);
  const settings = normalizeSettings(options.settings);
  const metadata = [block.title ? `Title: ${block.title}` : "", block.description || "", block.author ? `Author: ${block.author}` : ""].filter(Boolean).join("\n\n");
  const result = await eagleApi.item.addFromURL(block.imageUrl, {
    name: block.title || `Are.na ${block.pinId}`,
    website: block.pinUrl,
    annotation: metadata,
    tags: uniqueStrings([...(block.tags || []), ...buildImportTags(settings, options.searchTerm)]),
    folders: folderIds,
  });
  if (typeof result !== "string" || !result.trim()) throw new Error("Eagle did not return an imported item ID");
  if (settings.openItemAfterImport && typeof eagleApi.item.open === "function") await eagleApi.item.open(result).catch(() => {});
  return { itemId: result, folderIds };
}

module.exports = { getCurrentTargetFolderIds, importArenaBlock };

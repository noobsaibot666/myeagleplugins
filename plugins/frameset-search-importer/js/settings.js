"use strict";

/** @typedef {{addFrameSetTag: boolean, addSearchTag: boolean, openItemAfterImport?: boolean}} ImportSettings */
const SETTINGS_KEY = "frameset-search-importer:settings";
const DEFAULT_SETTINGS = Object.freeze({ addFrameSetTag: true, addSearchTag: false, openItemAfterImport: false });

function normalizeSettings(value) {
  const input = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  return {
    addFrameSetTag: typeof input.addFrameSetTag === "boolean" ? input.addFrameSetTag : true,
    addSearchTag: typeof input.addSearchTag === "boolean" ? input.addSearchTag : false,
    openItemAfterImport: typeof input.openItemAfterImport === "boolean" ? input.openItemAfterImport : false,
  };
}

function loadSettings(storage) {
  try { return normalizeSettings(JSON.parse(storage.getItem(SETTINGS_KEY))); } catch (_error) { return { ...DEFAULT_SETTINGS }; }
}

function saveSettings(storage, settings) {
  try { storage.setItem(SETTINGS_KEY, JSON.stringify(normalizeSettings(settings))); return true; } catch (_error) { return false; }
}

function buildImportTags(settings, searchTerm = "") {
  const normalized = normalizeSettings(settings);
  return [...new Set([
    ...(normalized.addFrameSetTag ? ["Frame Set"] : []),
    ...(normalized.addSearchTag && searchTerm.trim() ? [searchTerm.trim()] : []),
  ])];
}

module.exports = { SETTINGS_KEY, DEFAULT_SETTINGS, normalizeSettings, loadSettings, saveSettings, buildImportTags };

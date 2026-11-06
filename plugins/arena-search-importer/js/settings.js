"use strict";

/** @typedef {{addArenaTag: boolean, addSearchTag: boolean, openItemAfterImport?: boolean}} ImportSettings */
const SETTINGS_KEY = "arena-search-importer:settings";
const DEFAULT_SETTINGS = Object.freeze({ addArenaTag: true, addSearchTag: false });

function normalizeSettings(value) {
  const input = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  return {
    addArenaTag: typeof input.addArenaTag === "boolean" ? input.addArenaTag : true,
    addSearchTag: typeof input.addSearchTag === "boolean" ? input.addSearchTag : false,
  };
}

function loadSettings(storage) {
  try { return normalizeSettings(JSON.parse(storage.getItem(SETTINGS_KEY))); } catch (_error) { return { ...DEFAULT_SETTINGS }; }
}

function saveSettings(storage, settings) {
  try { storage.setItem(SETTINGS_KEY, JSON.stringify(normalizeSettings(settings))); return true; } catch (_error) { return false; }
}

function buildImportTags(settings, searchTerm = "") {
  return [...new Set([...(settings.addArenaTag ? ["Are.na"] : []), ...(settings.addSearchTag && searchTerm.trim() ? [searchTerm.trim()] : [])])];
}

module.exports = { SETTINGS_KEY, DEFAULT_SETTINGS, normalizeSettings, loadSettings, saveSettings, buildImportTags };

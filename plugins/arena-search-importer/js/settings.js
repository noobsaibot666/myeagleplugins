"use strict";

/** @typedef {{addArenaTag: boolean, addSearchTag: boolean, addChannelTag: boolean, includePreviews: boolean, openItemAfterImport?: boolean}} ImportSettings */
const SETTINGS_KEY = "arena-search-importer:settings";
const DEFAULT_SETTINGS = Object.freeze({ addArenaTag: true, addSearchTag: false, addChannelTag: false, includePreviews: false });

function normalizeSettings(value) {
  const input = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const flag = (key) => (typeof input[key] === "boolean" ? input[key] : DEFAULT_SETTINGS[key]);
  return {
    addArenaTag: flag("addArenaTag"),
    addSearchTag: flag("addSearchTag"),
    addChannelTag: flag("addChannelTag"),
    includePreviews: flag("includePreviews"),
  };
}

function loadSettings(storage) {
  try { return normalizeSettings(JSON.parse(storage.getItem(SETTINGS_KEY))); } catch (_error) { return { ...DEFAULT_SETTINGS }; }
}

function saveSettings(storage, settings) {
  try { storage.setItem(SETTINGS_KEY, JSON.stringify(normalizeSettings(settings))); return true; } catch (_error) { return false; }
}

function buildImportTags(settings, searchTerm = "", channelTitle = "") {
  return [...new Set([
    ...(settings.addArenaTag ? ["Are.na"] : []),
    ...(settings.addSearchTag && searchTerm.trim() ? [searchTerm.trim()] : []),
    ...(settings.addChannelTag && channelTitle.trim() ? [channelTitle.trim()] : []),
  ])];
}

module.exports = { SETTINGS_KEY, DEFAULT_SETTINGS, normalizeSettings, loadSettings, saveSettings, buildImportTags };

"use strict";

const { normalizeImageUrl } = require("./pinterest-bridge");

/** @typedef {{imageVariant: "1200x"|"original"|"600x", addPinterestTag: boolean, addSearchTag: boolean, openPinAfterImport: boolean}} ImportSettings */
const SETTINGS_KEY = "pinterest-search-importer:settings";
/** @type {Readonly<ImportSettings>} */
const DEFAULT_SETTINGS = Object.freeze({
  imageVariant: "1200x",
  addPinterestTag: true,
  addSearchTag: false,
  openPinAfterImport: false,
});

/** Return only the four allowlisted preferences, with strict value checks.
 * @param {unknown} value @returns {ImportSettings}
 */
function normalizeSettings(value) {
  const input =
    value && typeof value === "object" && !Array.isArray(value)
      ? /** @type {Record<string, unknown>} */ (value)
      : {};
  return {
    imageVariant:
      typeof input.imageVariant === "string" &&
      ["1200x", "original", "600x"].includes(input.imageVariant)
        ? /** @type {ImportSettings["imageVariant"]} */ (input.imageVariant)
        : DEFAULT_SETTINGS.imageVariant,
    addPinterestTag:
      typeof input.addPinterestTag === "boolean"
        ? input.addPinterestTag
        : DEFAULT_SETTINGS.addPinterestTag,
    addSearchTag:
      typeof input.addSearchTag === "boolean"
        ? input.addSearchTag
        : DEFAULT_SETTINGS.addSearchTag,
    openPinAfterImport:
      typeof input.openPinAfterImport === "boolean"
        ? input.openPinAfterImport
        : DEFAULT_SETTINGS.openPinAfterImport,
  };
}

/** @param {Pick<Storage, "getItem">} storage @returns {ImportSettings} */
function loadSettings(storage) {
  try {
    return normalizeSettings(JSON.parse(storage.getItem(SETTINGS_KEY)));
  } catch (_error) {
    return { ...DEFAULT_SETTINGS };
  }
}

/** @param {Pick<Storage, "setItem">} storage @param {unknown} settings */
function saveSettings(storage, settings) {
  try {
    storage.setItem(SETTINGS_KEY, JSON.stringify(normalizeSettings(settings)));
    return true;
  } catch (_error) {
    return false;
  }
}

/** Prefer a supplied variant, otherwise retain the bridge's best image.
 * @param {{imageUrl: string, imageVariants?: Partial<Record<ImportSettings["imageVariant"], string>>}} pin
 * @param {string} variant
 */
function selectImageVariant(pin, variant) {
  return normalizeImageUrl(pin.imageVariants?.[variant]) || pin.imageUrl;
}

/** @param {ImportSettings} settings @param {string} [searchTerm] */
function buildImportTags(settings, searchTerm = "") {
  return [
    ...new Set([
      ...(settings.addPinterestTag ? ["Pinterest"] : []),
      ...(settings.addSearchTag && searchTerm.trim()
        ? [searchTerm.trim()]
        : []),
    ]),
  ];
}

module.exports = {
  SETTINGS_KEY,
  DEFAULT_SETTINGS,
  normalizeSettings,
  loadSettings,
  saveSettings,
  selectImageVariant,
  buildImportTags,
};

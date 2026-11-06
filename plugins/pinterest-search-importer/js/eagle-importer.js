/* global URL, setTimeout, clearTimeout */
"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const https = require("node:https");
const { Transform } = require("node:stream");
const { pipeline } = require("node:stream/promises");
const {
  validateImportMessage,
  normalizeImageUrl,
} = require("./pinterest-bridge");
const {
  normalizeSettings,
  selectImageVariant,
  buildImportTags,
} = require("./settings");

/** @typedef {Partial<Pick<EagleItemModule, "addFromURL" | "addFromPath" | "open">>} ImportItemApi */
/** @typedef {{folder?: Partial<Pick<EagleFolderModule, "getSelected">>, item?: ImportItemApi}} ImportApi */
/**
 * @typedef {object} ImportOptions
 * @property {string[]} [folderIds] A captured selection; [] explicitly targets the library root.
 * @property {string[]} [tags] Additional tags, merged with any pin.tags.
 * @property {Partial<import("./settings").ImportSettings>} [settings] Captured preferences for this import.
 * @property {string} [searchTerm] Search that produced the Pin, never persisted.
 * @property {boolean} [allowLocalFallback] Opt in to a temporary-file download after URL import fails.
 * @property {(url: string, destination: string) => Promise<void>} [download] Writes only to the supplied temporary path.
 * @property {(milliseconds: number) => Promise<void>} [sleep] Retry delay dependency.
 * @property {Pick<typeof fs.promises, "mkdtemp" | "rm">} [tempFs] Temporary directory operations.
 */

const RETRY_DELAY_MS = 250;
const MAX_DOWNLOAD_BYTES = 20 * 1024 * 1024;
const DOWNLOAD_TIMEOUT_MS = 15000;

class EagleImportError extends Error {
  /** @param {string} code @param {string} pinId @param {string} message @param {unknown} [cause] */
  constructor(code, pinId, message, cause) {
    super(message);
    this.name = "EagleImportError";
    this.code = code;
    this.pinId = pinId;
    this.cause = cause;
  }
}

/** @param {unknown} value @returns {string[]} */
function uniqueStrings(value) {
  if (!Array.isArray(value)) return [];
  return [
    ...new Set(value.filter((id) => typeof id === "string" && id.trim())),
  ];
}

/** @param {ImportApi} eagleApi @returns {Promise<string[]>} */
async function getCurrentTargetFolderIds(eagleApi) {
  try {
    const folders = await eagleApi?.folder?.getSelected?.();
    return Array.isArray(folders)
      ? uniqueStrings(folders.map((folder) => folder?.id))
      : [];
  } catch (_error) {
    // Eagle can temporarily have no active library while switching libraries.
    return [];
  }
}

/** @param {number} milliseconds @returns {Promise<void>} */
function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

/** @param {unknown} itemId @returns {string} */
function requireItemId(itemId) {
  if (typeof itemId !== "string" || !itemId.trim()) {
    throw new Error("Eagle did not return an imported item ID");
  }
  return itemId;
}

/**
 * Download a single public Pinterest image, without cookies or redirects.
 * The deadline covers DNS, connection and the full response body; a byte limit
 * also applies when Content-Length is missing or incorrect.
 * @param {string} imageUrl
 * @param {string} destination
 */
async function downloadImage(imageUrl, destination) {
  const normalized = normalizeImageUrl(imageUrl);
  if (!normalized || new URL(normalized).protocol !== "https:") {
    throw new Error("Temporary downloads require an HTTPS Pinterest image URL");
  }

  /** @type {import("node:http").ClientRequest|undefined} */
  let request;
  const timer = setTimeout(() => {
    request?.destroy(new Error("Image download timed out"));
  }, DOWNLOAD_TIMEOUT_MS);

  try {
    const response = await new Promise((resolve, reject) => {
      request = https.get(normalized, resolve);
      request.once("error", reject);
    });
    try {
      if (response.statusCode !== 200) {
        throw new Error(`Image download returned HTTP ${response.statusCode}`);
      }
      if (!/^image\//i.test(response.headers["content-type"] || "")) {
        throw new Error("Image download did not return an image");
      }
      if (Number(response.headers["content-length"]) > MAX_DOWNLOAD_BYTES) {
        throw new Error("Image download exceeds 20 MiB");
      }
      let bytes = 0;
      const limit = new Transform({
        transform(chunk, _encoding, callback) {
          bytes += chunk.length;
          callback(
            bytes > MAX_DOWNLOAD_BYTES
              ? new Error("Image download exceeds 20 MiB")
              : null,
            chunk,
          );
        },
      });
      await pipeline(
        response,
        limit,
        fs.createWriteStream(destination, {
          flags: "wx",
          mode: 0o600,
        }),
      );
    } finally {
      response.destroy();
    }
  } finally {
    clearTimeout(timer);
    request?.destroy();
  }
}

/**
 * Import a bridge-validated image through Eagle's public API. The Pin URL is
 * the item's website; Eagle calls its description field `annotation`.
 * Errors expose stable codes and pinId for a future queue to report.
 * @param {ImportApi} eagleApi
 * @param {unknown} pin
 * @param {ImportOptions} [options]
 * @returns {Promise<{itemId: string, folderIds: string[]}>}
 */
async function importPin(eagleApi, pin, options = {}) {
  const normalized = validateImportMessage(pin);
  if (!normalized) {
    throw new EagleImportError(
      "INVALID_PIN",
      "",
      "A valid Pinterest image Pin is required",
    );
  }
  const { pinId, pinUrl, title, description, author, isVideo } = normalized;
  const settings = normalizeSettings(options.settings);
  const imageUrl = selectImageVariant(normalized, settings.imageVariant);
  if (isVideo) {
    throw new EagleImportError(
      "UNSUPPORTED_PIN",
      pinId,
      "Video Pins are not supported",
    );
  }
  const folderIds =
    options.folderIds === undefined
      ? await getCurrentTargetFolderIds(eagleApi)
      : uniqueStrings(options.folderIds);
  const pinTags = /** @type {{tags?: unknown}} */ (pin).tags;
  const metadata = [
    title ? `Title: ${title}` : "",
    description,
    author ? `Author: ${author}` : "",
  ];
  /** @type {EagleItemAddOptions} */
  const importOptions = {
    name: title || `Pinterest ${pinId}`,
    website: pinUrl,
    annotation: metadata.filter(Boolean).join("\n\n"),
    tags: uniqueStrings([
      ...uniqueStrings(pinTags),
      ...uniqueStrings(options.tags),
      ...(options.settings
        ? buildImportTags(settings, options.searchTerm)
        : []),
    ]),
    folders: [...folderIds],
  };
  const itemApi = eagleApi?.item;
  /** Opening is a best-effort follow-up; an imported item must stay successful.
   * @param {string} itemId
   */
  async function finishImport(itemId) {
    if (settings.openPinAfterImport && typeof itemApi?.open === "function") {
      try {
        await itemApi.open(itemId);
      } catch (_error) {
        // Do not offer a duplicate import when Eagle cannot open the item.
      }
    }
    return { itemId, folderIds };
  }
  let urlError = new EagleImportError(
    "URL_IMPORT_UNAVAILABLE",
    pinId,
    "Eagle URL import is unavailable",
  );
  if (typeof itemApi?.addFromURL === "function") {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const itemId = requireItemId(
          await itemApi.addFromURL(imageUrl, importOptions),
        );
        return await finishImport(itemId);
      } catch (cause) {
        urlError = new EagleImportError(
          "URL_IMPORT_FAILED",
          pinId,
          "Eagle URL import failed after retry",
          cause,
        );
      }
      if (attempt === 0) await (options.sleep || sleep)(RETRY_DELAY_MS);
    }
  }
  if (
    !options.allowLocalFallback ||
    typeof itemApi?.addFromPath !== "function"
  ) {
    throw urlError;
  }

  /** @type {string|undefined} */
  let temporaryDirectory;
  const tempFs = options.tempFs || fs.promises;
  try {
    temporaryDirectory = await tempFs.mkdtemp(
      path.join(os.tmpdir(), "eagle-pinterest-"),
    );
    const extension = path.extname(new URL(imageUrl).pathname).toLowerCase();
    const temporaryFile = path.join(temporaryDirectory, `image${extension}`);
    await (options.download || downloadImage)(imageUrl, temporaryFile);
    const itemId = requireItemId(
      await itemApi.addFromPath(temporaryFile, importOptions),
    );
    return await finishImport(itemId);
  } catch (cause) {
    throw new EagleImportError(
      "LOCAL_IMPORT_FAILED",
      pinId,
      "Eagle temporary-file import failed",
      cause,
    );
  } finally {
    if (temporaryDirectory) {
      try {
        await tempFs.rm(temporaryDirectory, {
          recursive: true,
          force: true,
        });
      } catch (_cleanupError) {
        // Best-effort cleanup must preserve the imported item result or the
        // original EagleImportError, so callers cannot mistake it for failure.
      }
    }
  }
}

module.exports = { getCurrentTargetFolderIds, importPin, EagleImportError };

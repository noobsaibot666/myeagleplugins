"use strict";

const { validateImportMessage, normalizeImageUrl } = require("./pinterest-bridge");

/**
 * Pinterest's web client pages search results through its own JSON search
 * resource. Running that same request inside the signed-in webview reuses the
 * user's session (no credentials ever reach the plugin) and returns ranked
 * Pins with every image size and exact dimensions, so the native grid can
 * reserve space before images load and paginate without scrolling a hidden page.
 */

const END_BOOKMARK = "-end-";

/** @param {unknown} value */
function cleanText(value) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

/**
 * Script executed in the Pinterest page. It only returns a compact,
 * data-only projection of each Pin.
 * @param {string} query @param {string|null} [bookmark]
 */
function getSearchApiScript(query, bookmark = null) {
  return `(async () => {
    const query = ${JSON.stringify(String(query || "").trim())};
    const bookmark = ${JSON.stringify(typeof bookmark === "string" && bookmark ? bookmark : null)};
    const sourceUrl = "/search/pins/?q=" + encodeURIComponent(query) + "&rs=typed";
    const data = { options: { query, scope: "pins", rs: "typed", bookmarks: bookmark ? [bookmark] : [] }, context: {} };
    const url = "/resource/BaseSearchResource/get/?source_url=" + encodeURIComponent(sourceUrl) + "&data=" + encodeURIComponent(JSON.stringify(data));
    const pick = (image) => image && typeof image.url === "string" ? { url: image.url, width: Number(image.width) || 0, height: Number(image.height) || 0 } : null;
    try {
      const response = await fetch(url, { credentials: "include", headers: { Accept: "application/json, text/javascript, */*; q=0.01", "X-Requested-With": "XMLHttpRequest" } });
      if (!response.ok) return { ok: false, status: response.status };
      const json = await response.json();
      const resource = (json && json.resource_response) || {};
      const payload = resource.data || {};
      const list = Array.isArray(payload.results) ? payload.results : Array.isArray(payload) ? payload : [];
      const pins = [];
      for (const pin of list) {
        if (!pin || pin.type !== "pin" || pin.is_promoted || !pin.images) continue;
        pins.push({
          id: String(pin.id || ""),
          images: { "236x": pick(pin.images["236x"]), "474x": pick(pin.images["474x"]), "736x": pick(pin.images["736x"]), orig: pick(pin.images.orig) },
          title: typeof pin.title === "string" ? pin.title : "",
          gridTitle: typeof pin.grid_title === "string" ? pin.grid_title : "",
          description: typeof pin.description === "string" ? pin.description : "",
          altText: typeof pin.auto_alt_text === "string" ? pin.auto_alt_text : "",
          author: (pin.pinner && (pin.pinner.full_name || pin.pinner.username)) || "",
          isVideo: Boolean(pin.videos) || pin.is_video === true,
        });
      }
      return {
        ok: resource.status === undefined || resource.status === "success",
        status: response.status,
        bookmark: typeof resource.bookmark === "string" ? resource.bookmark : null,
        pins,
        authenticated: /(^|;\\s*)_auth=1/.test(document.cookie || ""),
      };
    } catch (error) {
      return { ok: false, status: 0, error: String(error && error.message || error) };
    }
  })()`;
}

/** @param {unknown} value */
function normalizeApiPin(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = /** @type {Record<string, any>} */ (value);
  const id = typeof raw.id === "string" ? raw.id : "";
  if (!/^[1-9]\d*$/.test(id)) return null;
  const images = raw.images && typeof raw.images === "object" ? raw.images : {};
  const at = (key) => (images[key] && typeof images[key].url === "string" ? images[key] : null);
  const preview = at("474x") || at("736x") || at("236x") || at("orig");
  const large = at("736x") || at("orig") || preview;
  if (!preview || !large) return null;
  const title = cleanText(raw.title) || cleanText(raw.gridTitle) || cleanText(raw.altText);
  const pin = validateImportMessage({
    pinId: id,
    pinUrl: `https://www.pinterest.com/pin/${id}/`,
    imageUrl: large.url,
    imageVariants: {
      "1200x": large.url,
      ...(at("orig") ? { original: at("orig").url } : {}),
      ...(at("474x") ? { "600x": at("474x").url } : {}),
    },
    title,
    description: cleanText(raw.description) || (title === cleanText(raw.altText) ? "" : cleanText(raw.altText)),
    author: cleanText(raw.author),
    isVideo: raw.isVideo === true,
  });
  if (!pin) return null;
  return {
    ...pin,
    previewUrl: normalizeImageUrl(preview.url) || pin.imageUrl,
    width: Number(preview.width) || Number(large.width) || 0,
    height: Number(preview.height) || Number(large.height) || 0,
  };
}

/**
 * @param {unknown} payload
 * @returns {{ok: boolean, status: number, results: ReturnType<typeof normalizeApiPin>[], bookmark: string|null, done: boolean, rawCount: number, authenticated: boolean}}
 */
function parseSearchApiResult(payload) {
  const input = payload && typeof payload === "object" ? /** @type {Record<string, any>} */ (payload) : {};
  const pins = Array.isArray(input.pins) ? input.pins : [];
  const results = pins.map(normalizeApiPin).filter(Boolean);
  const bookmark = typeof input.bookmark === "string" && input.bookmark && input.bookmark !== END_BOOKMARK ? input.bookmark : null;
  return {
    ok: input.ok === true,
    status: Number(input.status) || 0,
    results,
    bookmark,
    done: !bookmark,
    rawCount: pins.length,
    // Signed-out sessions only receive obfuscated (non-numeric) Pin IDs.
    authenticated: input.authenticated === true || results.length > 0,
  };
}

module.exports = { getSearchApiScript, normalizeApiPin, parseSearchApiResult, END_BOOKMARK };

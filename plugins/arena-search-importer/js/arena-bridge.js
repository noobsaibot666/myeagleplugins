/* global URL, setTimeout, clearTimeout */
"use strict";

const https = require("node:https");

/** @typedef {Partial<Record<"display"|"large"|"original"|"thumb", string>>} ImageVariants */
/**
 * @typedef {{pinId: string, pinUrl: string, imageUrl: string, previewUrl: string, imageVariants: ImageVariants,
 *   title: string, description: string, author: string, kind: string, channelTitle: string, channelSlug: string,
 *   caption: string, matchText: string, isVideo: boolean, score?: number}} ArenaResult
 */
/** @typedef {{slug: string, title: string, length: number, owner: string, score: number}} ArenaChannel */

const API_ROOT = "https://api.are.na/v2";
const USER_AGENT = "Eagle Are.na Search Importer/0.4 (+https://github.com/noobsaibot666/myeagleplugins)";
const REQUEST_TIMEOUT_MS = 15000;
const IMAGE_CLASSES = new Set(["Image", "Attachment"]);
const PREVIEW_CLASSES = new Set(["Link", "Media"]);

const MIN_REQUEST_INTERVAL_MS = 600;
let requestChain = Promise.resolve();

/** Serialize and space out API calls so normal browsing stays under Are.na's anonymous rate limit. */
function requestJson(url) {
  const run = requestChain.then(() => rawRequestJson(url));
  requestChain = run.catch(() => {}).then(() => new Promise((resolve) => setTimeout(resolve, MIN_REQUEST_INTERVAL_MS)));
  return run;
}

function rawRequestJson(url) {
  return new Promise((resolve, reject) => {
    const request = https.get(url, { headers: { Accept: "application/json", "User-Agent": USER_AGENT } }, (response) => {
      let body = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => { body += chunk; });
      response.on("end", () => {
        clearTimeout(timer);
        resolve({
          ok: response.statusCode >= 200 && response.statusCode < 300,
          status: response.statusCode || 0,
          retryAfter: Number(response.headers["retry-after"]) || 0,
          async json() { return JSON.parse(body); },
        });
      });
    });
    const timer = setTimeout(() => request.destroy(new Error("Are.na did not respond in time")), REQUEST_TIMEOUT_MS);
    request.once("error", (error) => { clearTimeout(timer); reject(error); });
  });
}

/** @param {unknown} value @returns {string|null} */
function normalizeImageUrl(value) {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.port)
      return null;
    if (!/(^|\.)images\.are\.na$/.test(url.hostname) && !/(^|\.)cloudfront\.net$/.test(url.hostname)) return null;
    url.hash = "";
    return url.href;
  } catch (_error) {
    return null;
  }
}

/** Search responses use `{url}` objects for image variants; channel contents use plain strings. */
function variantUrl(value) {
  return normalizeImageUrl(typeof value === "string" ? value : value?.url);
}

/** @param {unknown} value @returns {string} */
function text(value) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

/** Titles like "IMG_2041.jpg" or "9bb2ad0ac6dab...jpg" carry no meaning. */
function isFilenameTitle(value) {
  const title = text(value);
  if (!title) return true;
  if (/\.(?:jpe?g|png|gif|webp|avif|heic|tiff?|bmp)(?:[_?~-].*)?$/i.test(title)) return true;
  if (/^(?:untitled|image|photo|picture)$/i.test(title)) return true;
  return /^[a-f0-9_-]{16,}$/i.test(title) || /^(?:img|dsc|image|screenshot|photo)[\s_-]*\d+/i.test(title);
}

/** Lowercased word tokens with light suffix stemming ("chairs" ≈ "chair", "brutalist" ≈ "brutalism"). */
function stem(word) {
  return word
    .replace(/(?:ism|ist|ists|isms)$/, "")
    .replace(/(?:ies)$/, "y")
    .replace(/(?:es|s)$/, (suffix, offset) => (offset > 3 ? "" : suffix));
}

function searchTokens(query) {
  return [...new Set((String(query || "").toLowerCase().match(/[\p{L}\p{N}]+/gu) || []).map(stem).filter(Boolean))];
}

/** Fraction of query tokens present (as word prefixes) in `value`. */
function matchRatio(value, tokens) {
  if (!tokens.length) return 1;
  const rawWords = String(value || "").toLowerCase().match(/[\p{L}\p{N}]+/gu) || [];
  const words = new Set(rawWords.map(stem));
  // Compound words written apart ("ski-ergs", "ski erg") still match "skierg".
  const joined = rawWords.join("");
  let hits = 0;
  for (const token of tokens) {
    if (token.length >= 5 && joined.includes(token)) { hits++; continue; }
    for (const word of words) {
      if (word === token || (token.length >= 3 && word.startsWith(token)) || (word.length >= 4 && token.startsWith(word))) { hits++; break; }
    }
  }
  return hits / tokens.length;
}

/**
 * @param {unknown} value
 * @param {{channel?: {title?: string, slug?: string}|null, includePreviews?: boolean}} [context]
 * @returns {ArenaResult|null}
 */
function normalizeArenaBlock(value, context = {}) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const block = /** @type {Record<string, any>} */ (value);
  const id = Number(block.id);
  if (!Number.isInteger(id) || id < 1 || !block.image) return null;
  const kind = text(block.class) || "Image";
  if (!IMAGE_CLASSES.has(kind) && !(context.includePreviews && PREVIEW_CLASSES.has(kind))) return null;
  if (kind === "Attachment" && !/^image\//i.test(text(block.image.content_type) || "image/")) return null;
  /** @type {ImageVariants} */
  const imageVariants = {};
  for (const key of ["display", "large", "original", "thumb"]) {
    const url = variantUrl(block.image[key]);
    if (url) imageVariants[key] = url;
  }
  const imageUrl = imageVariants.large || imageVariants.display || imageVariants.original || imageVariants.thumb;
  if (!imageUrl) return null;
  const rawTitle = text(block.title) || text(block.generated_title);
  const title = isFilenameTitle(rawTitle) ? "" : rawTitle;
  const channelTitle = text(context.channel?.title);
  return {
    pinId: String(id),
    pinUrl: `https://www.are.na/block/${id}`,
    imageUrl,
    previewUrl: imageVariants.display || imageUrl,
    imageVariants,
    title,
    description: text(block.description),
    author: text(block.user?.full_name || block.user?.username || block.user?.slug),
    kind,
    channelTitle,
    channelSlug: text(context.channel?.slug),
    caption: title || channelTitle,
    // Filename titles aren't shown, but their words ("ski-ergs.jpg") still count for matching.
    matchText: [rawTitle, text(block.description), text(block.source?.title)].filter(Boolean).join(" "),
    isVideo: false,
  };
}

/** @param {unknown} value @param {string[]} tokens @returns {ArenaChannel|null} */
function normalizeChannel(value, tokens) {
  if (!value || typeof value !== "object") return null;
  const channel = /** @type {Record<string, any>} */ (value);
  const slug = text(channel.slug);
  const title = text(channel.title).replace(/^[\p{Extended_Pictographic}\s]+/u, "");
  const length = Number(channel.length) || 0;
  if (!slug || !/^[a-z0-9-]+$/i.test(slug) || !title || length < 3 || channel.status === "private") return null;
  const ratio = matchRatio(title, tokens);
  // Multi-word queries also accept channels matching at least half the terms, ranked lower.
  if (ratio < (tokens.length >= 2 ? 0.5 : 1)) return null;
  const exact = title.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim() === tokens.join(" ");
  return {
    slug,
    title,
    length,
    owner: text(channel.user?.full_name || channel.user?.username),
    score: ratio * 100 + (exact ? 25 : 0) + Math.min(30, Math.log2(length + 1) * 4),
  };
}

function scoreResult(result, tokens, channelScore = 0) {
  const titleRatio = matchRatio(result.matchText || `${result.title} ${result.description}`, tokens);
  return (channelScore ? 40 + channelScore * 0.4 : 0) + titleRatio * 60 + (IMAGE_CLASSES.has(result.kind) ? 10 : 0) + (result.title ? 4 : 0);
}

function buildSearchUrl(query, page = 1, per = 20) {
  const url = new URL(`${API_ROOT}/search`);
  url.searchParams.set("q", query.trim());
  url.searchParams.set("page", String(Math.max(1, Math.floor(page))));
  url.searchParams.set("per", String(Math.min(20, Math.max(1, Math.floor(per)))));
  return url.href;
}

function buildChannelUrl(slug, page = 1, per = 24) {
  const url = new URL(`${API_ROOT}/channels/${encodeURIComponent(slug)}/contents`);
  url.searchParams.set("page", String(Math.max(1, Math.floor(page))));
  url.searchParams.set("per", String(Math.min(50, Math.max(1, Math.floor(per)))));
  return url.href;
}

function buildChannelSearchUrl(query, per = 20) {
  const url = new URL(`${API_ROOT}/search/channels`);
  url.searchParams.set("q", query.trim());
  url.searchParams.set("per", String(Math.min(40, Math.max(1, Math.floor(per)))));
  return url.href;
}

/** Channels whose titles match the query, best first. */
async function searchChannels(query, fetchImpl = requestJson, tokens = searchTokens(query)) {
  const payload = await getJson(fetchImpl, buildChannelSearchUrl(query));
  return (Array.isArray(payload?.channels) ? payload.channels : [])
    .map((channel) => normalizeChannel(channel, tokens))
    .filter(Boolean)
    .sort((a, b) => b.score - a.score);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function getJson(fetchImpl, url, { retries = 2, baseDelayMs = 2500 } = {}) {
  let response = await fetchImpl(url);
  // Back off and retry when Are.na rate-limits instead of surfacing an error immediately.
  for (let attempt = 1; response.status === 429 && attempt <= retries; attempt++) {
    const wait = (Number(response.retryAfter) * 1000) || baseDelayMs * attempt;
    if (wait > 15000) break; // a long cooldown: tell the user instead of hanging
    await sleep(wait);
    response = await fetchImpl(url);
  }
  if (response.status === 429) {
    const seconds = Math.ceil(Number(response.retryAfter) || 0);
    throw new Error(`Are.na is rate limiting requests${seconds ? ` — try again in ${seconds >= 90 ? `${Math.ceil(seconds / 60)} min` : `${seconds} s`}` : ". Wait a moment, then try again"}.`);
  }
  if (!response.ok) throw new Error(`Are.na returned HTTP ${response.status}`);
  return response.json();
}

/** One page of Are.na's mixed search: image blocks matching all terms plus matching channels. */
async function searchArena(query, page = 1, per = 20, fetchImpl = requestJson, options = {}) {
  if (!query?.trim()) throw new Error("Enter an Are.na search term.");
  if (typeof fetchImpl !== "function") throw new Error("Are.na search is unavailable in this Eagle version.");
  const payload = await getJson(fetchImpl, buildSearchUrl(query, page, per));
  const tokens = searchTokens(query);
  const results = (Array.isArray(payload?.blocks) ? payload.blocks : [])
    .map((block) => normalizeArenaBlock(block, { includePreviews: options.includePreviews }))
    .filter(Boolean)
    .filter((block) => matchRatio(`${block.matchText} ${block.author}`, tokens) >= (options.minMatch ?? 1))
    .map((block) => ({ ...block, score: scoreResult(block, tokens) }));
  const channels = (Array.isArray(payload?.channels) ? payload.channels : []).map((channel) => normalizeChannel(channel, tokens)).filter(Boolean);
  const currentPage = Number(payload?.current_page) || page;
  const totalPages = Number(payload?.total_pages) || page;
  return { results, channels, currentPage, totalPages, hasMore: currentPage < totalPages };
}

/**
 * A paginated search session. Each `next()` call returns a ranked batch that
 * mixes direct block matches with contents of the best-matching channels:
 * on Are.na the meaningful images usually live in curated channels whose
 * blocks are titled only by filename, so block search alone misses them.
 * @param {string} query
 * @param {{fetchImpl?: (url: string) => Promise<any>, channelLimit?: number, perChannelPage?: number, maxSearchPages?: number, includePreviews?: boolean, channel?: {slug: string, title: string}|null}} [options]
 */
function createArenaSearch(query, options = {}) {
  const fetchImpl = options.fetchImpl || requestJson;
  const tokens = searchTokens(query);
  const channelLimit = options.channelLimit ?? 8;
  const perChannelPage = options.perChannelPage ?? 24;
  const maxSearchPages = options.maxSearchPages ?? 12;
  const includePreviews = options.includePreviews === true;
  /** @type {(ArenaChannel & {page: number, done: boolean, loading?: boolean})[]} */
  const channels = [];
  const seenIds = new Set();
  const seenImages = new Set();
  let searchPage = 0;
  let searchDone = Boolean(options.channel);
  let channelSearchDone = Boolean(options.channel);
  let cursor = 0;

  if (options.channel) channels.push({ slug: options.channel.slug, title: options.channel.title, length: 0, owner: "", score: 100, page: 0, done: false });

  const addChannels = (list) => {
    for (const channel of list) {
      if (channels.length >= channelLimit) break;
      if (channels.some((known) => known.slug === channel.slug)) continue;
      channels.push({ ...channel, page: 0, done: false });
    }
    channels.sort((a, b) => b.score - a.score);
  };

  const accept = (result) => {
    if (seenIds.has(result.pinId) || seenImages.has(result.imageUrl)) return false;
    seenIds.add(result.pinId);
    seenImages.add(result.imageUrl);
    return true;
  };

  async function loadSearchPage() {
    searchPage++;
    const page = await searchArena(query, searchPage, 20, fetchImpl, { includePreviews });
    if (!page.hasMore || searchPage >= maxSearchPages) searchDone = true;
    addChannels(page.channels);
    return page.results;
  }

  async function loadChannelPage() {
    const open = channels.filter((channel) => !channel.done && !channel.loading);
    if (!open.length) return [];
    const channel = open[cursor++ % open.length];
    channel.page++;
    channel.loading = true;
    try {
      return await fetchChannelPage(channel);
    } finally {
      channel.loading = false;
    }
  }

  async function fetchChannelPage(channel) {
    const payload = await getJson(fetchImpl, buildChannelUrl(channel.slug, channel.page, perChannelPage));
    const contents = Array.isArray(payload?.contents) ? payload.contents : [];
    if (contents.length < perChannelPage) channel.done = true;
    return contents
      .map((block) => normalizeArenaBlock(block, { channel, includePreviews }))
      .filter(Boolean)
      .map((block) => ({ ...block, score: scoreResult(block, tokens, channel.score) }));
  }

  async function next() {
    /** @type {ArenaResult[]} */
    let batch = [];
    /** @type {Error|null} */
    let failure = null;
    let notice = "";
    const settle = async (loaders) => {
      for (const outcome of await Promise.allSettled(loaders.map((loader) => loader()))) {
        if (outcome.status === "fulfilled") batch = batch.concat(outcome.value || []);
        else failure = outcome.reason;
      }
    };
    const firstBatch = searchPage === 0 && !channelSearchDone;
    if (firstBatch && !options.channel) {
      // Block search and channel search run together so curated channels are known up front.
      await settle([loadSearchPage, async () => { addChannels(await searchChannels(query, fetchImpl, tokens)); return []; }]);
      channelSearchDone = true;
      if (!channels.length && !batch.length && tokens.length > 1) {
        // Nothing matches every term: fall back to the most specific single term, and say so.
        // Try the most specific terms first; use the first one that finds anything.
        const terms = [...new Set(String(query).toLowerCase().match(/[\p{L}\p{N}]+/gu) || [])].filter((term) => term.length >= 3).sort((a, b) => b.length - a.length);
        for (const term of terms) {
          const [blocks, related] = await Promise.allSettled([
            searchArena(term, 1, 20, fetchImpl, { includePreviews }),
            searchChannels(term, fetchImpl, searchTokens(term)),
          ]);
          if (blocks.status === "fulfilled") batch = batch.concat(blocks.value.results);
          else failure = blocks.reason;
          if (related.status === "fulfilled") addChannels(related.value);
          else failure = related.reason;
          if (batch.length || channels.length) {
            notice = `No Are.na images match every term of “${query.trim()}”. Showing results for “${term}”.`;
            break;
          }
        }
      }
      await settle([loadChannelPage, loadChannelPage]);
    } else {
      await settle([...(searchDone ? [] : [loadSearchPage]), loadChannelPage]);
    }
    const results = batch.filter(accept).sort((a, b) => b.score - a.score);
    if (!results.length && failure) throw failure;
    return { results, hasMore: hasMore(), channels: getChannels(), notice };
  }

  function hasMore() {
    return !searchDone || channels.some((channel) => !channel.done);
  }

  function getChannels() {
    return channels.map(({ slug, title, length }) => ({ slug, title, length }));
  }

  return { next, hasMore, getChannels, tokens };
}

module.exports = {
  normalizeImageUrl,
  normalizeArenaBlock,
  normalizeChannel,
  buildSearchUrl,
  buildChannelUrl,
  buildChannelSearchUrl,
  searchArena,
  searchChannels,
  createArenaSearch,
  searchTokens,
  matchRatio,
  isFilenameTitle,
};

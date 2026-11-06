/* global URL */
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  normalizeImageUrl,
  normalizeArenaBlock,
  normalizeChannel,
  buildSearchUrl,
  buildChannelUrl,
  searchArena,
  createArenaSearch,
  searchTokens,
  matchRatio,
  isFilenameTitle,
} = require("../js/arena-bridge");

const block = {
  id: 123,
  class: "Image",
  title: "Green room",
  description: "A reference image",
  user: { full_name: "Alan" },
  image: {
    display: { url: "https://images.are.na/display/green.png?x=1" },
    original: { url: "https://d2w9rnfcy7mm78.cloudfront.net/123/original_green.png" },
  },
};

const image = (id, title, extra = {}) => ({
  id,
  class: "Image",
  title,
  image: { display: `https://images.are.na/d/${id}.jpg`, large: `https://images.are.na/l/${id}.jpg`, original: `https://d2w9rnfcy7mm78.cloudfront.net/${id}/original_${id}.jpg?1?bc=0` },
  ...extra,
});

/** Fake Are.na API keyed by path. */
function fakeApi(routes) {
  const calls = [];
  const fetchImpl = async (href) => {
    const url = new URL(href);
    calls.push(`${url.pathname}?${url.searchParams}`);
    const key = Object.keys(routes).find((route) => `${url.pathname}?${url.searchParams}`.includes(route));
    if (!key) return { ok: true, status: 200, async json() { return { channels: [], blocks: [], contents: [], current_page: 1, total_pages: 1 }; } };
    const body = routes[key];
    if (body.status) return { ok: false, status: body.status, retryAfter: 0.001, async json() { return {}; } };
    return { ok: true, status: 200, async json() { return body; } };
  };
  return { fetchImpl, calls };
}

test("normalizes Are.na image hosts and rejects unsafe URLs", () => {
  assert.equal(normalizeImageUrl(block.image.display.url), "https://images.are.na/display/green.png?x=1");
  assert.equal(normalizeImageUrl("http://images.are.na/image.png"), null);
  assert.equal(normalizeImageUrl("https://example.com/image.png"), null);
});

test("normalizes search ({url}) and channel (string) image variants into result metadata", () => {
  const result = normalizeArenaBlock(block);
  assert.equal(result.pinId, "123");
  assert.equal(result.pinUrl, "https://www.are.na/block/123");
  assert.equal(result.imageUrl, "https://images.are.na/display/green.png?x=1");
  assert.equal(result.imageVariants.original, "https://d2w9rnfcy7mm78.cloudfront.net/123/original_green.png");
  assert.equal(result.title, "Green room");
  assert.equal(result.author, "Alan");

  const fromChannel = normalizeArenaBlock(image(7, "4ccb71a5e40b7779f8a026be280a2c96.jpg"), { channel: { title: "Brutalist Architecture", slug: "brutalist-architecture" } });
  assert.equal(fromChannel.imageUrl, "https://images.are.na/l/7.jpg");
  assert.equal(fromChannel.previewUrl, "https://images.are.na/d/7.jpg");
  assert.equal(fromChannel.title, "", "filename titles are dropped");
  assert.equal(fromChannel.caption, "Brutalist Architecture");
  assert.equal(fromChannel.channelSlug, "brutalist-architecture");
});

test("link, media and text blocks are excluded unless previews are requested", () => {
  const link = { ...image(8, "10 Bold Icons of Brutalist Architecture"), class: "Link" };
  assert.equal(normalizeArenaBlock(link), null);
  assert.equal(normalizeArenaBlock(link, { includePreviews: true }).kind, "Link");
  assert.equal(normalizeArenaBlock({ id: 9, class: "Text", title: "Notes", image: null }), null);
  assert.equal(normalizeArenaBlock({ ...image(10, "Spec"), class: "Attachment", image: { ...image(10).image, content_type: "application/pdf" } }), null);
});

test("filename-like titles carry no meaning", () => {
  for (const title of ["IMG_2041", "dmv3hjuvaaw52yz.jpg_large", "tadanori-yokoo-8.jpg?w=1100-ssl=1", "9bb2ad0ac6dabee8434eb3ea0373809e", "Untitled", ""]) {
    assert.equal(isFilenameTitle(title), true, title);
  }
  assert.equal(isFilenameTitle("View of the courtyard in the Barbican"), false);
});

test("tokens are lightly stemmed so related word forms match", () => {
  assert.deepEqual(searchTokens("Red Chairs"), ["red", "chair"]);
  assert.equal(matchRatio("Brutalism in Europe", searchTokens("brutalist")), 1);
  assert.equal(matchRatio("Japanese Graphic Design", searchTokens("japanese typography")), 0.5);
  assert.equal(matchRatio("Japanese cooking", searchTokens("male crossfit")), 0);
});

test("channels rank full title matches with more content first and drop weak matches", () => {
  const tokens = searchTokens("brutalist architecture");
  const big = normalizeChannel({ slug: "canadian-brutalist", title: "🎨 Canadian Brutalist Architecture", length: 58 }, tokens);
  const exact = normalizeChannel({ slug: "brutalist-architecture", title: "Brutalist Architecture", length: 14 }, tokens);
  const partial = normalizeChannel({ slug: "concrete-architecture", title: "Concrete architecture", length: 300 }, tokens);
  assert.equal(big.title, "Canadian Brutalist Architecture");
  assert.ok(exact.score > partial.score);
  assert.ok(big.score > partial.score);
  assert.equal(normalizeChannel({ slug: "tiny", title: "Brutalist architecture", length: 1 }, tokens), null);
  assert.equal(normalizeChannel({ slug: "cooking", title: "Cooking", length: 40 }, tokens), null);
});

test("builds paginated Are.na search and channel URLs", () => {
  assert.equal(buildSearchUrl(" green room ", 3), "https://api.are.na/v2/search?q=green+room&page=3&per=20");
  assert.equal(buildChannelUrl("green-rooms", 2), "https://api.are.na/v2/channels/green-rooms/contents?page=2&per=24");
});

test("block search keeps only image blocks whose metadata matches every term", async () => {
  const relevant = { ...block, id: 10, title: "Male CrossFit training" };
  const unrelated = { ...block, id: 11, title: "Japanese cooking at home" };
  const { fetchImpl } = fakeApi({ "/v2/search?": { current_page: 1, total_pages: 4, blocks: [relevant, unrelated, { id: 4, title: "Text", image: null }], channels: [] } });
  const result = await searchArena("male crossfit", 1, 20, fetchImpl);
  assert.deepEqual(result.results.map((item) => item.pinId), ["10"]);
  assert.equal(result.hasMore, true);
});

test("a search session mixes direct matches with curated channel contents, best first, without duplicates", async () => {
  const { fetchImpl, calls } = fakeApi({
    "/v2/search?q": { current_page: 1, total_pages: 1, blocks: [image(1, "Brutalist architecture in Paris"), image(2, "Random")], channels: [] },
    "/v2/search/channels": { channels: [
      { slug: "brutalist-architecture", title: "Brutalist Architecture", length: 30 },
      { slug: "cooking", title: "Cooking", length: 90 },
    ] },
    "/v2/channels/brutalist-architecture/contents?page=1": { contents: [image(1, "dupe"), image(3, "a8f0c0d1e2f3a4b5c6d7e8f9.jpg"), image(4, "Barbican"), { id: 5, class: "Text", content: "hi" }] },
  });
  const session = createArenaSearch("brutalist architecture", { fetchImpl, perChannelPage: 24 });
  const batch = await session.next();
  assert.deepEqual(batch.results.map((item) => item.pinId).sort(), ["1", "3", "4"]);
  assert.equal(batch.results.find((item) => item.pinId === "3").caption, "Brutalist Architecture");
  assert.deepEqual(batch.channels.map((channel) => channel.slug), ["brutalist-architecture"]);
  assert.equal(batch.hasMore, false, "short channel page and single search page end the session");
  assert.ok(calls.some((call) => call.startsWith("/v2/search/channels")));
});

test("a session falls back to the most specific term when nothing matches every term", async () => {
  const { fetchImpl } = fakeApi({
    "/v2/search?q": { current_page: 1, total_pages: 1, blocks: [image(1, "BLDGBLOG")], channels: [] },
    "/v2/search/channels?q=male+crossfit": { channels: [] },
    "/v2/search/channels?q=crossfit": { channels: [{ slug: "crossfit", title: "crossfit", length: 12 }] },
    "/v2/channels/crossfit/contents": { contents: [image(20, "crossfit"), image(21, "Box jump")] },
  });
  const batch = await createArenaSearch("male crossfit", { fetchImpl }).next();
  assert.match(batch.notice, /crossfit/);
  assert.deepEqual(batch.results.map((item) => item.pinId).sort(), ["20", "21"]);
});

test("a channel-only session pages that channel and reports rate limiting clearly", async () => {
  const { fetchImpl, calls } = fakeApi({ "/v2/channels/red-chairs/contents": { status: 429 } });
  const session = createArenaSearch("red chair", { fetchImpl, channel: { slug: "red-chairs", title: "Red Chairs" } });
  await assert.rejects(session.next(), /rate limiting/);
  assert.equal(calls.length, 3, "two backed-off retries before giving up");
  assert.match(calls[0], /^\/v2\/channels\/red-chairs\/contents/);
});

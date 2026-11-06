"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { normalizeImageUrl, normalizeArenaBlock, buildSearchUrl, searchArena } = require("../js/arena-bridge");

const block = {
  id: 123,
  title: "Green room",
  description: "A reference image",
  user: { name: "Alan" },
  image: {
    display: { url: "https://images.are.na/display/green.png?x=1" },
    original: { url: "https://d2w9rnfcy7mm78.cloudfront.net/123/original_green.png" },
  },
};

test("normalizes Are.na image hosts and rejects unsafe URLs", () => {
  assert.equal(normalizeImageUrl(block.image.display.url), "https://images.are.na/display/green.png?x=1");
  assert.equal(normalizeImageUrl("http://images.are.na/image.png"), null);
  assert.equal(normalizeImageUrl("https://example.com/image.png"), null);
});

test("normalizes image blocks into Eagle result metadata", () => {
  assert.deepEqual(normalizeArenaBlock(block), {
    pinId: "123",
    pinUrl: "https://www.are.na/block/123",
    imageUrl: "https://images.are.na/display/green.png?x=1",
    imageVariants: {
      display: "https://images.are.na/display/green.png?x=1",
      original: "https://d2w9rnfcy7mm78.cloudfront.net/123/original_green.png",
    },
    title: "Green room",
    description: "A reference image",
    author: "Alan",
    isVideo: false,
  });
});

test("builds paginated Are.na search URLs", () => {
  assert.equal(buildSearchUrl(" green room ", 3), "https://api.are.na/v2/search?q=green+room&page=3&per=20");
});

test("searches Are.na and returns only normalized image blocks", async () => {
  const result = await searchArena("green room", 2, 20, async () => ({
    ok: true,
    async json() { return { current_page: 2, total_pages: 4, blocks: [block, { id: 4, title: "Text", image: null }] }; },
  }));
  assert.equal(result.results.length, 1);
  assert.equal(result.currentPage, 2);
  assert.equal(result.hasMore, true);
});

test("searches Are.na with all query terms present in block metadata", async () => {
  const relevant = { ...block, id: 10, title: "Male CrossFit training" };
  const unrelated = { ...block, id: 11, title: "Japanese cooking at home" };
  const result = await searchArena("male crossfit", 1, 20, async () => ({
    ok: true,
    async json() { return { current_page: 1, total_pages: 1, blocks: [relevant, unrelated] }; },
  }));
  assert.deepEqual(result.results.map((item) => item.pinId), ["10"]);
});

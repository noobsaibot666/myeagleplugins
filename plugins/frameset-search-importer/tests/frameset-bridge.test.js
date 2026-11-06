"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  buildSearchUrl,
  normalizeFrameSetResult,
  searchFrameSet,
} = require("../js/frameset-bridge");

const still = {
  id: "716cb8ac-4e93-49e6-8b0f-90de6a1098f3",
  type: "still",
  title: {
    title: "Windrunners",
    href: "/brand/nike/windrunners",
    entity: [{ name: "Nike" }],
  },
  size: { width: 1920, height: 1080, aspect: 16 / 9 },
};

test("builds Frame Set paginated search URLs", () => {
  assert.equal(
    buildSearchUrl(" moody night ", 2),
    "https://frameset.app/api/search?page=2&size=50&search=moody+night",
  );
});

test("normalizes a still into a wide Eagle result", () => {
  assert.deepEqual(normalizeFrameSetResult(still), {
    frameId: "716cb8ac-4e93-49e6-8b0f-90de6a1098f3",
    frameUrl:
      "https://d13mryl9xv19vu.cloudfront.net/716cb8ac-4e93-49e6-8b0f-90de6a1098f3_sm.avif",
    frameVariants: {
      small:
        "https://d13mryl9xv19vu.cloudfront.net/716cb8ac-4e93-49e6-8b0f-90de6a1098f3_sm.avif",
    },
    framePageUrl: "https://frameset.app/brand/nike/windrunners",
    title: "Windrunners",
    brand: "Nike",
    type: "still",
    width: 1920,
    height: 1080,
    aspect: 16 / 9,
  });
});

test("filters motion records and malformed records", () => {
  assert.equal(normalizeFrameSetResult({ ...still, type: "motion" }), null);
  assert.equal(normalizeFrameSetResult({ ...still, id: null }), null);
});

test("returns cursor pagination state", async () => {
  const result = await searchFrameSet("hyrox", 1, 50, async () => ({
    ok: true,
    status: 200,
    async json() {
      return {
        success: true,
        data: {
          results: [still],
          cursor: { hasMore: true, from: 0, size: 50 },
        },
      };
    },
  }));
  assert.equal(result.results.length, 1);
  assert.equal(result.currentPage, 1);
  assert.equal(result.hasMore, true);
});

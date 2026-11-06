"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { dedupeFrameSetResults } = require("../js/native-results");

function frame(id, imageUrl, title) {
  return {
    frameId: id,
    frameUrl: imageUrl,
    frameVariants: { small: imageUrl },
    framePageUrl: "https://frameset.app/search",
    title,
    brand: "Nike",
    type: "still",
    width: 1920,
    height: 1080,
    aspect: 16 / 9,
  };
}

test("deduplicates Frame Set results by frame ID and image URL", () => {
  const results = dedupeFrameSetResults([
    frame("a", "https://img/one.avif", "First"),
    frame("a", "https://img/two.avif", "Duplicate ID"),
    frame("b", "https://img/one.avif", "Duplicate image"),
    frame("c", "https://img/three.avif", "Third"),
  ]);
  assert.deepEqual(results.map((item) => item.frameId), ["a", "c"]);
});

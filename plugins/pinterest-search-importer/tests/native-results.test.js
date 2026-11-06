"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { normalizePinterestResult, dedupePinterestResults } = require("../js/native-results.js");

const pin = {
  pinId: "123",
  pinUrl: "https://www.pinterest.com/pin/123/",
  imageUrl: "https://i.pinimg.com/1200x/aa/bb/image.jpg?foo=bar",
  title: "Kitchen",
  description: "Green tiles",
  author: "Studio",
  isVideo: false,
};

test("normalizes a safe Pinterest result and keeps useful metadata", () => {
  assert.deepEqual(normalizePinterestResult(pin), {
    ...pin,
    imageUrl: "https://i.pinimg.com/1200x/aa/bb/image.jpg",
  });
});

test("rejects unsafe result URLs", () => {
  assert.equal(normalizePinterestResult({ ...pin, imageUrl: "https://evil.test/image.jpg" }), null);
  assert.equal(normalizePinterestResult({ ...pin, pinUrl: "javascript:alert(1)" }), null);
});

test("deduplicates results by Pin ID while preserving order", () => {
  assert.deepEqual(dedupePinterestResults([pin, { ...pin, title: "Updated" }, { ...pin, pinId: "456", pinUrl: "https://www.pinterest.com/pin/456/" }]).map((item) => item.pinId), ["123", "456"]);
});

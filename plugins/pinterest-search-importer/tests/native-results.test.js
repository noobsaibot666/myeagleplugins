"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { normalizePinterestResult, dedupePinterestResults, scoreResult } = require("../js/native-results.js");

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
  assert.deepEqual(dedupePinterestResults([pin, { ...pin, title: "Updated" }, { ...pin, pinId: "456", pinUrl: "https://www.pinterest.com/pin/456/", imageUrl: "https://i.pinimg.com/736x/other.jpg" }]).map((item) => item.pinId), ["123", "456"]);
});

test("removes duplicate image URLs and keeps Pinterest's ranking order stable", () => {
  const results = dedupePinterestResults([
    { ...pin, title: "A room" },
    { ...pin, pinId: "456", pinUrl: "https://www.pinterest.com/pin/456/", imageUrl: "https://i.pinimg.com/736x/other.jpg", title: "Green kitchen" },
    { ...pin, pinId: "999", pinUrl: "https://www.pinterest.com/pin/999/", imageUrl: "https://i.pinimg.com/1200x/aa/bb/image.jpg" },
    { ...pin, pinId: "789", pinUrl: "https://www.pinterest.com/pin/789/", imageUrl: "https://i.pinimg.com/736x/another.jpg", title: "Kitchen" },
  ], "green kitchen");
  assert.deepEqual(results.map((item) => item.pinId), ["123", "456", "789"]);
  assert.ok(scoreResult(results[1], "green kitchen") > scoreResult(results[2], "green kitchen"));
});

test("keeps preview URLs and dimensions for layout reservation", () => {
  const [result] = dedupePinterestResults([{ ...pin, previewUrl: "https://i.pinimg.com/474x/aa/bb/image.jpg", width: 474, height: 700 }]);
  assert.equal(result.previewUrl, "https://i.pinimg.com/474x/aa/bb/image.jpg");
  assert.equal(result.width, 474);
  assert.equal(result.height, 700);
  assert.equal(dedupePinterestResults([{ ...pin, previewUrl: "https://evil.test/a.jpg" }])[0].previewUrl, undefined);
});

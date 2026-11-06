"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { dedupePinterestResults, scoreResult } = require("../js/native-results");

function block(id, imageUrl, title) {
  return { pinId: String(id), pinUrl: `https://www.are.na/block/${id}`, imageUrl, title, description: "", author: "", isVideo: false };
}

test("removes duplicate image URLs and ranks exact title matches first", () => {
  const results = dedupePinterestResults([
    block(1, "https://images.are.na/one.png", "A room"),
    block(2, "https://images.are.na/two.png", "Green kitchen"),
    block(3, "https://images.are.na/three.png", "Kitchen"),
  ], "green kitchen");
  assert.deepEqual(results.map((item) => item.pinId), ["2", "3", "1"]);
  assert.ok(scoreResult(results[0], "green kitchen") > scoreResult(results[1], "green kitchen"));
});

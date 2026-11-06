"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { importArenaBlock } = require("../js/eagle-importer");

test("imports Are.na images through a temporary local file when Eagle path import is available", async () => {
  const calls = [];
  const eagle = {
    folder: { async getSelected() { return [{ id: "folder-1" }]; } },
    item: { async addFromPath(file, options) { calls.push({ file, options }); return "item-1"; } },
  };
  const tempFs = {
    async mkdtemp(prefix) { return `${prefix}test`; },
    async rm(directory, options) { calls.push({ directory, options }); },
  };
  const result = await importArenaBlock(eagle, {
    pinId: "123",
    pinUrl: "https://www.are.na/block/123",
    imageUrl: "https://images.are.na/display/transformed.jpg",
    imageVariants: { original: "https://d2w9rnfcy7mm78.cloudfront.net/123/original.jpg" },
    title: "Green room",
    description: "Reference",
    author: "Alan",
  }, {
    download: async (url, destination) => calls.push({ url, destination }),
    tempFs,
    settings: { addArenaTag: true, addSearchTag: false },
    searchTerm: "green room",
  });
  assert.equal(result.itemId, "item-1");
  assert.equal(calls[0].url, "https://d2w9rnfcy7mm78.cloudfront.net/123/original.jpg");
  assert.equal(calls[1].options.tags.includes("Are.na"), true);
  assert.equal(calls[2].directory.endsWith("eagle-arena-test"), true);
});

test("imports keep channel context, optional channel tags, and a matching file extension", async () => {
  const { extensionFor } = require("../js/eagle-importer");
  assert.equal(extensionFor("https://d2w9rnfcy7mm78.cloudfront.net/1/original_a.PNG?1?bc=0"), ".png");
  assert.equal(extensionFor("https://images.are.na/eyJidWNrZXQiOiJ"), ".jpg");
  const calls = [];
  const eagle = { item: { async addFromPath(file, options) { calls.push({ file, options }); return "item-2"; } } };
  await importArenaBlock(eagle, {
    pinId: "55",
    pinUrl: "https://www.are.na/block/55",
    imageUrl: "https://images.are.na/l/55",
    imageVariants: { original: "https://d2w9rnfcy7mm78.cloudfront.net/55/original_55.gif?1" },
    title: "",
    channelTitle: "Red Chairs",
    channelSlug: "red-chairs",
  }, {
    folderIds: [],
    download: async () => {},
    tempFs: { async mkdtemp(prefix) { return `${prefix}x`; }, async rm() {} },
    settings: { addArenaTag: true, addSearchTag: false, addChannelTag: true },
  });
  assert.match(calls[0].file, /image\.gif$/);
  assert.equal(calls[0].options.name, "Red Chairs · 55");
  assert.match(calls[0].options.annotation, /Channel: Red Chairs \(https:\/\/www\.are\.na\/channel\/red-chairs\)/);
  assert.deepEqual(calls[0].options.tags, ["Are.na", "Red Chairs"]);
});

"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { getCurrentTargetFolderIds, importFrameSetFrame } = require("../js/eagle-importer");

const frame = {
  frameId: "716cb8ac-4e93-49e6-8b0f-90de6a1098f3",
  frameUrl: "https://d13mryl9xv19vu.cloudfront.net/716cb8ac-4e93-49e6-8b0f-90de6a1098f3_sm.avif",
  framePageUrl: "https://frameset.app/brand/nike/windrunners",
  title: "Windrunners",
  brand: "Nike",
  type: "still",
  width: 1920,
  height: 1080,
  aspect: 16 / 9,
};

test("reads selected Eagle folder IDs and falls back to the library root", async () => {
  assert.deepEqual(await getCurrentTargetFolderIds({ folder: { getSelected: async () => [{ id: "folder-1" }, { id: "" }] } }), ["folder-1"]);
  assert.deepEqual(await getCurrentTargetFolderIds({ folder: { getSelected: async () => { throw new Error("closed"); } } }), []);
});

test("imports a Frame Set still from its URL with metadata", async () => {
  const calls = [];
  const result = await importFrameSetFrame({ item: { addFromURL: async (url, options) => { calls.push({ url, options }); return "item-1"; } } }, frame, { folderIds: ["folder-1"], tags: ["Frame Set"] });
  assert.deepEqual(result, { itemId: "item-1", folderIds: ["folder-1"] });
  assert.equal(calls[0].url, frame.frameUrl);
  assert.equal(calls[0].options.name, "Windrunners");
  assert.equal(calls[0].options.website, frame.framePageUrl);
  assert.deepEqual(calls[0].options.folders, ["folder-1"]);
  assert.match(calls[0].options.annotation, /Nike/);
});

test("falls back to a browser-fetched base64 image after URL import fails", async () => {
  let base64;
  const result = await importFrameSetFrame({ item: {
    addFromURL: async () => { throw new Error("CloudFront challenge"); },
    addFromBase64: async (value) => { base64 = value; return "item-2"; },
  } }, frame, {
    folderIds: [],
    fetchImpl: async () => ({ ok: true, status: 200, headers: { get: () => "image/avif" }, arrayBuffer: async () => Uint8Array.from([1, 2, 3]).buffer }),
  });
  assert.equal(result.itemId, "item-2");
  assert.match(base64, /^data:image\/avif;base64,/);
});

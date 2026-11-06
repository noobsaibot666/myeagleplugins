"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { DEFAULT_SETTINGS, buildImportTags, normalizeSettings } = require("../js/settings");

test("uses conservative Frame Set settings by default", () => {
  assert.deepEqual(normalizeSettings({}), DEFAULT_SETTINGS);
});

test("builds only enabled source and search tags", () => {
  assert.deepEqual(buildImportTags({ addFrameSetTag: true, addSearchTag: true }, "  night exterior "), ["Frame Set", "night exterior"]);
  assert.deepEqual(buildImportTags({ addFrameSetTag: false, addSearchTag: false }, "night"), []);
});

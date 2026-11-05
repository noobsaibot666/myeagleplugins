"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  DEFAULT_SETTINGS,
  SETTINGS_KEY,
  loadSettings,
  saveSettings,
  selectImageVariant,
  buildImportTags,
} = require("../js/settings");

const defaults = {
  imageVariant: "1200x",
  addPinterestTag: true,
  addSearchTag: false,
  openPinAfterImport: false,
};

function storage(initial = null) {
  const values = new Map(initial === null ? [] : [[SETTINGS_KEY, initial]]);
  return {
    values,
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
}

test("settings use the exact conservative defaults and one storage key", () => {
  assert.equal(SETTINGS_KEY, "pinterest-search-importer:settings");
  assert.deepEqual(DEFAULT_SETTINGS, defaults);
  const local = storage();
  const loaded = loadSettings(local);
  assert.deepEqual(loaded, defaults);
  loaded.addSearchTag = true;
  assert.deepEqual(loadSettings(local), defaults);
  assert.equal(local.values.size, 0);
});

test("malformed storage and invalid field types fall back to defaults", () => {
  for (const value of ["{", "null", "[]", "false", '"text"', "42"]) {
    assert.deepEqual(loadSettings(storage(value)), defaults);
  }
  assert.deepEqual(
    loadSettings(
      storage(
        JSON.stringify({
          imageVariant: "originals",
          addPinterestTag: "false",
          addSearchTag: 1,
          openPinAfterImport: {},
        }),
      ),
    ),
    defaults,
  );
  assert.deepEqual(
    loadSettings({
      getItem() {
        throw new Error("denied");
      },
    }),
    defaults,
  );
});

test("settings save and reload each supported image variant and toggle", () => {
  for (const imageVariant of ["1200x", "original", "600x"]) {
    const local = storage();
    const settings = {
      imageVariant,
      addPinterestTag: false,
      addSearchTag: true,
      openPinAfterImport: true,
    };
    assert.equal(saveSettings(local, settings), true);
    assert.deepEqual(loadSettings(local), settings);
    assert.deepEqual([...local.values.keys()], [SETTINGS_KEY]);
  }
  assert.equal(
    saveSettings(
      {
        setItem() {
          throw new Error("full");
        },
      },
      defaults,
    ),
    false,
  );
});

test("save/load allow only preferences, never credentials, Pin content, or images", () => {
  const local = storage();
  const unsafe = {
    ...defaults,
    password: "secret",
    cookies: "session",
    token: "token",
    searchTerm: "private query",
    pinUrl: "https://www.pinterest.com/pin/123/",
    title: "Pin content",
    imageData: "data:image/png;base64,abc",
    history: ["123"],
  };
  saveSettings(local, unsafe);
  assert.deepEqual(JSON.parse(local.values.get(SETTINGS_KEY)), defaults);
  local.values.set(SETTINGS_KEY, JSON.stringify(unsafe));
  assert.deepEqual(loadSettings(local), defaults);
  saveSettings(local, {
    ...unsafe,
    imageVariant: unsafe.imageData,
    addPinterestTag: unsafe.password,
  });
  assert.deepEqual(JSON.parse(local.values.get(SETTINGS_KEY)), defaults);
});

test("image preferences select supplied validated variants without inventing URLs", () => {
  const pin = {
    imageUrl: "https://i.pinimg.com/736x/base.jpg",
    imageVariants: {
      "1200x": "https://i.pinimg.com/1200x/large.jpg",
      original: "https://i.pinimg.com/originals/full.jpg",
      "600x": "https://i.pinimg.com/600x/small.jpg",
    },
  };
  for (const variant of ["1200x", "original", "600x"]) {
    assert.equal(selectImageVariant(pin, variant), pin.imageVariants[variant]);
  }
  assert.equal(
    selectImageVariant({ imageUrl: pin.imageUrl }, "1200x"),
    pin.imageUrl,
  );
  assert.equal(
    selectImageVariant(
      { ...pin, imageVariants: { original: "https://evil.test/image.jpg" } },
      "original",
    ),
    pin.imageUrl,
  );
});

test("tag preferences add only enabled Pinterest and trimmed search-term tags", () => {
  assert.deepEqual(buildImportTags(defaults, " room "), ["Pinterest"]);
  assert.deepEqual(
    buildImportTags(
      { ...defaults, addPinterestTag: false, addSearchTag: true },
      " room ",
    ),
    ["room"],
  );
  assert.deepEqual(
    buildImportTags({ ...defaults, addSearchTag: true }, "Pinterest"),
    ["Pinterest"],
  );
  assert.deepEqual(
    buildImportTags({ ...defaults, addPinterestTag: false }, "room"),
    [],
  );
  assert.deepEqual(buildImportTags({ ...defaults, addSearchTag: true }, "  "), [
    "Pinterest",
  ]);
});

"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const { URL } = require("node:url");
const {
  getCurrentTargetFolderIds,
  importPin,
  EagleImportError,
} = require("../js/eagle-importer");

const pin = {
  pinId: "123456789",
  pinUrl: "https://pinterest.com/pin/123456789/?utm_source=test#detail",
  imageUrl: "https://i.pinimg.com/originals/ab/cd/example.jpg?size=large",
  title: "Interior design",
  description: "A sunny reading corner",
  author: "Jane Designer",
  tags: ["interiors"],
  isVideo: false,
};

function fakeEagle() {
  const calls = [];
  return {
    calls,
    folder: {
      selected: [{ id: "folder-a" }, { id: "folder-b" }],
      async getSelected() {
        return this.selected;
      },
    },
    item: {
      async addFromURL(url, options) {
        calls.push({ url, options });
        return "item-1";
      },
    },
  };
}

const noDelay = async () => {};

test("selected folder IDs are read through Eagle's folder API", async () => {
  const eagle = fakeEagle();
  assert.deepEqual(await getCurrentTargetFolderIds(eagle), [
    "folder-a",
    "folder-b",
  ]);
});

test("no selection or an unavailable folder API uses the library root", async () => {
  const eagle = fakeEagle();
  eagle.folder.selected = [];
  assert.deepEqual(await getCurrentTargetFolderIds(eagle), []);
  eagle.folder.getSelected = async () => {
    throw new Error("Library switching");
  };
  assert.deepEqual(await getCurrentTargetFolderIds(eagle), []);
  for (const api of [
    undefined,
    {},
    { folder: {} },
    { folder: { getSelected: async () => null } },
  ]) {
    assert.deepEqual(await getCurrentTargetFolderIds(api), []);
  }
});

test("imports the supplied image into selected folders with canonical source and metadata", async () => {
  const eagle = fakeEagle();
  const tags = ["Pinterest", "interiors"];
  const result = await importPin(eagle, pin, { tags });
  assert.deepEqual(result, {
    itemId: "item-1",
    folderIds: ["folder-a", "folder-b"],
  });
  assert.equal(eagle.calls.length, 1);
  assert.deepEqual(eagle.calls[0], {
    url: pin.imageUrl,
    options: {
      name: pin.title,
      website: "https://www.pinterest.com/pin/123456789/",
      annotation:
        "Title: Interior design\n\nA sunny reading corner\n\nAuthor: Jane Designer",
      tags: ["interiors", "Pinterest"],
      folders: ["folder-a", "folder-b"],
    },
  });
  assert.deepEqual(tags, ["Pinterest", "interiors"]);
  assert.deepEqual(pin.tags, ["interiors"]);
});

test("supplied folder IDs override live selection, including an explicit root selection", async () => {
  for (const folderIds of [["snapshot-folder"], []]) {
    const eagle = fakeEagle();
    eagle.folder.getSelected = async () =>
      assert.fail("must use supplied folders");
    const result = await importPin(eagle, pin, { folderIds });
    assert.deepEqual(result.folderIds, folderIds);
    assert.deepEqual(eagle.calls[0].options.folders, folderIds);
    assert.notEqual(result.folderIds, folderIds);
  }
});

test("missing title uses the Pin ID and missing metadata/tags stays empty", async () => {
  const eagle = fakeEagle();
  eagle.folder.selected = [];
  const result = await importPin(eagle, {
    pinId: pin.pinId,
    pinUrl: pin.pinUrl,
    imageUrl: pin.imageUrl,
    title: "  ",
  });
  assert.deepEqual(result.folderIds, []);
  assert.equal(eagle.calls[0].options.name, "Pinterest 123456789");
  assert.equal(eagle.calls[0].options.annotation, "");
  assert.deepEqual(eagle.calls[0].options.tags, []);
});

test("URL import retries the same URL exactly once after a short delay", async () => {
  const eagle = fakeEagle();
  const events = [];
  eagle.item.addFromURL = async (url, options) => {
    assert.equal(url, pin.imageUrl);
    eagle.calls.push({ url, options });
    events.push("import");
    if (eagle.calls.length === 1) throw new Error("Temporary failure");
    return "retry-item";
  };
  const result = await importPin(eagle, pin, {
    sleep: async (milliseconds) => {
      assert.ok(milliseconds > 0 && milliseconds <= 1000);
      events.push("delay");
    },
  });
  assert.equal(result.itemId, "retry-item");
  assert.deepEqual(events, ["import", "delay", "import"]);
  assert.deepEqual(eagle.calls[0], eagle.calls[1]);
});

test("exhausted URL retries throw a typed error with the original cause", async () => {
  const eagle = fakeEagle();
  const failure = new Error("Host blocked");
  let attempts = 0;
  eagle.item.addFromURL = async () => {
    attempts++;
    throw failure;
  };
  await assert.rejects(importPin(eagle, pin, { sleep: noDelay }), (error) => {
    assert.ok(error instanceof EagleImportError);
    assert.equal(error.name, "EagleImportError");
    assert.equal(error.code, "URL_IMPORT_FAILED");
    assert.equal(error.pinId, pin.pinId);
    assert.equal(error.cause, failure);
    return true;
  });
  assert.equal(attempts, 2);
});

test("an unavailable URL API produces a typed error without a download by default", async () => {
  await assert.rejects(importPin({}, pin), { code: "URL_IMPORT_UNAVAILABLE" });
});

test("an empty Eagle item ID is treated as a failed import", async () => {
  const eagle = fakeEagle();
  let attempts = 0;
  eagle.item.addFromURL = async () => {
    attempts++;
    return "";
  };
  await assert.rejects(importPin(eagle, pin, { sleep: noDelay }), {
    code: "URL_IMPORT_FAILED",
  });
  assert.equal(attempts, 2);
});

test("local fallback follows both URL attempts and preserves all import options", async () => {
  const eagle = fakeEagle();
  const events = [];
  let localPath;
  const direct = eagle.item.addFromURL;
  eagle.item.addFromURL = async (url, options) => {
    await direct(url, options);
    events.push("url");
    throw new Error("Blocked");
  };
  eagle.item.addFromPath = async (filePath, options) => {
    events.push("path");
    localPath = filePath;
    assert.equal(await fs.readFile(filePath, "utf8"), "fake image");
    assert.deepEqual(options, eagle.calls[0].options);
    return "local-item";
  };
  const result = await importPin(eagle, pin, {
    allowLocalFallback: true,
    sleep: noDelay,
    download: async (url, filePath) => {
      assert.equal(url, pin.imageUrl);
      assert.equal(path.extname(filePath), ".jpg");
      events.push("download");
      await fs.writeFile(filePath, "fake image");
    },
  });
  assert.deepEqual(events, ["url", "url", "download", "path"]);
  assert.deepEqual(result, {
    itemId: "local-item",
    folderIds: ["folder-a", "folder-b"],
  });
  await assert.rejects(fs.stat(path.dirname(localPath)), { code: "ENOENT" });
});

test("local fallback works when URL import is unavailable", async () => {
  let filePath;
  const eagle = {
    item: {
      async addFromPath(localPath, options) {
        filePath = localPath;
        assert.deepEqual(options.folders, []);
        return "local-only";
      },
    },
  };
  const result = await importPin(eagle, pin, {
    allowLocalFallback: true,
    sleep: async () => assert.fail("no retry delay for an absent API"),
    download: async (_url, localPath) => fs.writeFile(localPath, "fake image"),
  });
  assert.equal(result.itemId, "local-only");
  await assert.rejects(fs.stat(filePath), { code: "ENOENT" });
});

for (const failureStage of ["download", "import"]) {
  test(`local fallback cleans up after ${failureStage} failure`, async () => {
    const failure = new Error(`${failureStage} failed`);
    let filePath;
    const eagle = {
      item: {
        async addFromPath() {
          throw failure;
        },
      },
    };
    await assert.rejects(
      importPin(eagle, pin, {
        allowLocalFallback: true,
        download: async (_url, destination) => {
          filePath = destination;
          await fs.writeFile(destination, "partial image");
          if (failureStage === "download") throw failure;
        },
      }),
      (error) => {
        assert.ok(error instanceof EagleImportError);
        assert.equal(error.code, "LOCAL_IMPORT_FAILED");
        assert.equal(error.cause, failure);
        return true;
      },
    );
    await assert.rejects(fs.stat(path.dirname(filePath)), { code: "ENOENT" });
  });
}

test("fallback never downloads when addFromPath is unavailable", async () => {
  await assert.rejects(
    importPin({}, pin, {
      allowLocalFallback: true,
      download: async () => assert.fail("cannot import the downloaded file"),
    }),
    { code: "URL_IMPORT_UNAVAILABLE" },
  );
});

test("invalid Pins and video Pins fail before import or download", async () => {
  for (const input of [
    { ...pin, pinUrl: "https://example.com/pin/123/" },
    { ...pin, imageUrl: "file:///private/image.jpg" },
    { ...pin, pinId: "999" },
    { ...pin, isVideo: true },
  ]) {
    const eagle = fakeEagle();
    await assert.rejects(
      importPin(eagle, input, {
        allowLocalFallback: true,
        download: async () => assert.fail("must validate before download"),
      }),
      { code: input.isVideo ? "UNSUPPORTED_PIN" : "INVALID_PIN" },
    );
    assert.deepEqual(eagle.calls, []);
  }
});

test("the built-in fallback refuses insecure HTTP downloads without network access", async () => {
  const eagle = {
    item: { addFromPath: async () => assert.fail("no downloaded file") },
  };
  await assert.rejects(
    importPin(
      eagle,
      { ...pin, imageUrl: "http://i.pinimg.com/image.jpg" },
      {
        allowLocalFallback: true,
      },
    ),
    { code: "LOCAL_IMPORT_FAILED" },
  );
});

// Run the real downloader against streams in a separate module context. No
// socket is opened, and the deadline can be triggered without waiting 15 seconds.
function importerWithFakeHttps({
  status = 200,
  headers = {},
  body = "fake image",
  timeout = false,
} = {}) {
  const vm = require("node:vm");
  const { createRequire } = require("node:module");
  const { EventEmitter } = require("node:events");
  const { PassThrough } = require("node:stream");
  const { readFileSync } = require("node:fs");
  const importerPath = require.resolve("../js/eagle-importer");
  const localRequire = createRequire(importerPath);
  const output = { exports: {} };
  let deadline;
  let requestCount = 0;
  let timerCleared = false;
  const https = {
    get(url, onResponse) {
      assert.equal(url, pin.imageUrl);
      requestCount++;
      const response = new PassThrough();
      response.statusCode = status;
      response.headers = { "content-type": "image/jpeg", ...headers };
      const request = new EventEmitter();
      request.destroy = (error) => {
        response.destroy(error);
        if (error) request.emit("error", error);
      };
      process.nextTick(() => {
        onResponse(response);
        if (timeout) require("node:timers").setImmediate(() => deadline());
        else response.end(body);
      });
      return request;
    },
  };
  vm.runInNewContext(readFileSync(importerPath, "utf8"), {
    module: output,
    require: (name) => (name === "node:https" ? https : localRequire(name)),
    URL,
    setTimeout(callback, milliseconds) {
      assert.equal(milliseconds, 15000);
      deadline = callback;
      return "timer";
    },
    clearTimeout(timer) {
      assert.equal(timer, "timer");
      timerCleared = true;
    },
  });
  return {
    importPin: output.exports.importPin,
    verify() {
      assert.equal(requestCount, 1);
      assert.ok(timerCleared, "download deadline is cleared after completion");
    },
  };
}

test("built-in HTTPS fallback streams an image and removes its temporary directory", async () => {
  const adapter = importerWithFakeHttps();
  let importedPath;
  await adapter.importPin(
    {
      item: {
        async addFromPath(filePath) {
          importedPath = filePath;
          assert.equal(await fs.readFile(filePath, "utf8"), "fake image");
          return "https-item";
        },
      },
    },
    pin,
    { allowLocalFallback: true },
  );
  adapter.verify();
  await assert.rejects(fs.stat(path.dirname(importedPath)), { code: "ENOENT" });
});

for (const [label, response, expectedError] of [
  [
    "redirect",
    { status: 302, headers: { location: "https://example.com/secret.jpg" } },
    /HTTP 302/,
  ],
  [
    "non-image response",
    { headers: { "content-type": "text/html" } },
    /did not return an image/,
  ],
  [
    "oversized Content-Length",
    { headers: { "content-length": String(21 * 1024 * 1024) } },
    /exceeds 20 MiB/,
  ],
  [
    "oversized streamed body",
    { body: require("node:buffer").Buffer.alloc(20 * 1024 * 1024 + 1) },
    /exceeds 20 MiB/,
  ],
  ["stalled body", { timeout: true }, /timed out/],
]) {
  test(`built-in HTTPS fallback rejects ${label} without a real network request`, async () => {
    const adapter = importerWithFakeHttps(response);
    await assert.rejects(
      adapter.importPin(
        {
          item: {
            addFromPath: async () =>
              assert.fail("failed downloads must not reach Eagle"),
          },
        },
        pin,
        { allowLocalFallback: true },
      ),
      (error) => {
        assert.equal(error.code, "LOCAL_IMPORT_FAILED");
        assert.match(error.cause.message, expectedError);
        return true;
      },
    );
    adapter.verify();
  });
}

for (const outcome of ["success", "download failure", "import failure"]) {
  test(`cleanup failure preserves the primary outcome after ${outcome}`, async () => {
    const temporaryDirectory = path.join("/virtual", "eagle-pinterest-test");
    const cleanupFailure = new Error("Temporary directory is locked");
    const importFailure = new Error(outcome);
    const events = [];
    const options = {
      allowLocalFallback: true,
      tempFs: {
        async mkdtemp(prefix) {
          assert.equal(path.basename(prefix), "eagle-pinterest-");
          events.push("create");
          return temporaryDirectory;
        },
        async rm(directory, cleanupOptions) {
          assert.equal(directory, temporaryDirectory);
          assert.deepEqual(cleanupOptions, { recursive: true, force: true });
          events.push("cleanup");
          throw cleanupFailure;
        },
      },
      async download(url, filePath) {
        assert.equal(url, pin.imageUrl);
        assert.equal(path.dirname(filePath), temporaryDirectory);
        events.push("download");
        if (outcome === "download failure") throw importFailure;
      },
    };
    const eagle = {
      item: {
        async addFromPath(filePath) {
          assert.equal(path.dirname(filePath), temporaryDirectory);
          events.push("import");
          if (outcome === "import failure") throw importFailure;
          return "imported-item";
        },
      },
    };
    if (outcome === "success") {
      assert.deepEqual(await importPin(eagle, pin, options), {
        itemId: "imported-item",
        folderIds: [],
      });
    } else {
      await assert.rejects(importPin(eagle, pin, options), (error) => {
        assert.ok(error instanceof EagleImportError);
        assert.equal(error.code, "LOCAL_IMPORT_FAILED");
        assert.equal(error.pinId, pin.pinId);
        assert.equal(error.cause, importFailure);
        assert.notEqual(error, cleanupFailure);
        return true;
      });
    }
    assert.deepEqual(
      events,
      outcome === "download failure"
        ? ["create", "download", "cleanup"]
        : ["create", "download", "import", "cleanup"],
    );
  });
}

"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createImportQueue } = require("../js/import-queue");

test("deduplicates a Frame Set import while it is queued and after completion", async () => {
  let calls = 0;
  const queue = createImportQueue({
    importer: async () => { calls += 1; return { itemId: "item-1" }; },
    concurrency: 1,
  });
  const frame = { frameId: "frame-1", frameUrl: "https://frameset.app/image.avif" };
  const first = queue.enqueue(frame);
  const second = queue.enqueue(frame);
  assert.equal(await first.then((status) => status.state), "done");
  assert.equal(await second.then((status) => status.state), "done");
  assert.equal(calls, 1);
});

test("failed imports stay retryable until explicitly retried", async () => {
  let calls = 0;
  const queue = createImportQueue({ importer: async () => { calls += 1; if (calls === 1) throw new Error("failed"); return { itemId: "item-2" }; } });
  const frame = { frameId: "frame-2" };
  assert.equal((await queue.enqueue(frame)).state, "error");
  assert.equal((await queue.retry(frame)).state, "done");
  assert.equal(calls, 2);
});

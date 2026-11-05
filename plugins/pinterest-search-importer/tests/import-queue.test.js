"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { setImmediate } = require("node:timers/promises");
const { createImportQueue } = require("../js/import-queue");

const pin = (pinId) => ({
  pinId,
  imageUrl: `https://i.pinimg.com/originals/${pinId}.jpg`,
});

function controlledImporter() {
  const started = [];
  const jobs = [];
  let active = 0;
  let peak = 0;
  return {
    started,
    jobs,
    peak: () => peak,
    importer(payload) {
      started.push(payload.pinId);
      active++;
      peak = Math.max(peak, active);
      return new Promise((resolve, reject) => {
        jobs.push({
          done() {
            active--;
            resolve({ itemId: `eagle-${payload.pinId}` });
          },
          fail() {
            active--;
            reject(new Error("Import failed"));
          },
        });
      });
    },
  };
}

test("duplicate Pin IDs import once while queued, active, and completed", async () => {
  const fake = controlledImporter();
  const queue = createImportQueue({ importer: fake.importer, concurrency: 1 });
  const first = queue.enqueue(pin("1"));
  const second = queue.enqueue(pin("2"));
  assert.equal(
    queue.enqueue({ ...pin("1"), imageUrl: pin("9").imageUrl }),
    first,
  );
  assert.equal(queue.enqueue(pin("2")), second);
  fake.jobs[0].done();
  await first;
  await setImmediate();
  fake.jobs[1].done();
  await second;
  assert.equal((await queue.enqueue(pin("1"))).state, "done");
  assert.deepEqual(fake.started, ["1", "2"]);
});

for (const concurrency of [undefined, 3, 12]) {
  test(`imports start in insertion order with at most three active jobs (concurrency=${concurrency})`, async () => {
    const fake = controlledImporter();
    const queue = createImportQueue({ importer: fake.importer, concurrency });
    const results = Array.from({ length: 7 }, (_, i) =>
      queue.enqueue(pin(String(i + 1))),
    );
    assert.deepEqual(fake.started, ["1", "2", "3"]);
    assert.deepEqual(queue.getCounts(), { imported: 0, queued: 7, failed: 0 });
    fake.jobs[1].done();
    await setImmediate();
    assert.deepEqual(fake.started, ["1", "2", "3", "4"]);
    fake.jobs[0].done();
    fake.jobs[2].done();
    await setImmediate();
    assert.deepEqual(fake.started, ["1", "2", "3", "4", "5", "6"]);
    fake.jobs[3].done();
    fake.jobs[4].done();
    fake.jobs[5].done();
    await setImmediate();
    fake.jobs[6].done();
    await Promise.all(results);
    assert.equal(fake.peak(), 3);
    assert.deepEqual(queue.getCounts(), { imported: 7, queued: 0, failed: 0 });
  });
}

test("without a Pin ID the normalized image URL is the duplicate key", async () => {
  let imports = 0;
  const queue = createImportQueue({
    importer: async () => ({ itemId: String(++imports) }),
  });
  await queue.enqueue({
    imageUrl: "https://I.PINIMG.COM/originals/image.jpg#preview",
  });
  const result = await queue.enqueue({
    imageUrl: "https://i.pinimg.com/originals/image.jpg",
  });
  assert.equal(imports, 1);
  assert.equal(result.key, "https://i.pinimg.com/originals/image.jpg");
  assert.throws(() => queue.enqueue({ imageUrl: "invalid" }), /image URL/i);
});

test("failures emit error and do not stop unrelated queued imports", async () => {
  const updates = [];
  const queue = createImportQueue({
    concurrency: 1,
    importer(payload) {
      if (payload.pinId === "1") throw new Error("Eagle unavailable");
      return Promise.resolve({ itemId: "eagle-2" });
    },
    onUpdate: (update) => updates.push(update),
  });
  const results = await Promise.all([
    queue.enqueue(pin("1")),
    queue.enqueue(pin("2")),
  ]);
  assert.equal(results[0].state, "error");
  assert.equal(results[0].error, "Eagle unavailable");
  assert.deepEqual(results[1], {
    key: "2",
    state: "done",
    progress: 1,
    error: null,
    itemId: "eagle-2",
  });
  assert.deepEqual(
    updates.filter((u) => u.key === "2").map((u) => u.state),
    ["queued", "importing", "done"],
  );
  assert.deepEqual(queue.getCounts(), { imported: 1, queued: 0, failed: 1 });
});

test("a failed job waits for an explicit user retry and concurrent retry clicks import only once", async () => {
  const fake = controlledImporter();
  const queue = createImportQueue({ importer: fake.importer });
  const first = queue.enqueue(pin("1"));
  fake.jobs[0].fail();
  await first;
  assert.equal((await queue.enqueue(pin("1"))).state, "error");
  assert.equal(
    fake.jobs.length,
    1,
    "enqueue does not automatically retry failures",
  );
  const retry = queue.retry(pin("1"));
  assert.equal(queue.retry(pin("1")), retry);
  fake.jobs[1].done();
  assert.equal((await retry).state, "done");
  await queue.retry(pin("1"));
  assert.equal(fake.jobs.length, 2);
  assert.deepEqual(queue.getCounts(), { imported: 1, queued: 0, failed: 0 });
});

test("clearing session history permits completed Pins again and preserves active/queued duplicate protection", async () => {
  const fake = controlledImporter();
  const updates = [];
  const queue = createImportQueue({
    importer: fake.importer,
    concurrency: 1,
    onUpdate: (u) => updates.push(u),
  });
  const first = queue.enqueue(pin("1"));
  fake.jobs[0].done();
  await first;
  await setImmediate();
  const active = queue.enqueue(pin("2"));
  const pending = queue.enqueue(pin("3"));
  queue.clearHistory();
  assert.deepEqual(queue.getCounts(), { imported: 0, queued: 2, failed: 0 });
  assert.equal(updates.findLast((u) => u.key === "1").state, "idle");
  assert.equal(queue.enqueue(pin("2")), active);
  assert.equal(queue.enqueue(pin("3")), pending);
  const again = queue.enqueue(pin("1"));
  fake.jobs[1].done();
  await active;
  await setImmediate();
  fake.jobs[2].done();
  await pending;
  await setImmediate();
  fake.jobs[3].done();
  await again;
  assert.deepEqual(fake.started, ["1", "2", "3", "1"]);
  assert.equal(
    queue.getUpdates().every((u) => !u.imageUrl && !u.pin),
    true,
  );
});

test("feedback callback failures cannot turn a successful import into a duplicate retry", async () => {
  let imports = 0;
  const queue = createImportQueue({
    importer: async () => ({ itemId: String(++imports) }),
    onUpdate() {
      throw new Error("Webview was destroyed");
    },
  });
  assert.equal((await queue.enqueue(pin("1"))).state, "done");
  await queue.enqueue(pin("1"));
  assert.equal(imports, 1);
});

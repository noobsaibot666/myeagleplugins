"use strict";

function createImportQueue({ importer, concurrency = 3, onUpdate = (_status) => {} }) {
  if (typeof importer !== "function") throw new TypeError("An importer is required");
  if (!Number.isFinite(concurrency) || concurrency < 1) throw new RangeError("Concurrency must be at least one");
  const limit = Math.min(3, Math.floor(concurrency));
  const entries = new Map();
  const pending = [];
  let active = 0;

  function keyFor(frame) {
    const key = typeof frame?.frameId === "string" ? frame.frameId.trim() : "";
    if (!key) throw new TypeError("A Frame Set ID is required");
    return key;
  }

  function notify(status) {
    try { onUpdate({ ...status }); } catch (_error) { /* UI may have closed */ }
  }

  function pump() {
    while (active < limit && pending.length) {
      const job = pending.shift();
      active += 1;
      job.entry.status = { ...job.entry.status, state: "importing" };
      notify(job.entry.status);
      void run(job);
    }
  }

  async function run({ frame, entry, resolve }) {
    try {
      const result = await importer(frame);
      entry.status = { ...entry.status, state: "done", progress: 1, itemId: result.itemId };
    } catch (error) {
      entry.status = { ...entry.status, state: "error", error: error instanceof Error ? error.message : String(error) };
    }
    active -= 1;
    notify(entry.status);
    resolve({ ...entry.status });
    pump();
  }

  function add(frame, retry) {
    const key = keyFor(frame);
    const previous = entries.get(key);
    if (previous && !(retry && previous.status.state === "error")) {
      notify(previous.status);
      return previous.promise;
    }
    /** @type {(status: any) => void} */
    let resolve;
    const promise = new Promise((done) => { resolve = done; });
    const entry = { status: { key, state: "queued", progress: 0, error: null, itemId: null }, promise };
    entries.set(key, entry);
    pending.push({ frame: { ...frame }, entry, resolve });
    notify(entry.status);
    pump();
    return promise;
  }

  function clearHistory() {
    for (const [key, entry] of entries) {
      if (entry.status.state !== "done" && entry.status.state !== "error") continue;
      entries.delete(key);
      notify({ key, state: "idle", progress: 0, error: null, itemId: null });
    }
  }

  return {
    enqueue: (frame) => add(frame, false),
    retry: (frame) => add(frame, true),
    clearHistory,
    getCounts() {
      const counts = { imported: 0, queued: 0, failed: 0 };
      for (const { status } of entries.values()) {
        if (status.state === "done") counts.imported += 1;
        else if (status.state === "error") counts.failed += 1;
        else counts.queued += 1;
      }
      return counts;
    },
  };
}

module.exports = { createImportQueue };

"use strict";

const { normalizeImageUrl } = require("./pinterest-bridge");

/** @typedef {{pinId?: string, imageUrl: string}} QueuePin */
/** @typedef {{key: string, state: "idle"|"queued"|"importing"|"done"|"error", progress: number, error: string|null, itemId: string|null}} ImportUpdate */
/** @typedef {{status: ImportUpdate, promise: Promise<ImportUpdate>}} QueueEntry */

/**
 * A session-only FIFO queue. Terminal entries retain status/IDs, never Pin
 * metadata or image bytes. Failed jobs require an explicit retry(pin) call.
 * @param {{importer: (pin: QueuePin) => Promise<{itemId: string}>, concurrency?: number, onUpdate?: (update: ImportUpdate) => void}} options
 */
function createImportQueue({ importer, concurrency = 3, onUpdate = () => {} }) {
  if (typeof importer !== "function")
    throw new TypeError("An importer is required");
  if (!Number.isFinite(concurrency) || concurrency < 1) {
    throw new RangeError("Concurrency must be at least one");
  }
  const limit = Math.min(3, Math.floor(concurrency));
  /** @type {Map<string, QueueEntry>} */
  const entries = new Map();
  /** @type {{pin: QueuePin, entry: QueueEntry, resolve: (update: ImportUpdate) => void}[]} */
  const pending = [];
  let active = 0;

  /** @param {QueuePin} pin */
  function keyFor(pin) {
    const key = typeof pin.pinId === "string" ? pin.pinId.trim() : "";
    if (key) return key;
    const imageUrl = normalizeImageUrl(pin.imageUrl);
    if (!imageUrl)
      throw new TypeError("A Pin ID or valid Pinterest image URL is required");
    return imageUrl;
  }

  /** @param {ImportUpdate} status */
  function notify(status) {
    try {
      onUpdate({ ...status });
    } catch (_error) {
      // Feedback can disappear on navigation without changing an import result.
    }
  }

  function pump() {
    while (active < limit && pending.length) {
      const job = pending.shift();
      active++;
      job.entry.status = { ...job.entry.status, state: "importing" };
      notify(job.entry.status);
      void run(job);
    }
  }

  /** @param {{pin: QueuePin, entry: QueueEntry, resolve: (update: ImportUpdate) => void}} job */
  async function run({ pin, entry, resolve }) {
    try {
      const result = await importer(pin);
      entry.status = {
        ...entry.status,
        state: "done",
        progress: 1,
        itemId: result.itemId,
      };
    } catch (error) {
      entry.status = {
        ...entry.status,
        state: "error",
        error: error instanceof Error ? error.message : String(error),
      };
    }
    active--;
    notify(entry.status);
    resolve({ ...entry.status });
    pump();
  }

  /** @param {QueuePin} pin @param {boolean} retry */
  function add(pin, retry) {
    const key = keyFor(pin);
    const previous = entries.get(key);
    if (previous && !(retry && previous.status.state === "error")) {
      notify(previous.status);
      return previous.promise;
    }
    /** @type {(status: ImportUpdate) => void} */
    let resolve;
    /** @type {Promise<ImportUpdate>} */
    const promise = new Promise((done) => {
      resolve = done;
    });
    /** @type {QueueEntry} */
    const entry = {
      status: { key, state: "queued", progress: 0, error: null, itemId: null },
      promise,
    };
    entries.set(key, entry);
    pending.push({ pin: { ...pin }, entry, resolve });
    notify(entry.status);
    pump();
    return entry.promise;
  }

  function getCounts() {
    const counts = { imported: 0, queued: 0, failed: 0 };
    for (const { status } of entries.values()) {
      if (status.state === "done") counts.imported++;
      else if (status.state === "error") counts.failed++;
      // Queued counts all outstanding work, including the active slots.
      else counts.queued++;
    }
    return counts;
  }

  function clearHistory() {
    for (const [key, entry] of entries) {
      if (entry.status.state !== "done" && entry.status.state !== "error")
        continue;
      entries.delete(key);
      notify({ key, state: "idle", progress: 0, error: null, itemId: null });
    }
  }

  return {
    /** @param {QueuePin} pin */
    enqueue: (pin) => add(pin, false),
    /** @param {QueuePin} pin */
    retry: (pin) => add(pin, true),
    clearHistory,
    getCounts,
    getUpdates: () =>
      Array.from(entries.values(), ({ status }) => ({ ...status })),
  };
}

module.exports = { createImportQueue };

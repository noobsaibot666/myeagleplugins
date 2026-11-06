"use strict";

/**
 * Append-only masonry grid. Cards are placed once into the currently shortest
 * column (tracked in aspect-ratio units, so no layout reads are needed) and are
 * never moved when more results arrive. A full re-flow only happens when the
 * available column count changes (window resize).
 */

const MIN_RATIO = 0.4;
const MAX_RATIO = 2.4;
const DEFAULT_RATIO = 1.25;

/** @param {{width?: number, height?: number}} pin */
function aspectRatioOf(pin) {
  const width = Number(pin?.width);
  const height = Number(pin?.height);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null;
  return Math.min(MAX_RATIO, Math.max(MIN_RATIO, height / width));
}

/** @param {number} width @param {number} minColumnWidth @param {number} gap */
function columnCountFor(width, minColumnWidth, gap) {
  if (!Number.isFinite(width) || width <= 0) return 0;
  return Math.max(1, Math.floor((width + gap) / (minColumnWidth + gap)));
}

function createResultsView({
  grid,
  emptyState,
  resultCount,
  emptyTitle,
  emptyMessage,
  onSave,
  minColumnWidth = 220,
  gap = 12,
  fallbackColumns = 4,
  altText = "Pinterest result",
}) {
  /** @type {Map<string, {card: any, action: any, image: any, ratio: number, column: any}>} */
  const cards = new Map();
  /** @type {string[]} */
  const order = [];
  /** @type {{el: any, height: number}[]} */
  let columns = [];

  const setEmpty = (visible, title, message) => {
    emptyState.hidden = !visible;
    if (title) emptyTitle.textContent = title;
    if (message) emptyMessage.textContent = message;
  };

  const desiredColumnCount = () =>
    columnCountFor(Number(grid.clientWidth), minColumnWidth, gap) || columns.length || fallbackColumns;

  const place = (entry) => {
    let target = columns[0];
    for (const column of columns) if (column.height < target.height - 0.01) target = column;
    target.el.append(entry.card);
    target.height += entry.ratio + 0.06;
    entry.column = target;
  };

  const buildColumns = (count) => {
    columns = Array.from({ length: count }, () => {
      const el = document.createElement("div");
      el.className = "results-column";
      return { el, height: 0 };
    });
    grid.replaceChildren(...columns.map((column) => column.el));
    for (const pinId of order) place(cards.get(pinId));
  };

  /** Re-flow only when the number of columns that fits has changed. */
  const relayout = () => {
    const count = desiredColumnCount();
    if (count !== columns.length) buildColumns(count);
  };

  const clear = () => {
    cards.clear();
    order.length = 0;
    buildColumns(desiredColumnCount());
    resultCount.textContent = "0 results";
  };

  const createCard = (pin) => {
    const ratio = aspectRatioOf(pin);
    const card = document.createElement("article");
    card.className = "result-card";
    card.dataset.pinId = pin.pinId;
    const media = document.createElement("div");
    media.className = "result-card-media";
    if (media.style) media.style.paddingBottom = `${((ratio || DEFAULT_RATIO) * 100).toFixed(3)}%`;
    const image = document.createElement("img");
    image.alt = pin.title || altText;
    image.decoding = "async";
    image.loading = "lazy";
    image.referrerPolicy = "no-referrer";
    image.draggable = false;
    image.src = pin.previewUrl || pin.imageUrl;
    const entry = { card, action: null, image, ratio: ratio || DEFAULT_RATIO, column: null };
    image.addEventListener("load", () => {
      image.classList.add("loaded");
      if (ratio || !image.naturalWidth || !image.naturalHeight) return;
      // Unknown dimensions: adopt the real ratio for this card and for future placement.
      const actual = Math.min(MAX_RATIO, Math.max(MIN_RATIO, image.naturalHeight / image.naturalWidth));
      if (media.style) media.style.paddingBottom = `${(actual * 100).toFixed(3)}%`;
      if (entry.column) entry.column.height += actual - entry.ratio;
      entry.ratio = actual;
    }, { once: true });
    image.addEventListener("error", () => {
      media.classList.add("failed");
      image.replaceWith(Object.assign(document.createElement("div"), { className: "result-card-image-error", textContent: "Image unavailable" }));
    }, { once: true });
    media.append(image);
    const action = document.createElement("button");
    action.type = "button";
    action.className = "result-card-action";
    action.textContent = "↓";
    action.setAttribute("aria-label", "Save to Eagle");
    action.title = "Save to Eagle";
    action.addEventListener("click", () => onSave(pin, action));
    card.append(media, action);
    if (pin.caption) {
      const caption = document.createElement("div");
      caption.className = "result-card-caption";
      caption.textContent = pin.caption;
      caption.title = pin.caption;
      card.append(caption);
      entry.ratio += 0.12;
    }
    entry.action = action;
    return entry;
  };

  /** Append only results that are not yet shown; existing cards are never moved or recreated. */
  const append = (results) => {
    if (!columns.length) buildColumns(desiredColumnCount());
    for (const pin of results) {
      if (!pin || cards.has(pin.pinId)) continue;
      const entry = createCard(pin);
      cards.set(pin.pinId, entry);
      order.push(pin.pinId);
      place(entry);
    }
    resultCount.textContent = `${order.length} result${order.length === 1 ? "" : "s"}`;
    setEmpty(order.length === 0);
  };

  /** Compatible entry point: shows exactly `results`, reusing cards that remain. */
  const render = (results) => {
    const ids = new Set(results.map((pin) => pin.pinId));
    if (order.some((pinId) => !ids.has(pinId))) {
      const keep = order.filter((pinId) => ids.has(pinId));
      for (const pinId of order) if (!ids.has(pinId)) cards.delete(pinId);
      order.length = 0;
      order.push(...keep);
      buildColumns(desiredColumnCount());
    }
    append(results);
  };

  const updateStatus = (status) => {
    const entry = cards.get(status?.key || status?.pinId);
    if (!entry) return;
    const action = entry.action;
    action.className = "result-card-action";
    if (status.state === "queued" || status.state === "importing") {
      action.classList.add("saving");
      action.textContent = "…";
      action.setAttribute("aria-label", "Saving to Eagle");
      action.title = "Saving to Eagle";
      action.disabled = true;
    } else if (status.state === "done") {
      action.classList.add("saved");
      action.textContent = "✓";
      action.setAttribute("aria-label", "Saved to Eagle");
      action.title = "Saved to Eagle";
      action.disabled = true;
    } else if (status.state === "error") {
      action.classList.add("retry");
      action.textContent = "↻";
      action.setAttribute("aria-label", "Retry save to Eagle");
      action.title = status.error || "Retry save to Eagle";
      action.disabled = false;
    } else {
      action.textContent = "↓";
      action.setAttribute("aria-label", "Save to Eagle");
      action.title = "Save to Eagle";
      action.disabled = false;
    }
  };

  if (typeof window !== "undefined" && typeof window.ResizeObserver === "function") {
    let frame = 0;
    new window.ResizeObserver(() => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => { frame = 0; relayout(); });
    }).observe(grid);
  }

  return { render, append, updateStatus, setEmpty, clear, relayout, size: () => order.length };
}

module.exports = { createResultsView, aspectRatioOf, columnCountFor };

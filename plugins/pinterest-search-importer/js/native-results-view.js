"use strict";

function createResultsView({ grid, emptyState, resultCount, emptyTitle, emptyMessage, onSave }) {
  const cards = new Map();
  const setEmpty = (visible, title, message) => {
    emptyState.hidden = !visible;
    if (title) emptyTitle.textContent = title;
    if (message) emptyMessage.textContent = message;
  };
  const removeMissingCards = (results) => {
    const ids = new Set(results.map((pin) => pin.pinId));
    for (const [pinId, entry] of cards) {
      if (ids.has(pinId)) continue;
      entry.card.remove();
      cards.delete(pinId);
    }
  };
  const clear = () => {
    for (const { card } of cards.values()) card.remove();
    cards.clear();
    if (typeof grid.replaceChildren === "function") grid.replaceChildren();
  };
  const render = (results) => {
    resultCount.textContent = `${results.length} result${results.length === 1 ? "" : "s"}`;
    if (!results.length) { clear(); setEmpty(true); return; }
    setEmpty(false);
    removeMissingCards(results);
    for (const pin of results) {
      if (cards.has(pin.pinId)) continue;
      const card = document.createElement("article");
      card.className = "result-card";
      card.dataset.pinId = pin.pinId;
      const image = document.createElement("img");
      image.src = pin.imageUrl;
      image.alt = pin.title || "Pinterest result";
      image.loading = "lazy";
      image.addEventListener("error", () => {
        image.replaceWith(Object.assign(document.createElement("div"), { className: "result-card-image-error", textContent: "Image unavailable" }));
      }, { once: true });
      const action = document.createElement("button");
      action.type = "button";
      action.className = "result-card-action";
      action.textContent = "↓";
      action.setAttribute("aria-label", "Save to Eagle");
      action.title = "Save to Eagle";
      action.addEventListener("click", () => onSave(pin, action));
      card.append(image, action);
      grid.append(card);
      cards.set(pin.pinId, { card, action });
    }
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
    }
  };
  return { render, updateStatus, setEmpty, clear };
}

module.exports = { createResultsView };

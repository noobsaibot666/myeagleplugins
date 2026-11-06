"use strict";

function createResultsView({ grid, emptyState, resultCount, emptyTitle, emptyMessage, onSave }) {
  const cards = new Map();
  const setEmpty = (visible, title, message) => {
    emptyState.hidden = !visible;
    if (title) emptyTitle.textContent = title;
    if (message) emptyMessage.textContent = message;
  };
  const render = (results) => {
    grid.replaceChildren();
    cards.clear();
    resultCount.textContent = `${results.length} frame${results.length === 1 ? "" : "s"}`;
    if (!results.length) { setEmpty(true); return; }
    setEmpty(false);
    for (const frame of results) {
      const card = document.createElement("article");
      card.className = "result-card";
      card.dataset.frameId = frame.frameId;
      const image = document.createElement("img");
      image.src = frame.frameUrl;
      image.alt = frame.title || "Frame Set still";
      image.loading = "lazy";
      image.addEventListener("error", () => {
        image.replaceWith(Object.assign(document.createElement("div"), {
          className: "result-card-image-error",
          textContent: "Image unavailable",
        }));
      }, { once: true });
      const action = document.createElement("button");
      action.type = "button";
      action.className = "result-card-action";
      action.textContent = "↓";
      action.setAttribute("aria-label", "Save to Eagle");
      action.title = "Save to Eagle";
      action.addEventListener("click", () => onSave(frame, action));
      card.append(image, action);
      grid.append(card);
      cards.set(frame.frameId, action);
    }
  };
  const updateStatus = (status) => {
    const action = cards.get(status?.key || status?.frameId);
    if (!action) return;
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
  return { render, updateStatus, setEmpty };
}

module.exports = { createResultsView };

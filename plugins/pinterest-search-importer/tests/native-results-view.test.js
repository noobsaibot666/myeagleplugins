"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createResultsView } = require("../js/native-results-view");

function element(tagName) {
  return {
    tagName,
    className: "",
    dataset: {},
    children: [],
    attributes: {},
    disabled: false,
    classList: { add() {} },
    append(...nodes) {
      this.children.push(...nodes);
    },
    appendChild(node) {
      this.children.push(node);
    },
    remove() {
      this.removed = true;
    },
    addEventListener() {},
    setAttribute(key, value) {
      this.attributes[key] = value;
    },
  };
}

test("native results append new Pins without recreating existing cards", () => {
  const previousDocument = global.document;
  global.document = { createElement: element };
  try {
    const grid = {
      children: [],
      append(...nodes) {
        this.children.push(...nodes);
      },
    };
    const emptyState = { hidden: false };
    const resultCount = { textContent: "" };
    const emptyTitle = { textContent: "" };
    const emptyMessage = { textContent: "" };
    const view = createResultsView({
      grid,
      emptyState,
      resultCount,
      emptyTitle,
      emptyMessage,
      onSave() {},
    });
    const first = { pinId: "1", imageUrl: "https://i.pinimg.com/600x/a.jpg", title: "First" };
    const second = { pinId: "2", imageUrl: "https://i.pinimg.com/600x/b.jpg", title: "Second" };

    view.render([first]);
    const firstCard = grid.children[0];
    const firstAction = firstCard.children[1];
    view.updateStatus({ key: "1", state: "done" });
    view.render([first, second]);

    assert.equal(grid.children.length, 2);
    assert.equal(grid.children[0], firstCard);
    assert.equal(firstCard.children[1], firstAction);
    assert.equal(firstAction.disabled, true);
  } finally {
    global.document = previousDocument;
  }
});

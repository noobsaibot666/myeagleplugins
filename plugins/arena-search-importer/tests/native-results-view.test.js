"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createResultsView, aspectRatioOf, columnCountFor } = require("../js/native-results-view");

function element(tagName) {
  const node = {
    tagName,
    className: "",
    dataset: {},
    style: {},
    children: [],
    attributes: {},
    listeners: {},
    disabled: false,
    parent: null,
    classList: {
      add(name) { node.className = `${node.className} ${name}`.trim(); },
    },
    append(...nodes) {
      for (const child of nodes) {
        if (child.parent) child.parent.children = child.parent.children.filter((item) => item !== child);
        child.parent = node;
        node.children.push(child);
      }
    },
    replaceChildren(...nodes) {
      node.children = [];
      node.append(...nodes);
    },
    replaceWith(other) {
      const siblings = node.parent.children;
      siblings[siblings.indexOf(node)] = other;
    },
    addEventListener(name, callback) {
      node.listeners[name] = callback;
    },
    setAttribute(key, value) {
      node.attributes[key] = value;
    },
  };
  return node;
}

function setup(width = 940) {
  const previousDocument = global.document;
  global.document = { createElement: element };
  const grid = element("div");
  grid.clientWidth = width;
  const view = createResultsView({
    grid,
    emptyState: { hidden: false },
    resultCount: { textContent: "" },
    emptyTitle: { textContent: "" },
    emptyMessage: { textContent: "" },
    onSave() {},
  });
  return { grid, view, restore: () => { global.document = previousDocument; } };
}

const pin = (id, width = 474, height = 474) => ({ pinId: String(id), imageUrl: `https://i.pinimg.com/736x/${id}.jpg`, previewUrl: `https://i.pinimg.com/474x/${id}.jpg`, title: `Pin ${id}`, width, height });

test("aspect ratios are clamped and column counts follow available width", () => {
  assert.equal(aspectRatioOf({ width: 100, height: 150 }), 1.5);
  assert.equal(aspectRatioOf({ width: 100, height: 1000 }), 2.4);
  assert.equal(aspectRatioOf({}), null);
  assert.equal(columnCountFor(940, 220, 12), 4);
  assert.equal(columnCountFor(400, 220, 12), 1);
  assert.equal(columnCountFor(0, 220, 12), 0);
});

test("appending results never recreates or moves existing cards", () => {
  const { grid, view, restore } = setup();
  try {
    view.render([pin(1)]);
    const firstCard = grid.children[0].children[0];
    const firstAction = firstCard.children[1];
    view.updateStatus({ key: "1", state: "done" });
    view.append([pin(1), pin(2), pin(3), pin(4), pin(5)]);
    assert.equal(grid.children.length, 4);
    assert.equal(grid.children[0].children[0], firstCard);
    assert.equal(firstCard.children[1], firstAction);
    assert.equal(firstAction.disabled, true);
    assert.equal(view.size(), 5);
  } finally {
    restore();
  }
});

test("cards fill the shortest column and reserve their image height before loading", () => {
  const { grid, view, restore } = setup();
  try {
    view.append([pin(1, 100, 300), pin(2, 100, 100), pin(3, 100, 100), pin(4, 100, 100), pin(5, 100, 100)]);
    const [first, second] = grid.children;
    // Column 1 holds a tall card, so the fifth card goes to the next shortest column.
    assert.equal(first.children.length, 1);
    assert.equal(second.children.length, 2);
    const media = first.children[0].children[0];
    assert.equal(media.style.paddingBottom, "240.000%");
    assert.equal(media.children[0].src, "https://i.pinimg.com/474x/1.jpg");
    assert.equal(media.children[0].loading, "lazy");
  } finally {
    restore();
  }
});

test("relayout only rebuilds when the number of columns changes and keeps result order", () => {
  const { grid, view, restore } = setup();
  try {
    view.append([pin(1), pin(2), pin(3), pin(4)]);
    const columns = grid.children;
    view.relayout();
    assert.equal(grid.children, columns);
    grid.clientWidth = 460;
    view.relayout();
    assert.equal(grid.children.length, 2);
    assert.deepEqual(grid.children[0].children.map((card) => card.dataset.pinId), ["1", "3"]);
    assert.deepEqual(grid.children[1].children.map((card) => card.dataset.pinId), ["2", "4"]);
  } finally {
    restore();
  }
});

test("clearing session history resets a saved card to an importable state", () => {
  const { grid, view, restore } = setup();
  try {
    view.append([pin(1)]);
    const action = grid.children[0].children[0].children[1];
    view.updateStatus({ key: "1", state: "done" });
    view.updateStatus({ key: "1", state: "idle" });
    assert.equal(action.disabled, false);
    assert.equal(action.textContent, "↓");
  } finally {
    restore();
  }
});

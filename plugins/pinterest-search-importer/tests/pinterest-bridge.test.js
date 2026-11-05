"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const fs = require("node:fs");
const path = require("node:path");
const {
  buildSearchUrl,
  normalizePinUrl,
  normalizeImageUrl,
  validateImportMessage,
  getInjectedCardScript,
} = require("../js/pinterest-bridge");

const pin = {
  pinUrl: "https://www.pinterest.com/pin/123456789/?utm_source=test#detail",
  imageUrl: "https://i.pinimg.com/736x/ab/cd/ef/example.jpg",
  title: "Interior design",
};

test("buildSearchUrl trims and encodes a keyword query", () => {
  assert.equal(
    buildSearchUrl("  interior design "),
    "https://www.pinterest.com/search/pins/?q=interior%20design",
  );
  assert.equal(
    buildSearchUrl("chairs & tables"),
    "https://www.pinterest.com/search/pins/?q=chairs%20%26%20tables",
  );
});

test("Pin normalization removes tracking parameters and canonicalizes the host", () => {
  assert.equal(
    normalizePinUrl(pin.pinUrl),
    "https://www.pinterest.com/pin/123456789/",
  );
  assert.equal(
    normalizePinUrl("http://pinterest.com/pin/123456789"),
    "https://www.pinterest.com/pin/123456789/",
  );
});

test("Pin normalization rejects invalid hosts, schemes, paths, credentials, and IDs", () => {
  for (const url of [
    null,
    {},
    "",
    "javascript:alert(1)",
    "file:///pin/123/",
    "https://pinterest.com.evil.test/pin/123/",
    "https://example.com/pin/123/",
    "https://www.pinterest.com/search/pins/",
    "https://www.pinterest.com/pin/",
    "https://www.pinterest.com/pin/abc/",
    "https://www.pinterest.com/pin/123/extra",
    "https://user:secret@www.pinterest.com/pin/123/",
  ]) {
    assert.equal(normalizePinUrl(url), null, String(url));
  }
});

test("image normalization accepts Pinterest images and rejects invalid sources", () => {
  assert.equal(normalizeImageUrl(`${pin.imageUrl}#preview`), pin.imageUrl);
  assert.equal(
    normalizeImageUrl(`${pin.imageUrl}?size=large`),
    `${pin.imageUrl}?size=large`,
  );
  for (const url of [
    null,
    {},
    "data:image/png;base64,abc",
    "ftp://i.pinimg.com/image.jpg",
    "https://i.pinimg.com.evil.test/image.jpg",
    "https://example.com/image.jpg",
    "https://i.pinimg.com/",
    "https://i.pinimg.com/video.mp4",
    "https://user:secret@i.pinimg.com/image.jpg",
  ]) {
    assert.equal(normalizeImageUrl(url), null, String(url));
  }
});

test("a valid message with pinUrl, imageUrl, and title becomes a new normalized object", () => {
  const result = validateImportMessage(pin);
  assert.deepEqual(result, {
    pinId: "123456789",
    pinUrl: "https://www.pinterest.com/pin/123456789/",
    imageUrl: pin.imageUrl,
    title: pin.title,
    description: "",
    author: "",
    isVideo: false,
  });
  assert.notEqual(result, pin);
  assert.match(pin.pinUrl, /utm_source/);
});

test("messages missing pinUrl or imageUrl are rejected", () => {
  assert.equal(validateImportMessage({ imageUrl: pin.imageUrl }), null);
  assert.equal(validateImportMessage({ pinUrl: pin.pinUrl }), null);
});

test("messages reject non-objects, missing Pin IDs, mismatched IDs, and invalid URLs", () => {
  for (const message of [
    null,
    undefined,
    false,
    "pin",
    [],
    {},
    { ...pin, pinUrl: "https://www.pinterest.com/pin/" },
    { ...pin, pinId: "999" },
    { ...pin, imageUrl: "javascript:alert(1)" },
  ]) {
    assert.equal(validateImportMessage(message), null);
  }
});

test("optional metadata is normalized without trusting arbitrary field types", () => {
  assert.deepEqual(
    validateImportMessage({
      ...pin,
      title: {},
      description: "  A room  ",
      author: "  Designer ",
      isVideo: "false",
      extra: "ignored",
    }),
    {
      pinId: "123456789",
      pinUrl: "https://www.pinterest.com/pin/123456789/",
      imageUrl: pin.imageUrl,
      title: "",
      description: "A room",
      author: "Designer",
      isVideo: false,
    },
  );
  assert.equal(validateImportMessage({ ...pin, isVideo: true }).isVideo, true);
});

function runPreload() {
  const sent = [];
  const listeners = {};
  const exposed = {};
  const events = [];
  vm.runInNewContext(
    fs.readFileSync(path.join(__dirname, "../js/webview-preload.js"), "utf8"),
    {
      require(name) {
        assert.equal(name, "electron", "preload must require only Electron");
        return {
          contextBridge: {
            exposeInMainWorld: (key, value) => {
              exposed[key] = value;
            },
          },
          ipcRenderer: {
            sendToHost: (...args) => sent.push(args),
            on: (channel, listener) => {
              listeners[channel] = listener;
            },
          },
        };
      },
      window: { dispatchEvent: (event) => events.push(event) },
      CustomEvent: class {
        constructor(type, options) {
          this.type = type;
          this.detail = options.detail;
        }
      },
    },
  );
  return { sent, listeners, exposed, events };
}

test("isolated preload exposes only send and forwards the fixed import envelope", () => {
  const { sent, exposed } = runPreload();
  assert.deepEqual(Object.keys(exposed), ["eaglePinterestHost"]);
  assert.deepEqual(Object.keys(exposed.eaglePinterestHost), ["send"]);
  exposed.eaglePinterestHost.send({
    type: "eagle-pinterest-import",
    payload: pin,
  });
  assert.deepEqual(JSON.parse(JSON.stringify(sent)), [
    [
      "eagle-pinterest-import",
      { type: "eagle-pinterest-import", payload: pin },
    ],
  ]);
  exposed.eaglePinterestHost.send({ type: "other-channel", payload: pin });
  assert.equal(sent.length, 1);
});

test("preload translates host status to browser events without exposing the IPC event", () => {
  const { listeners, events } = runPreload();
  const status = { pinId: "123456789", state: "done" };
  listeners["eagle-pinterest-import-status"]({ sender: "private" }, status);
  assert.equal(events[0].type, "eagle-pinterest-import-status");
  assert.deepEqual(JSON.parse(JSON.stringify(events[0].detail)), status);
});

test("injected script is self-contained and returns false when messaging is unavailable", () => {
  assert.equal(
    vm.runInNewContext(getInjectedCardScript(), { window: {} }),
    false,
  );
});

function runPlugin({ messaging = true, handler } = {}) {
  const elements = {};
  const loaded = [];
  const sent = [];
  const external = [];
  const listeners = {};
  for (const id of [
    "searchForm",
    "searchInput",
    "searchButton",
    "importStatus",
    "settingsButton",
    "pinterestView",
    "openPinterestButton",
    "loginNotice",
  ]) {
    elements[id] = {
      value: "  interior design ",
      hidden: true,
      disabled: false,
      textContent: "",
      attributes: {},
      setAttribute(key, value) {
        this.attributes[key] = value;
      },
      addEventListener(name, callback) {
        listeners[`${id}:${name}`] = callback;
      },
    };
  }
  const view = elements.pinterestView;
  view.src = "";
  if (messaging) {
    view.loadURL = async (url) => {
      loaded.push(url);
    };
    view.getURL = () => loaded.at(-1) || "about:blank";
    view.executeJavaScript = async (script) => {
      assert.equal(script, getInjectedCardScript());
      return true;
    };
    view.send = (...args) => sent.push(args);
  }
  let create;
  const page = { eaglePinterestImportHandler: handler };
  const pluginSource = fs.readFileSync(
    path.join(__dirname, "../js/plugin.js"),
    "utf8",
  );
  vm.runInNewContext(pluginSource, {
    require,
    __dirname: path.join(__dirname, ".."),
    document: {
      baseURI: require("node:url").pathToFileURL(
        path.join(__dirname, "../index.html"),
      ).href,
      getElementById: (id) => elements[id],
    },
    window: page,
    eagle: {
      onPluginCreate(callback) {
        create = callback;
      },
      shell: {
        openExternal: async (url) => {
          external.push(url);
        },
      },
    },
  });
  return {
    elements,
    loaded,
    sent,
    external,
    listeners,
    page,
    ready: () => create({ path: path.join(__dirname, "..") }),
  };
}

test("host waits for Eagle readiness, resolves an absolute preload, and navigates on submit", async () => {
  const host = runPlugin();
  await host.listeners["searchForm:submit"]({ preventDefault() {} });
  assert.equal(host.loaded.length, 0);
  host.ready();
  assert.equal(host.elements.searchButton.disabled, true);
  assert.equal(host.elements.pinterestView.src, "about:blank");
  assert.match(host.elements.pinterestView.attributes.preload, /^file:\/\//);
  assert.match(
    host.elements.pinterestView.attributes.preload,
    /\/js\/webview-preload\.js$/,
  );
  await host.listeners["searchForm:submit"]({ preventDefault() {} });
  assert.equal(host.loaded.length, 0);
  await host.listeners["pinterestView:dom-ready"]();
  assert.equal(host.elements.searchButton.disabled, false);
  await host.listeners["searchForm:submit"]({ preventDefault() {} });
  assert.equal(host.loaded.at(-1), buildSearchUrl("interior design"));
  await host.listeners["pinterestView:did-finish-load"]();
  assert.equal(host.elements.openPinterestButton.hidden, true);
});

test("host accepts only validated import-channel messages and relays callback status", async () => {
  const handled = [];
  const host = runPlugin({
    handler: (payload, update) => {
      handled.push(payload);
      update({ state: "done" });
    },
  });
  host.ready();
  await host.listeners["pinterestView:dom-ready"]();
  await host.listeners["searchForm:submit"]({ preventDefault() {} });
  const receive = host.listeners["pinterestView:ipc-message"];
  await receive({
    channel: "unrelated",
    args: [{ type: "eagle-pinterest-import", payload: pin }],
  });
  await receive({
    channel: "eagle-pinterest-import",
    args: [{ type: "other", payload: pin }],
  });
  await receive({
    channel: "eagle-pinterest-import",
    args: [{ type: "eagle-pinterest-import", payload: {} }],
  });
  assert.equal(handled.length, 0);
  await receive({
    channel: "eagle-pinterest-import",
    args: [{ type: "eagle-pinterest-import", payload: pin }],
  });
  assert.equal(handled.length, 1);
  assert.equal(handled[0].pinId, "123456789");
  assert.deepEqual(JSON.parse(JSON.stringify(host.sent.at(-1))), [
    "eagle-pinterest-import-status",
    { pinId: "123456789", state: "done" },
  ]);
});

test("unconnected or failing import callbacks return Retry status without pretending an import occurred", async () => {
  for (const handler of [
    undefined,
    async () => {
      throw new Error("not available");
    },
  ]) {
    const host = runPlugin({ handler });
    host.ready();
    await host.listeners["pinterestView:dom-ready"]();
    await host.listeners["searchForm:submit"]({ preventDefault() {} });
    await host.listeners["pinterestView:ipc-message"]({
      channel: "eagle-pinterest-import",
      args: [{ type: "eagle-pinterest-import", payload: pin }],
    });
    assert.equal(host.sent.at(-1)[1].state, "error");
    assert.match(
      host.elements.importStatus.textContent,
      /not (connected|available)/i,
    );
  }
});

test("missing webview support exposes an explicit external Pinterest fallback safely after readiness", async () => {
  const host = runPlugin({ messaging: false });
  await host.listeners["openPinterestButton:click"]();
  assert.equal(host.external.length, 0);
  host.ready();
  assert.equal(host.elements.openPinterestButton.hidden, false);
  await host.listeners["openPinterestButton:click"]();
  assert.equal(host.external[0], buildSearchUrl("interior design"));
});

test("a button is injected once per card even when observer passes see multiple Pin links", () => {
  const fixture = cardFixture({
    extraHrefs: ["https://www.pinterest.com/pin/987654321/"],
  });
  const host = runCards([fixture]);
  host.mutate({ type: "childList", addedNodes: [fixture.card] });
  host.mutate({ type: "childList", addedNodes: [fixture.card] });
  assert.equal(fixture.buttons.length, 1);
  assert.equal(
    fixture.buttons[0].getAttribute("data-eagle-pin-id"),
    "123456789",
  );
});

test("a nested pinWrapper and pin card receive one control for the rendered Pin", () => {
  const fixture = cardFixture({ nestedWrapper: true });
  const host = runCards([fixture]);
  host.mutate({ type: "childList", addedNodes: [fixture.wrapper] });
  assert.equal(fixture.buttons.length + fixture.wrapperButtons.length, 1);
});

test("changing an image in a grid-item wrapper does not add a second control", () => {
  const fixture = cardFixture({ gridItem: true });
  const host = runCards([fixture]);
  const countButtons = () =>
    fixture.buttons.length +
    fixture.wrapperButtons.length +
    fixture.gridButtons.length;
  assert.equal(countButtons(), 1);
  fixture.image.attributes.src =
    "https://i.pinimg.com/736x/ab/cd/ef/changed.jpg";
  host.mutate({ type: "attributes", target: fixture.image, addedNodes: [] });
  assert.equal(countButtons(), 1);
});

test("a click resolves the current Pin link and image after the card DOM changes", () => {
  const fixture = cardFixture();
  const host = runCards([fixture]);
  fixture.setHref("https://www.pinterest.com/pin/987654321/");
  fixture.image.attributes.src = "https://i.pinimg.com/736x/98/76/54/new.jpg";
  fixture.image.attributes.srcset = "";
  fixture.image.attributes["data-src"] = "";
  fixture.buttons[0].listeners.click({
    preventDefault() {},
    stopImmediatePropagation() {},
  });
  assert.equal(host.sent.length, 1);
  assert.equal(host.sent[0].payload.pinId, "987654321");
  assert.equal(
    host.sent[0].payload.pinUrl,
    "https://www.pinterest.com/pin/987654321/",
  );
  assert.equal(
    host.sent[0].payload.imageUrl,
    "https://i.pinimg.com/736x/98/76/54/new.jpg",
  );
});

// Small DOM fixture: only browser APIs exercised by the injected bridge are
// supplied. No requests, Pinterest sessions, scrolling, or downloads occur.
function cardFixture({
  imageInsideLink = true,
  href = pin.pinUrl,
  nestedWrapper = false,
  gridItem = false,
  extraHrefs = [],
  extraImages = [],
} = {}) {
  const buttons = [];
  const wrapperButtons = [];
  const gridButtons = [];
  const image = {
    alt: "Interior design",
    naturalWidth: 236,
    attributes: {
      src: "https://i.pinimg.com/236x/ab/cd/ef/small.jpg",
      srcset:
        "https://i.pinimg.com/474x/ab/cd/ef/medium.jpg 474w, https://i.pinimg.com/736x/ab/cd/ef/large.jpg 736w",
      "data-src": "https://i.pinimg.com/originals/ab/cd/ef/original.jpg",
    },
    getAttribute(key) {
      return this.attributes[key] || null;
    },
    closest(selector) {
      if (selector.includes("data-grid-item") && gridItem) return grid;
      if (selector.includes('data-test-id="pinWrapper"') && gridItem)
        return card;
      if (selector.includes('data-test-id="pin"'))
        return gridItem ? null : card;
      return imageInsideLink && selector === "a[href]" ? link : null;
    },
    querySelectorAll() {
      return [];
    },
    querySelector() {
      return null;
    },
    nodeType: 1,
  };
  const card = {
    style: {},
    nodeType: 1,
    matches(selector) {
      return gridItem && selector.includes("data-grid-item");
    },
    closest(selector) {
      if (selector.includes('data-test-id="pin"'))
        return gridItem ? null : this;
      if (selector.includes('data-test-id="pinWrapper"')) return this;
      if (selector.includes("data-grid-item")) return gridItem ? grid : null;
      return null;
    },
    querySelector(selector) {
      if (selector.includes('data-test-id="pin"')) return null;
      return selector === "button[data-eagle-pin-id]"
        ? buttons[0] || null
        : null;
    },
    querySelectorAll(selector) {
      return selector === "img"
        ? [image, ...extraImages]
        : selector === "a[href]"
          ? [
              link,
              ...extraHrefs.map((extraHref) => ({
                getAttribute() {
                  return extraHref;
                },
                querySelector() {
                  return imageInsideLink ? image : null;
                },
                closest(selector) {
                  return selector === "a[href]" ? this : card;
                },
                querySelectorAll() {
                  return imageInsideLink ? [image] : [];
                },
                nodeType: 1,
              })),
            ]
          : [];
    },
    appendChild(button) {
      buttons.push(button);
    },
  };
  const grid = {
    style: {},
    nodeType: 1,
    matches(selector) {
      return selector.includes("data-grid-item");
    },
    closest(selector) {
      return selector.includes("data-grid-item") ? this : null;
    },
    querySelector(selector) {
      return selector === "button[data-eagle-pin-id]"
        ? gridButtons[0] || null
        : null;
    },
    querySelectorAll(selector) {
      if (selector === "a[href]") return [link];
      if (selector === "img") return [image];
      return [];
    },
    appendChild(button) {
      gridButtons.push(button);
    },
  };
  const wrapper = {
    style: {},
    nodeType: 1,
    matches(selector) {
      return selector.includes('data-test-id="pinWrapper"');
    },
    closest(selector) {
      return selector.includes('data-test-id="pinWrapper"') ? this : null;
    },
    querySelector(selector) {
      if (selector.includes('data-test-id="pin"')) return card;
      return selector === "button[data-eagle-pin-id]"
        ? wrapperButtons[0] || null
        : null;
    },
    querySelectorAll(selector) {
      if (selector === "a[href]") return [link];
      if (selector === "img") return [image];
      return [];
    },
    appendChild(button) {
      wrapperButtons.push(button);
    },
  };
  const link = {
    getAttribute() {
      return href;
    },
    querySelector(selector) {
      return selector === "img" && imageInsideLink ? image : null;
    },
    closest(selector) {
      return selector === "a[href]"
        ? this
        : selector.includes('data-test-id="pin"')
          ? gridItem
            ? null
            : card
          : selector.includes('data-test-id="pinWrapper"') && gridItem
            ? card
            : selector.includes("data-grid-item") && gridItem
              ? grid
              : selector.includes('data-test-id="pinWrapper"') && nestedWrapper
                ? wrapper
                : null;
    },
    querySelectorAll(selector) {
      return selector === "img" && imageInsideLink ? [image] : [];
    },
    nodeType: 1,
  };
  return {
    card,
    wrapper: nestedWrapper ? wrapper : null,
    link,
    image,
    buttons,
    wrapperButtons,
    gridButtons,
    setHref(value) {
      href = value;
    },
  };
}

function runCards(fixtures) {
  const events = {};
  const sent = [];
  let observer;
  let observers = 0;
  const root = {
    closest() {
      return null;
    },
    querySelectorAll() {
      return fixtures.map((fixture) => fixture.link);
    },
    querySelector() {
      return null;
    },
    appendChild() {},
  };
  const context = vm.createContext({
    URL: require("node:url").URL,
    document: {
      documentElement: root,
      head: { appendChild() {} },
      createElement() {
        return {
          attributes: {},
          listeners: {},
          disabled: false,
          setAttribute(key, value) {
            this.attributes[key] = value;
          },
          getAttribute(key) {
            return this.attributes[key];
          },
          addEventListener(type, callback) {
            this.listeners[type] = callback;
          },
          remove() {
            for (const fixture of fixtures) {
              const cardIndex = fixture.buttons.indexOf(this);
              if (cardIndex >= 0) fixture.buttons.splice(cardIndex, 1);
              const wrapperIndex = fixture.wrapperButtons.indexOf(this);
              if (wrapperIndex >= 0)
                fixture.wrapperButtons.splice(wrapperIndex, 1);
            }
          },
        };
      },
      querySelectorAll() {
        return fixtures.flatMap((fixture) => [
          ...fixture.buttons,
          ...fixture.wrapperButtons,
        ]);
      },
    },
    window: {
      location: { href: "https://www.pinterest.com/search/pins/?q=interior" },
      eaglePinterestHost: { send: (message) => sent.push(message) },
      addEventListener(type, callback) {
        events[type] = callback;
      },
      getComputedStyle() {
        return { position: "static" };
      },
      MutationObserver: class {
        constructor(callback) {
          observers++;
          observer = callback;
        }
        observe() {}
        disconnect() {}
      },
    },
  });
  const inject = () => vm.runInContext(getInjectedCardScript(), context);
  inject();
  return {
    sent,
    events,
    inject,
    observers: () => observers,
    mutate: (record) => observer([record]),
  };
}

test("rendered cards get one button, choose the best image, and import only on a stopped user click", () => {
  const fixture = cardFixture();
  const host = runCards([fixture]);
  host.inject();
  host.mutate({ type: "childList", addedNodes: [fixture.card] });
  assert.equal(host.observers(), 1);
  assert.equal(fixture.buttons.length, 1);
  assert.equal(host.sent.length, 0);
  const button = fixture.buttons[0];
  assert.equal(button.getAttribute("data-eagle-pin-id"), "123456789");
  let prevented = false;
  let stopped = false;
  button.listeners.click({
    preventDefault() {
      prevented = true;
    },
    stopImmediatePropagation() {
      stopped = true;
    },
  });
  assert.equal(prevented && stopped, true);
  assert.equal(button.textContent, "Importing…");
  assert.equal(button.disabled, true);
  assert.equal(host.sent[0].type, "eagle-pinterest-import");
  assert.equal(
    host.sent[0].payload.imageUrl,
    fixture.image.attributes["data-src"],
  );
  host.events["eagle-pinterest-import-status"]({
    detail: { pinId: "999", state: "done" },
  });
  assert.equal(button.textContent, "Importing…");
  host.events["eagle-pinterest-import-status"]({
    detail: { pinId: "123456789", state: "error" },
  });
  assert.equal(button.textContent, "Retry");
  assert.equal(button.disabled, false);
  host.events["eagle-pinterest-import-status"]({
    detail: { pinId: "123456789", state: "done" },
  });
  assert.equal(button.textContent, "Imported");
  assert.equal(button.disabled, true);
});

test("srcset beats a smaller src and newly rendered cards are decorated without navigation", () => {
  const fixtures = [];
  const host = runCards(fixtures);
  const fixture = cardFixture();
  delete fixture.image.attributes["data-src"];
  fixtures.push(fixture);
  host.mutate({ type: "childList", addedNodes: [fixture.card] });
  fixture.buttons[0].listeners.click({
    preventDefault() {},
    stopImmediatePropagation() {},
  });
  assert.equal(
    host.sent[0].payload.imageUrl,
    "https://i.pinimg.com/736x/ab/cd/ef/large.jpg",
  );
});

test("malformed links cannot stop other cards from being decorated", () => {
  const valid = cardFixture();
  assert.doesNotThrow(() =>
    runCards([cardFixture({ href: "http://[" }), valid]),
  );
  assert.equal(valid.buttons.length, 1);
});

test("a recycled card replaces its old button with the new Pin ID", () => {
  const fixture = cardFixture();
  const host = runCards([fixture]);
  host.events["eagle-pinterest-import-status"]({
    detail: { pinId: "123456789", state: "done" },
  });
  assert.equal(fixture.buttons[0].textContent, "Imported");
  assert.equal(fixture.buttons[0].disabled, true);
  fixture.setHref("https://www.pinterest.com/pin/987654321/");
  host.mutate({ type: "attributes", target: fixture.link, addedNodes: [] });
  assert.equal(fixture.buttons.length, 1);
  assert.equal(
    fixture.buttons[0].getAttribute("data-eagle-pin-id"),
    "987654321",
  );
  assert.equal(fixture.buttons[0].textContent, "Download to Eagle");
  assert.equal(fixture.buttons[0].className, "pin-import-button");
  assert.equal(fixture.buttons[0].disabled, false);
});

test("late images outside the Pin anchor trigger decoration of their containing card", () => {
  const fixture = cardFixture({ imageInsideLink: false });
  fixture.image.attributes = {};
  const host = runCards([fixture]);
  assert.equal(fixture.buttons.length, 0);
  fixture.image.attributes["data-src"] = pin.imageUrl;
  host.mutate({ type: "attributes", target: fixture.image, addedNodes: [] });
  assert.equal(fixture.buttons.length, 1);
});

test("the Pin image is preferred over a high-resolution author avatar outside the Pin link", () => {
  const avatar = {
    naturalWidth: 100,
    alt: "Author avatar",
    getAttribute(key) {
      return key === "src" ? "https://i.pinimg.com/originals/avatar.jpg" : null;
    },
  };
  const fixture = cardFixture({ extraImages: [avatar] });
  delete fixture.image.attributes["data-src"];
  const host = runCards([fixture]);
  fixture.buttons[0].listeners.click({
    preventDefault() {},
    stopImmediatePropagation() {},
  });
  assert.equal(
    host.sent[0].payload.imageUrl,
    "https://i.pinimg.com/736x/ab/cd/ef/large.jpg",
  );
});

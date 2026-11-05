"use strict";

const { URL, fileURLToPath, pathToFileURL } = require("node:url");
const path = require("node:path");
const {
  buildSearchUrl,
  validateImportMessage,
  getInjectedCardScript,
} = require(fileURLToPath(new URL("js/pinterest-bridge.js", document.baseURI)));

/**
 * Temporary host-only seam for the later import queue. The handler reports
 * actual progress through update; resolving alone never implies an import.
 * @typedef {{state: "queued"|"importing"|"done"|"error", error?: string}} ImportUpdate
 * @typedef {(pin: import("./pinterest-bridge").PinterestPin, update: (status: ImportUpdate) => void) => void|Promise<void>} ImportHandler
 * @typedef {HTMLElement & {loadURL: (url: string) => Promise<void>, getURL: () => string, executeJavaScript: (script: string) => Promise<unknown>, send: (channel: string, status: object) => void}} PinterestWebview
 */
const host =
  /** @type {Window & {eaglePinterestImportHandler?: ImportHandler}} */ (
    window
  );
const searchForm = document.getElementById("searchForm");
const searchInput = /** @type {HTMLInputElement} */ (
  document.getElementById("searchInput")
);
const searchButton = /** @type {HTMLButtonElement} */ (
  document.getElementById("searchButton")
);
const importStatus = document.getElementById("importStatus");
const settingsButton = /** @type {HTMLButtonElement} */ (
  document.getElementById("settingsButton")
);
const openPinterestButton = document.getElementById("openPinterestButton");
const loginNotice = document.getElementById("loginNotice");
const pinterestView = /** @type {PinterestWebview} */ (
  document.getElementById("pinterestView")
);
let pluginReady = false;

function setStatus(text) {
  if (importStatus) importStatus.textContent = text;
}

function showFallback() {
  if (openPinterestButton) openPinterestButton.hidden = false;
  setStatus("Embedded Pinterest messaging is unavailable. Use Open Pinterest.");
}

function supportsWebview() {
  return (
    pinterestView &&
    typeof pinterestView.loadURL === "function" &&
    typeof pinterestView.executeJavaScript === "function" &&
    typeof pinterestView.send === "function"
  );
}

function isPinterestPage() {
  try {
    const url = new URL(pinterestView.getURL());
    return (
      url.protocol === "https:" && /(^|\.)pinterest\.com$/.test(url.hostname)
    );
  } catch (_error) {
    return false;
  }
}

async function navigate() {
  if (!pluginReady) return;
  if (!supportsWebview()) return showFallback();
  if (!searchInput?.value.trim()) {
    setStatus("Enter a Pinterest search term.");
    return;
  }
  setStatus("Loading Pinterest…");
  if (loginNotice) loginNotice.hidden = false;
  try {
    await pinterestView.loadURL(buildSearchUrl(searchInput.value));
  } catch (_error) {
    showFallback();
  }
}

searchForm?.addEventListener("submit", (event) => {
  event.preventDefault();
  return navigate();
});

openPinterestButton?.addEventListener("click", async () => {
  if (!pluginReady) return;
  try {
    await eagle.shell.openExternal(
      searchInput?.value.trim()
        ? buildSearchUrl(searchInput.value)
        : "https://www.pinterest.com/",
    );
  } catch (_error) {
    setStatus("Pinterest could not be opened.");
  }
});

pinterestView?.addEventListener("did-finish-load", async () => {
  if (!pluginReady || !supportsWebview() || !isPinterestPage()) return;
  try {
    const available = await pinterestView.executeJavaScript(
      getInjectedCardScript(),
    );
    if (available !== true) return showFallback();
    if (openPinterestButton) openPinterestButton.hidden = true;
    setStatus("Choose a Pin to send to Eagle.");
  } catch (_error) {
    showFallback();
  }
});

pinterestView?.addEventListener("ipc-message", async (event) => {
  if (!pluginReady || !isPinterestPage()) return;
  const ipc = /** @type {Event & {channel?: string, args?: unknown[]}} */ (
    event
  );
  if (ipc.channel !== "eagle-pinterest-import") return;
  const envelope = /** @type {{type?: string, payload?: unknown}} */ (
    ipc.args?.[0]
  );
  if (!envelope || envelope.type !== "eagle-pinterest-import") return;
  const pin = validateImportMessage(envelope.payload);
  if (!pin) return;
  /** @param {ImportUpdate} status */
  const update = (status) => {
    try {
      pinterestView.send("eagle-pinterest-import-status", {
        pinId: pin.pinId,
        ...status,
      });
    } catch (_error) {
      showFallback();
    }
    if (status.error) setStatus(status.error);
  };
  update({ state: "importing" });
  if (typeof host.eaglePinterestImportHandler !== "function") {
    update({
      state: "error",
      error: "The Eagle importer is not connected yet.",
    });
    return;
  }
  try {
    await host.eaglePinterestImportHandler(pin, update);
  } catch (error) {
    update({
      state: "error",
      error:
        error instanceof Error
          ? error.message
          : "The importer is not available.",
    });
  }
});

pinterestView?.addEventListener("did-fail-load", (event) => {
  const failure =
    /** @type {Event & {errorCode?: number, isMainFrame?: boolean}} */ (event);
  if (failure.isMainFrame === false || failure.errorCode === -3) return;
  if (pluginReady) showFallback();
});

if (searchButton) searchButton.disabled = true;
if (settingsButton) {
  settingsButton.disabled = true;
  settingsButton.title = "Settings will be available in a future update.";
}

if (typeof eagle !== "undefined") {
  eagle.onPluginCreate((plugin) => {
    // Configure isolation and an absolute file URL before creating the guest.
    pinterestView?.setAttribute(
      "webpreferences",
      "contextIsolation=yes,nodeIntegration=no,sandbox=yes",
    );
    pinterestView?.setAttribute(
      "preload",
      pathToFileURL(path.join(plugin.path, "js", "webview-preload.js")).href,
    );
    pluginReady = true;
    if (searchButton) searchButton.disabled = false;
    if (!supportsWebview()) return showFallback();
    setStatus("Enter a keyword to search Pinterest.");
  });
} else {
  showFallback();
}

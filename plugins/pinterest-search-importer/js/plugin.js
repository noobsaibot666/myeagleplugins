"use strict";

const { URL, fileURLToPath, pathToFileURL } = require("node:url");
const path = require("node:path");
const {
  buildSearchUrl,
  validateImportMessage,
  getInjectedCardScript,
} = require(fileURLToPath(new URL("js/pinterest-bridge.js", document.baseURI)));

const { importPin, getCurrentTargetFolderIds } = require(
  fileURLToPath(new URL("js/eagle-importer.js", document.baseURI)),
);
const { createImportQueue } = require(
  fileURLToPath(new URL("js/import-queue.js", document.baseURI)),
);

/** @typedef {HTMLElement & {src: string, loadURL: (url: string) => Promise<void>, getURL: () => string, executeJavaScript: (script: string) => Promise<unknown>, send: (channel: string, status: object) => void}} PinterestWebview */
const searchForm = document.getElementById("searchForm");
const searchInput = /** @type {HTMLInputElement} */ (
  document.getElementById("searchInput")
);
const searchButton = /** @type {HTMLButtonElement} */ (
  document.getElementById("searchButton")
);
const importStatus = document.getElementById("importStatus");
const importCounts = document.getElementById("importCounts");
const clearHistoryButton = /** @type {HTMLButtonElement} */ (
  document.getElementById("clearHistoryButton")
);
const settingsButton = /** @type {HTMLButtonElement} */ (
  document.getElementById("settingsButton")
);
const openPinterestButton = document.getElementById("openPinterestButton");
const loginNotice = document.getElementById("loginNotice");
const pinterestView = /** @type {PinterestWebview} */ (
  document.getElementById("pinterestView")
);
let pluginReady = false;
let guestReady = false;

const importQueue = createImportQueue({
  concurrency: 3,
  importer: async (pin) => {
    const job =
      /** @type {import("./pinterest-bridge").PinterestPin & {targetFolderIds: Promise<string[]>}} */ (
        pin
      );
    return importPin(eagle, job, { folderIds: await job.targetFolderIds });
  },
  onUpdate: (status) => {
    updateCounts();
    sendStatus(status);
    if (status.error) setStatus(status.error);
  },
});

function updateCounts() {
  const { imported, queued, failed } = importQueue.getCounts();
  if (importCounts) {
    importCounts.textContent = `Imported ${imported} · Queued ${queued} · Failed ${failed}`;
  }
}

/** @param {object} status */
function sendStatus(status) {
  if (!pluginReady || !guestReady || !isPinterestPage()) return;
  try {
    pinterestView.send("eagle-pinterest-import-status", status);
  } catch (_error) {
    showFallback();
  }
}

clearHistoryButton?.addEventListener("click", () => {
  if (!pluginReady) return;
  importQueue.clearHistory();
  updateCounts();
  setStatus("Session history cleared.");
});

function setStatus(text) {
  if (importStatus) importStatus.textContent = text;
}

function showFallback() {
  if (openPinterestButton) openPinterestButton.hidden = false;
  if (searchButton) searchButton.disabled = true;
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
  if (!pluginReady || !guestReady) return;
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
  if (!pluginReady || !guestReady || !supportsWebview() || !isPinterestPage())
    return;
  try {
    const available = await pinterestView.executeJavaScript(
      getInjectedCardScript(),
    );
    if (available !== true) return showFallback();
    sendStatus({ history: importQueue.getUpdates() });
    if (openPinterestButton) openPinterestButton.hidden = true;
    setStatus("Choose a Pin to send to Eagle.");
  } catch (_error) {
    showFallback();
  }
});

pinterestView?.addEventListener("dom-ready", () => {
  if (!pluginReady) return;
  guestReady = true;
  if (searchButton) searchButton.disabled = false;
  if (!supportsWebview()) return showFallback();
  setStatus("Enter a keyword to search Pinterest.");
});

pinterestView?.addEventListener("ipc-message", async (event) => {
  if (!pluginReady || !guestReady || !isPinterestPage()) return;
  const ipc = /** @type {Event & {channel?: string, args?: unknown[]}} */ (
    event
  );
  if (ipc.channel !== "eagle-pinterest-import") return;
  const envelope =
    /** @type {{type?: string, payload?: unknown, retry?: boolean}} */ (
      ipc.args?.[0]
    );
  if (!envelope || envelope.type !== "eagle-pinterest-import") return;
  const pin = validateImportMessage(envelope.payload);
  if (!pin) return;
  // Capture the destination now without awaiting it, so queued jobs keep
  // click order and cannot drift into a folder selected later.
  const job = { ...pin, targetFolderIds: getCurrentTargetFolderIds(eagle) };
  await (envelope.retry === true
    ? importQueue.retry(job)
    : importQueue.enqueue(job));
});

pinterestView?.addEventListener("did-fail-load", (event) => {
  const failure =
    /** @type {Event & {errorCode?: number, isMainFrame?: boolean}} */ (event);
  if (failure.isMainFrame === false || failure.errorCode === -3) return;
  if (pluginReady) showFallback();
});

if (searchButton) searchButton.disabled = true;
if (clearHistoryButton) clearHistoryButton.disabled = true;
updateCounts();
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
    pinterestView?.setAttribute("src", "about:blank");
    pinterestView.src = "about:blank";
    pluginReady = true;
    if (clearHistoryButton) clearHistoryButton.disabled = false;
    if (!supportsWebview()) return showFallback();
    setStatus("Initializing Pinterest…");
  });
} else {
  showFallback();
}

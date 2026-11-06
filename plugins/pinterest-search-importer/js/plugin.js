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
const {
  DEFAULT_SETTINGS,
  normalizeSettings,
  loadSettings,
  saveSettings,
} = require(fileURLToPath(new URL("js/settings.js", document.baseURI)));

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
let settings = { ...DEFAULT_SETTINGS };
try {
  settings = loadSettings(localStorage);
} catch (_error) {
  // Preferences still work for this session if storage is unavailable.
}
const settingsPanel = document.getElementById("settingsPanel");
const imageVariant = /** @type {HTMLSelectElement} */ (
  document.getElementById("imageVariant")
);
const addPinterestTag = /** @type {HTMLInputElement} */ (
  document.getElementById("addPinterestTag")
);
const addSearchTag = /** @type {HTMLInputElement} */ (
  document.getElementById("addSearchTag")
);
const openPinAfterImport = /** @type {HTMLInputElement} */ (
  document.getElementById("openPinAfterImport")
);

function renderSettings() {
  imageVariant.value = settings.imageVariant;
  addPinterestTag.checked = settings.addPinterestTag;
  addSearchTag.checked = settings.addSearchTag;
  openPinAfterImport.checked = settings.openPinAfterImport;
}

function persistSettings() {
  try {
    if (saveSettings(localStorage, settings)) return;
  } catch (_error) {
    // Access to localStorage itself can fail in some host configurations.
  }
  setStatus("Settings apply for this session; local storage is unavailable.");
}

for (const control of [
  imageVariant,
  addPinterestTag,
  addSearchTag,
  openPinAfterImport,
]) {
  control?.addEventListener("change", () => {
    settings = normalizeSettings({
      imageVariant: imageVariant.value,
      addPinterestTag: addPinterestTag.checked,
      addSearchTag: addSearchTag.checked,
      openPinAfterImport: openPinAfterImport.checked,
    });
    persistSettings();
  });
}
settingsButton?.addEventListener("click", () => {
  settingsPanel.hidden = !settingsPanel.hidden;
  settingsButton.setAttribute("aria-expanded", String(!settingsPanel.hidden));
});
document
  .getElementById("resetSettingsButton")
  ?.addEventListener("click", () => {
    settings = { ...DEFAULT_SETTINGS };
    renderSettings();
    persistSettings();
  });
renderSettings();

const importQueue = createImportQueue({
  concurrency: 3,
  importer: async (pin) => {
    const job =
      /** @type {import("./pinterest-bridge").PinterestPin & {targetFolderIds: Promise<string[]>, settings: import("./settings").ImportSettings, searchTerm: string}} */ (
        pin
      );
    return importPin(eagle, job, {
      folderIds: await job.targetFolderIds,
      settings: job.settings,
      searchTerm: job.searchTerm,
    });
  },
  onUpdate: (status) => {
    updateCounts();
    sendStatus(status);
    if (status.error) setStatus(status.error);
    else if (status.state === "done") setStatus("Imported to Eagle.");
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
  const job = {
    ...pin,
    targetFolderIds: getCurrentTargetFolderIds(eagle),
    settings: { ...settings },
    searchTerm: new URL(pinterestView.getURL()).searchParams.get("q") || "",
  };
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

const keywordTab = document.getElementById("keywordTab");
const imageTab = document.getElementById("imageTab");
const imageSearchPanel = document.getElementById("imageSearchPanel");
const imageDropZone = document.getElementById("imageDropZone");
const imageFileInput = /** @type {HTMLInputElement} */ (
  document.getElementById("imageFileInput")
);
const imagePreview = /** @type {HTMLImageElement} */ (
  document.getElementById("imagePreview")
);
const imageInputStatus = document.getElementById("imageInputStatus");
let previewObjectUrl = "";

/** @param {boolean} imageSearch */
function switchTab(imageSearch) {
  imageSearchPanel.hidden = !imageSearch;
  pinterestView.hidden = imageSearch;
  searchForm.hidden = imageSearch;
  if (loginNotice) loginNotice.hidden = imageSearch;
  keywordTab.setAttribute("aria-selected", String(!imageSearch));
  imageTab.setAttribute("aria-selected", String(imageSearch));
  keywordTab.tabIndex = imageSearch ? -1 : 0;
  imageTab.tabIndex = imageSearch ? 0 : -1;
}
keywordTab?.addEventListener("click", () => switchTab(false));
imageTab?.addEventListener("click", () => switchTab(true));
for (const tab of [keywordTab, imageTab]) {
  tab?.addEventListener("keydown", (event) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const imageSearch =
      event.key === "End" || (event.key !== "Home" && tab === keywordTab);
    switchTab(imageSearch);
    (imageSearch ? imageTab : keywordTab).focus();
  });
}

function clearImage() {
  imagePreview.removeAttribute("src");
  imagePreview.hidden = true;
  if (previewObjectUrl) window.URL.revokeObjectURL(previewObjectUrl);
  previewObjectUrl = "";
  imageFileInput.value = "";
  imageInputStatus.textContent =
    "No image selected. Images stay in this session only.";
}

/** @param {string} source @param {string} label */
function showImage(source, label) {
  clearImage();
  imagePreview.src = source;
  imagePreview.hidden = false;
  imageInputStatus.textContent = `${label} accepted for compatibility preview. Visual search is not available yet.`;
}

/** @param {string} name */
function isImageName(name) {
  return /\.(jpe?g|png|gif|webp|avif|bmp|tiff?|svg)$/i.test(name);
}

/** @param {File & {path?: string}} file */
function acceptLocalImage(file) {
  if (
    !file ||
    !(file.type.startsWith("image/") || (!file.type && isImageName(file.name)))
  ) {
    imageInputStatus.textContent = "Choose an image file to preview.";
    return;
  }
  const source = file.path
    ? pathToFileURL(file.path).href
    : window.URL.createObjectURL(file);
  showImage(source, file.name || "Local image");
  if (!file.path) previewObjectUrl = source;
}

document
  .getElementById("eagleImageButton")
  ?.addEventListener("click", async () => {
    if (!pluginReady) return;
    try {
      const selected = await eagle.item.getSelected();
      const item = selected.find((candidate) =>
        isImageName(`image.${candidate.ext}`),
      );
      if (!item || !(item.fileURL || item.filePath)) {
        imageInputStatus.textContent =
          "Select an image in Eagle, then try again.";
        return;
      }
      showImage(
        item.fileURL || pathToFileURL(item.filePath).href,
        item.name || "Eagle image",
      );
    } catch (_error) {
      imageInputStatus.textContent =
        "The selected Eagle image could not be read.";
    }
  });
document
  .getElementById("clipboardImageButton")
  ?.addEventListener("click", async () => {
    if (!pluginReady) return;
    try {
      const image = await eagle.clipboard.readImage();
      if (!image || image.isEmpty()) {
        imageInputStatus.textContent = "The clipboard contains no image.";
        return;
      }
      showImage(image.toDataURL(), "Clipboard image");
    } catch (_error) {
      imageInputStatus.textContent = "The clipboard image could not be read.";
    }
  });
imageFileInput?.addEventListener("change", () =>
  acceptLocalImage(imageFileInput.files?.[0]),
);
imageDropZone?.addEventListener("dragover", (event) => event.preventDefault());
imageDropZone?.addEventListener("drop", (event) => {
  event.preventDefault();
  acceptLocalImage(event.dataTransfer?.files?.[0]);
});
document
  .getElementById("clearImageButton")
  ?.addEventListener("click", clearImage);
window.addEventListener?.("pagehide", clearImage);

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

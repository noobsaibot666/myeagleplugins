"use strict";

const { URL, fileURLToPath, pathToFileURL } = require("node:url");
const path = require("node:path");
const {
  buildSearchUrl,
  validateImportMessage,
  getInjectedCardScript,
  getCollectResultsScript,
  getAdvanceResultsScript,
} = require(fileURLToPath(new URL("js/pinterest-bridge.js", document.baseURI)));
const { dedupePinterestResults } = require(fileURLToPath(new URL("js/native-results.js", document.baseURI)));
const { createSessionState, reduceSessionState } = require(fileURLToPath(new URL("js/session-state.js", document.baseURI)));
const { createResultsView } = require(fileURLToPath(new URL("js/native-results-view.js", document.baseURI)));

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
const sessionAction = document.getElementById("sessionAction");
const sessionStatus = document.getElementById("sessionStatus");
const signInPanel = document.getElementById("signInPanel");
const resultsGrid = document.getElementById("resultsGrid");
const resultsPanel = document.getElementById("resultsPanel");
const emptyState = document.getElementById("emptyState");
const emptyTitle = document.getElementById("emptyTitle");
const emptyMessage = document.getElementById("emptyMessage");
const resultsTitle = document.getElementById("resultsTitle");
const resultsSubtitle = document.getElementById("resultsSubtitle");
const resultCount = document.getElementById("resultCount");
const pinterestView = /** @type {PinterestWebview} */ (
  document.getElementById("pinterestView")
);
let pluginReady = false;
let guestReady = false;
let sessionState = createSessionState();
let currentResults = [];
let resultPoll = null;
let advanceInFlight = false;
let lastAdvanceAt = 0;
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

const resultsView = resultsGrid ? createResultsView({
  grid: resultsGrid,
  emptyState,
  emptyTitle,
  emptyMessage,
  resultCount,
  onSave: (pin, action) => savePin(pin, action),
}) : null;

function renderSessionState() {
  if (!sessionStatus) return;
  sessionStatus.textContent = sessionState.status === "authenticated" ? "Pinterest connected" : sessionState.status === "required" ? "Sign in required" : "Checking session…";
  sessionStatus.className = sessionState.status;
  if (sessionAction) {
    sessionAction.hidden = sessionState.status !== "required";
    sessionAction.textContent = "Sign in";
  }
}

function applySessionEvent(event) {
  sessionState = reduceSessionState(sessionState, event);
  renderSessionState();
}

async function savePin(pin, action) {
  if (!pluginReady) return;
  const job = { ...pin, targetFolderIds: getCurrentTargetFolderIds(eagle), settings: { ...settings }, searchTerm: searchInput?.value.trim() || "" };
  action.disabled = true;
  action.className = "result-card-action saving";
  action.textContent = "…";
  action.setAttribute("aria-label", "Saving to Eagle");
  action.title = "Saving to Eagle";
  await importQueue.enqueue(job);
}

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
    resultsView?.updateStatus(status);
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
  applySessionEvent({ type: "probe", authenticated: false, required: true });
  if (openPinterestButton) openPinterestButton.hidden = false;
  if (searchButton) searchButton.disabled = true;
  setStatus("Pinterest session needs attention.");
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

async function collectResults() {
  if (!pluginReady || !guestReady || !supportsWebview() || !isPinterestPage()) return;
  try {
    const payload = /** @type {{results?: unknown[], authenticated?: boolean, required?: boolean}} */ (await pinterestView.executeJavaScript(getCollectResultsScript()));
    if (!payload || typeof payload !== "object") return;
    applySessionEvent({ type: "probe", authenticated: payload.authenticated === true, required: payload.required === true });
    if (Array.isArray(payload.results) && payload.results.length) {
      const nextResults = dedupePinterestResults([...currentResults, ...payload.results], searchInput?.value.trim() || "");
      const changed = nextResults.length !== currentResults.length || nextResults.some((result, index) => result.pinId !== currentResults[index]?.pinId);
      currentResults = nextResults;
      if (changed) resultsView?.render(currentResults);
      if (resultsSubtitle) resultsSubtitle.textContent = "Save any Pin directly into your current Eagle library.";
    } else if (sessionState.status === "required") {
      resultsView?.setEmpty(true, "Sign in to Pinterest", "Use the compact sign-in action above to continue.");
    }
  } catch (_error) {
    setStatus("Pinterest results are still loading…");
  }
}

function startResultPolling() {
  if (resultPoll) window.clearInterval(resultPoll);
  resultPoll = window.setInterval(() => void collectResults(), 4000);
}

async function advancePinterestResults() {
  if (
    advanceInFlight ||
    !pluginReady ||
    !guestReady ||
    !supportsWebview() ||
    !isPinterestPage()
  ) return;
  const now = Date.now();
  if (now - lastAdvanceAt < 800) return;
  advanceInFlight = true;
  lastAdvanceAt = now;
  try {
    setStatus("Loading more Pinterest results…");
    await pinterestView.executeJavaScript(getAdvanceResultsScript());
    await new Promise((resolve) => window.setTimeout(resolve, 700));
    await collectResults();
    setStatus("Choose a Pin to save to Eagle.");
  } catch (_error) {
    setStatus("Pinterest results are still loading…");
  } finally {
    advanceInFlight = false;
  }
}

resultsPanel?.addEventListener("scroll", async () => {
  const panel = /** @type {HTMLElement} */ (resultsPanel);
  const threshold = Math.max(panel.clientHeight, 480);
  if (panel.scrollTop + panel.clientHeight < panel.scrollHeight - threshold) return;
  await advancePinterestResults();
});

sessionAction?.addEventListener("click", () => {
  if (signInPanel) signInPanel.hidden = false;
  if (pinterestView) { pinterestView.style.opacity = "1"; pinterestView.style.pointerEvents = "auto"; pinterestView.style.width = "100%"; pinterestView.style.height = "100%"; }
  if (searchInput?.value.trim()) void pinterestView.loadURL(buildSearchUrl(searchInput.value));
  else void pinterestView.loadURL("https://www.pinterest.com/");
});
document.getElementById("closeSignInButton")?.addEventListener("click", () => {
  if (signInPanel) signInPanel.hidden = true;
  if (pinterestView) { pinterestView.style.opacity = "0"; pinterestView.style.pointerEvents = "none"; pinterestView.style.width = "1px"; pinterestView.style.height = "1px"; }
  void collectResults();
});

async function navigate() {
  if (!pluginReady || !guestReady) return;
  if (!supportsWebview()) return showFallback();
  if (!searchInput?.value.trim()) {
    setStatus("Enter a Pinterest search term.");
    return;
  }
  setStatus("Loading Pinterest…");
  currentResults = [];
  resultsView?.clear();
  resultsView?.setEmpty(true, "Loading Pinterest results", "Collecting Pins into an Eagle-native grid…");
  if (resultsTitle) resultsTitle.textContent = searchInput.value.trim();
  if (resultsSubtitle) resultsSubtitle.textContent = "Searching Pinterest…";
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
  if (openPinterestButton) openPinterestButton.hidden = true;
  if (!pluginReady || !guestReady || !supportsWebview() || !isPinterestPage())
    return;
  try {
    const available = await pinterestView.executeJavaScript(getInjectedCardScript());
    if (available !== true) return showFallback();
    await collectResults();
    sendStatus({ history: importQueue.getUpdates() });
    if (openPinterestButton) openPinterestButton.hidden = true;
    setStatus("Choose a Pin to save to Eagle.");
    startResultPolling();
  } catch (_error) {
    setStatus("Pinterest is still loading. Try searching again in a moment.");
  }
});

pinterestView?.addEventListener("dom-ready", () => {
  if (!pluginReady) return;
  guestReady = true;
  if (searchButton) searchButton.disabled = false;
  if (!supportsWebview()) return showFallback();
  setStatus("Enter a keyword to search Pinterest.");
  applySessionEvent({ type: "probe", authenticated: true });
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
renderSessionState();

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

"use strict";

const { URL, fileURLToPath } = require("node:url");
const modulePath = (name) => fileURLToPath(new URL(`js/${name}.js`, document.baseURI));

const { searchFrameSet } = require(modulePath("frameset-bridge"));
const { dedupeFrameSetResults } = require(modulePath("native-results"));
const { createResultsView } = require(modulePath("native-results-view"));
const { createImportQueue } = require(modulePath("import-queue"));
const { importFrameSetFrame, getCurrentTargetFolderIds } = require(modulePath("eagle-importer"));
const { DEFAULT_SETTINGS, normalizeSettings, loadSettings, saveSettings, buildImportTags } = require(modulePath("settings"));

const searchForm = document.getElementById("searchForm");
const searchInput = /** @type {HTMLInputElement} */ (document.getElementById("searchInput"));
const searchButton = /** @type {HTMLButtonElement} */ (document.getElementById("searchButton"));
const settingsButton = document.getElementById("settingsButton");
const settingsPanel = document.getElementById("settingsPanel");
const addFrameSetTag = /** @type {HTMLInputElement} */ (document.getElementById("addFrameSetTag"));
const addSearchTag = /** @type {HTMLInputElement} */ (document.getElementById("addSearchTag"));
const resetSettingsButton = document.getElementById("resetSettingsButton");
const clearHistoryButton = /** @type {HTMLButtonElement} */ (document.getElementById("clearHistoryButton"));
const resultsPanel = document.getElementById("resultsPanel");
const sessionStatus = document.getElementById("sessionStatus");
const importCounts = document.getElementById("importCounts");
const resultsGrid = document.getElementById("resultsGrid");
const emptyState = document.getElementById("emptyState");
const emptyTitle = document.getElementById("emptyTitle");
const emptyMessage = document.getElementById("emptyMessage");
const resultCount = document.getElementById("resultCount");
const resultsTitle = document.getElementById("resultsTitle");
const resultsSubtitle = document.getElementById("resultsSubtitle");

let pluginReady = false;
let currentResults = [];
let currentPage = 0;
let hasMore = false;
let loadingPage = false;
let searchTerm = "";
let settings = { ...DEFAULT_SETTINGS };
try { settings = loadSettings(localStorage); } catch (_error) { /* session defaults */ }

function setStatus(message, error = false) {
  sessionStatus.textContent = message;
  sessionStatus.className = error ? "error" : "ready";
}

function updateCounts() {
  const { imported, queued, failed } = importQueue.getCounts();
  importCounts.textContent = `Imported ${imported} · Queued ${queued} · Failed ${failed}`;
}

function renderSettings() {
  addFrameSetTag.checked = settings.addFrameSetTag;
  addSearchTag.checked = settings.addSearchTag;
}

function persistSettings() {
  try { saveSettings(localStorage, settings); } catch (_error) { setStatus("Settings apply for this session."); }
}

function saveFrame(frame, action) {
  if (!pluginReady) return;
  action.disabled = true;
  action.className = "result-card-action saving";
  action.textContent = "…";
  action.setAttribute("aria-label", "Saving to Eagle");
  return importQueue.enqueue({
    ...frame,
    targetFolderIds: getCurrentTargetFolderIds(eagle),
    settings: { ...settings },
    searchTerm,
  });
}

async function performSearch(page = 1) {
  if (!pluginReady || loadingPage) return;
  if (page === 1) searchTerm = searchInput.value.trim();
  if (!searchTerm) { setStatus("Enter a Frame Set search term.", true); return; }
  loadingPage = true;
  searchButton.disabled = true;
  let nextPage = null;
  if (page === 1) {
    currentResults = [];
    currentPage = 0;
    resultsTitle.textContent = searchTerm;
    resultsSubtitle.textContent = "Searching Frame Set stills…";
    resultsView.setEmpty(true, "Loading Frame Set results", "Collecting still frames into an Eagle-native 16:9 grid…");
  }
  setStatus(page === 1 ? "Searching Frame Set…" : "Loading more frames…");
  try {
    const payload = await searchFrameSet(searchTerm, page);
    currentResults = dedupeFrameSetResults([...currentResults, ...payload.results]);
    currentPage = payload.currentPage;
    hasMore = payload.hasMore;
    resultsView.render(currentResults);
    resultsSubtitle.textContent = "Save still frames directly into your current Eagle library.";
    setStatus(hasMore ? "Scroll for more frames." : "All available still frames loaded.");
    if (hasMore && resultsPanel.scrollHeight <= resultsPanel.clientHeight + 600) nextPage = currentPage + 1;
  } catch (error) {
    resultsView.setEmpty(true, "Frame Set search failed", error instanceof Error ? error.message : String(error));
    setStatus("Frame Set search failed.", true);
  } finally {
    loadingPage = false;
    searchButton.disabled = false;
    if (nextPage) void performSearch(nextPage);
  }
}

const resultsView = createResultsView({
  grid: resultsGrid,
  emptyState,
  emptyTitle,
  emptyMessage,
  resultCount,
  onSave: (frame, action) => saveFrame(frame, action),
});

const importQueue = createImportQueue({
  concurrency: 3,
  importer: async (frame) => importFrameSetFrame(eagle, frame, {
    folderIds: await frame.targetFolderIds,
    settings: frame.settings,
    searchTerm: frame.searchTerm,
  }),
  onUpdate: (status) => {
    updateCounts();
    resultsView.updateStatus(status);
    if (status.error) setStatus(status.error, true);
    else if (status.state === "done") setStatus("Imported to Eagle.");
  },
});

for (const control of [addFrameSetTag, addSearchTag]) control.addEventListener("change", () => {
  settings = normalizeSettings({ addFrameSetTag: addFrameSetTag.checked, addSearchTag: addSearchTag.checked });
  persistSettings();
});
settingsButton.addEventListener("click", () => {
  settingsPanel.hidden = !settingsPanel.hidden;
  settingsButton.setAttribute("aria-expanded", String(!settingsPanel.hidden));
});
resetSettingsButton.addEventListener("click", () => { settings = { ...DEFAULT_SETTINGS }; renderSettings(); persistSettings(); });
clearHistoryButton.addEventListener("click", () => { importQueue.clearHistory(); updateCounts(); setStatus("Session history cleared."); });
searchForm.addEventListener("submit", (event) => { event.preventDefault(); void performSearch(1); });
resultsPanel.addEventListener("scroll", () => {
  if (hasMore && !loadingPage && resultsPanel.scrollTop + resultsPanel.clientHeight >= resultsPanel.scrollHeight - 600) void performSearch(currentPage + 1);
});

window.addEventListener("error", (event) => setStatus(`Plugin error: ${event.error?.message || event.message}`, true));
window.addEventListener("unhandledrejection", (event) => setStatus(`Plugin error: ${event.reason?.message || event.reason}`, true));

renderSettings();
updateCounts();
searchButton.disabled = true;
clearHistoryButton.disabled = true;
if (typeof eagle !== "undefined") {
  eagle.onPluginCreate(() => {
    pluginReady = true;
    searchButton.disabled = false;
    clearHistoryButton.disabled = false;
    setStatus("Ready");
  });
} else {
  setStatus("Eagle is unavailable.", true);
}

module.exports = { buildImportTags };

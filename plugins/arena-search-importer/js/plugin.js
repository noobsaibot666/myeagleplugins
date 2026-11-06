"use strict";

const { URL, fileURLToPath } = require("node:url");
const modulePath = (name) => fileURLToPath(new URL(`js/${name}.js`, document.baseURI));

window.addEventListener("error", (event) => {
  const status = document.getElementById("sessionStatus");
  if (status) status.textContent = `Plugin error: ${event.error?.message || event.message}`;
});
window.addEventListener("unhandledrejection", (event) => {
  const status = document.getElementById("sessionStatus");
  if (status) status.textContent = `Plugin error: ${event.reason?.message || event.reason}`;
});

const { searchArena } = require(modulePath("arena-bridge"));
const { dedupePinterestResults } = require(modulePath("native-results"));
const { createResultsView } = require(modulePath("native-results-view"));
const { createImportQueue } = require(modulePath("import-queue"));
const { importArenaBlock, getCurrentTargetFolderIds } = require(modulePath("eagle-importer"));
const { DEFAULT_SETTINGS, normalizeSettings, loadSettings, saveSettings } = require(modulePath("settings"));

const searchForm = document.getElementById("searchForm");
const searchInput = /** @type {HTMLInputElement} */ (document.getElementById("searchInput"));
const searchButton = /** @type {HTMLButtonElement} */ (document.getElementById("searchButton"));
const settingsButton = document.getElementById("settingsButton");
const settingsPanel = document.getElementById("settingsPanel");
const addArenaTag = /** @type {HTMLInputElement} */ (document.getElementById("addArenaTag"));
const addSearchTag = /** @type {HTMLInputElement} */ (document.getElementById("addSearchTag"));
const resetSettingsButton = document.getElementById("resetSettingsButton");
const clearHistoryButton = /** @type {HTMLButtonElement} */ (document.getElementById("clearHistoryButton"));
const resultsPanel = /** @type {HTMLElement} */ (document.getElementById("resultsPanel"));
const sessionStatus = document.getElementById("sessionStatus");
const importStatus = document.getElementById("sessionStatus");
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

const resultsView = createResultsView({
  grid: resultsGrid,
  emptyState,
  emptyTitle,
  emptyMessage,
  resultCount,
  onSave: (block, action) => saveBlock(block, action),
});

function setStatus(message) {
  if (importStatus) importStatus.textContent = message;
}

function renderSettings() {
  addArenaTag.checked = settings.addArenaTag;
  addSearchTag.checked = settings.addSearchTag;
}

function persistSettings() {
  try { if (saveSettings(localStorage, settings)) return; } catch (_error) { /* session-only settings */ }
  setStatus("Settings apply for this session; local storage is unavailable.");
}

function updateCounts() {
  const { imported, queued, failed } = importQueue.getCounts();
  importCounts.textContent = `Imported ${imported} · Queued ${queued} · Failed ${failed}`;
}

function saveBlock(block, action) {
  if (!pluginReady) return;
  action.disabled = true;
  action.className = "result-card-action saving";
  action.textContent = "…";
  action.setAttribute("aria-label", "Saving to Eagle");
  return importQueue.enqueue({
    ...block,
    targetFolderIds: getCurrentTargetFolderIds(eagle),
    settings: { ...settings },
    searchTerm,
  });
}

async function performSearch(page = 1) {
  if (!pluginReady || loadingPage) return;
  searchTerm = searchInput.value.trim();
  if (!searchTerm) { setStatus("Enter an Are.na search term."); return; }
  loadingPage = true;
  searchButton.disabled = true;
  let nextPage = null;
  if (page === 1) {
    currentResults = [];
    currentPage = 0;
    resultsView.setEmpty(true, "Loading Are.na results", "Collecting image blocks into an Eagle-native grid…");
    resultsTitle.textContent = searchTerm;
    resultsSubtitle.textContent = "Searching Are.na…";
  }
  setStatus(page === 1 ? "Searching Are.na…" : "Loading more results…");
  try {
    const payload = await searchArena(searchTerm, page);
    currentResults = dedupePinterestResults([...currentResults, ...payload.results], searchTerm);
    currentPage = payload.currentPage;
    hasMore = payload.hasMore;
    resultsView.render(currentResults);
    resultsSubtitle.textContent = "Save any image block directly into your current Eagle library.";
    setStatus(hasMore ? "Scroll for more results." : "All available image results loaded.");
    if (hasMore && resultsPanel.scrollHeight <= resultsPanel.clientHeight + 600) {
      nextPage = currentPage + 1;
    }
  } catch (error) {
    resultsView.setEmpty(true, "Are.na search failed", error instanceof Error ? error.message : String(error));
    setStatus("Are.na search failed.");
  } finally {
    loadingPage = false;
    searchButton.disabled = false;
    if (nextPage) void performSearch(nextPage);
  }
}

for (const control of [addArenaTag, addSearchTag]) control.addEventListener("change", () => {
  settings = normalizeSettings({ addArenaTag: addArenaTag.checked, addSearchTag: addSearchTag.checked });
  persistSettings();
});
settingsButton.addEventListener("click", () => {
  settingsPanel.hidden = !settingsPanel.hidden;
  settingsButton.setAttribute("aria-expanded", String(!settingsPanel.hidden));
});
resetSettingsButton.addEventListener("click", () => { settings = { ...DEFAULT_SETTINGS }; renderSettings(); persistSettings(); });
clearHistoryButton.addEventListener("click", () => { importQueue.clearHistory(); updateCounts(); setStatus("Session history cleared."); });
searchForm.addEventListener("submit", (event) => { event.preventDefault(); void performSearch(1); });
searchButton.addEventListener("click", () => { void performSearch(1); });
resultsPanel.addEventListener("scroll", () => {
  if (hasMore && resultsPanel.scrollTop + resultsPanel.clientHeight >= resultsPanel.scrollHeight - 600) {
    void performSearch(currentPage + 1);
  }
});

const importQueue = createImportQueue({
  concurrency: 3,
    importer: async (block) => {
      const job = /** @type {typeof block & {targetFolderIds: Promise<string[]>, settings: import("./settings").ImportSettings, searchTerm: string}} */ (block);
      return importArenaBlock(eagle, job, { folderIds: await job.targetFolderIds, settings: job.settings, searchTerm: job.searchTerm });
    },
  onUpdate: (status) => {
    updateCounts();
    resultsView.updateStatus(status);
    if (status.error) setStatus(status.error);
    else if (status.state === "done") setStatus("Imported to Eagle.");
  },
});

renderSettings();
updateCounts();
searchButton.disabled = true;
clearHistoryButton.disabled = true;
sessionStatus.textContent = "Ready";

if (typeof eagle !== "undefined") {
  eagle.onPluginCreate(() => {
    pluginReady = true;
    searchButton.disabled = false;
    clearHistoryButton.disabled = false;
    sessionStatus.textContent = "Are.na connected";
    setStatus("Enter a keyword to search Are.na.");
  });
} else {
  setStatus("Eagle is unavailable.");
}

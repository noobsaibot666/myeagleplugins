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

const { createArenaSearch } = require(modulePath("arena-bridge"));
const { createResultsView } = require(modulePath("native-results-view"));
const { createImportQueue } = require(modulePath("import-queue"));
const { importArenaBlock, getCurrentTargetFolderIds } = require(modulePath("eagle-importer"));
const { DEFAULT_SETTINGS, normalizeSettings, loadSettings, saveSettings } = require(modulePath("settings"));

const $ = (id) => document.getElementById(id);
const searchForm = $("searchForm");
const searchInput = /** @type {HTMLInputElement} */ ($("searchInput"));
const searchButton = /** @type {HTMLButtonElement} */ ($("searchButton"));
const settingsButton = $("settingsButton");
const settingsPanel = $("settingsPanel");
const settingControls = {
  addArenaTag: /** @type {HTMLInputElement} */ ($("addArenaTag")),
  addSearchTag: /** @type {HTMLInputElement} */ ($("addSearchTag")),
  addChannelTag: /** @type {HTMLInputElement} */ ($("addChannelTag")),
  includePreviews: /** @type {HTMLInputElement} */ ($("includePreviews")),
};
const resetSettingsButton = $("resetSettingsButton");
const clearHistoryButton = /** @type {HTMLButtonElement} */ ($("clearHistoryButton"));
const resultsPanel = /** @type {HTMLElement} */ ($("resultsPanel"));
const sessionStatus = $("sessionStatus");
const importCounts = $("importCounts");
const resultsTitle = $("resultsTitle");
const resultsSubtitle = $("resultsSubtitle");
const channelBar = $("channelBar");
const searchNotice = $("searchNotice");
const resultsFooter = $("resultsFooter");

let pluginReady = false;
let searchTerm = "";
/** @type {{slug: string, title: string}|null} */
let activeChannel = null;
/** @type {ReturnType<typeof createArenaSearch>|null} */
let session = null;
let generation = 0;
let loading = false;
let settings = { ...DEFAULT_SETTINGS };
try { settings = loadSettings(localStorage); } catch (_error) { /* session defaults */ }

const resultsView = createResultsView({
  grid: $("resultsGrid"),
  emptyState: $("emptyState"),
  emptyTitle: $("emptyTitle"),
  emptyMessage: $("emptyMessage"),
  resultCount: $("resultCount"),
  altText: "Are.na result",
  onSave: (block, action) => saveBlock(block, action),
});

function setStatus(message) {
  if (sessionStatus) sessionStatus.textContent = message;
}

function setFooter(message) {
  if (!resultsFooter) return;
  resultsFooter.hidden = !message;
  resultsFooter.textContent = message || "";
}

function renderSettings() {
  for (const [key, control] of Object.entries(settingControls)) if (control) control.checked = settings[key];
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

function renderChannels(channels) {
  if (!channelBar) return;
  channelBar.replaceChildren();
  const list = activeChannel ? [activeChannel] : channels;
  channelBar.hidden = !list.length;
  if (!list.length) return;
  const chip = (label, count, pressed, onClick) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "channel-chip";
    button.setAttribute("aria-pressed", String(pressed));
    button.textContent = label;
    if (count) {
      const badge = document.createElement("span");
      badge.textContent = String(count);
      button.append(badge);
    }
    button.addEventListener("click", onClick);
    channelBar.append(button);
  };
  chip(activeChannel ? "← All results" : "All results", 0, !activeChannel, () => {
    if (activeChannel) { activeChannel = null; void startSearch(); }
  });
  for (const channel of list) {
    chip(channel.title, channel.length, activeChannel?.slug === channel.slug, () => {
      if (activeChannel?.slug === channel.slug) return;
      activeChannel = { slug: channel.slug, title: channel.title };
      void startSearch();
    });
  }
}

/** True when fewer than ~1.5 screens of results remain below the viewport. */
function needsMore() {
  return resultsPanel.scrollTop + resultsPanel.clientHeight >= resultsPanel.scrollHeight - Math.max(resultsPanel.clientHeight * 1.5, 900);
}

async function loadMore() {
  if (!session || loading || !session.hasMore()) return;
  const current = generation;
  loading = true;
  setFooter("Loading more…");
  try {
    const batch = await session.next();
    if (current !== generation) return;
    resultsView.append(batch.results);
    if (batch.notice && searchNotice) { searchNotice.hidden = false; searchNotice.textContent = batch.notice; }
    renderChannels(batch.channels);
    if (!resultsView.size() && !batch.hasMore) {
      resultsView.setEmpty(true, "No Are.na images found", `Nothing on Are.na matches “${searchTerm}”. Try a broader or different term.`);
    }
    resultsSubtitle.textContent = activeChannel ? `Images from the Are.na channel “${activeChannel.title}”.` : "Image blocks and curated channels matching your search.";
    setStatus(batch.hasMore ? "Scroll for more." : "All available images loaded.");
    setFooter(batch.hasMore ? "" : resultsView.size() ? "End of results" : "");
  } catch (error) {
    if (current !== generation) return;
    const message = error instanceof Error ? error.message : String(error);
    if (resultsView.size()) { setStatus(message); setFooter("Couldn’t load more. Scroll to retry."); }
    else { resultsView.setEmpty(true, "Are.na search failed", message); setStatus("Are.na search failed."); setFooter(""); }
    return;
  } finally {
    if (current === generation) loading = false;
  }
  // Keep a buffer below the fold (or keep going while a batch came back empty)
  // so scrolling never waits on the network.
  if (current === generation && session.hasMore() && (needsMore() || !resultsView.size())) void loadMore();
}

async function startSearch() {
  if (!pluginReady) return;
  searchTerm = searchInput.value.trim();
  if (!searchTerm) { setStatus("Enter an Are.na search term."); return; }
  generation++;
  loading = false;
  session = createArenaSearch(searchTerm, { includePreviews: settings.includePreviews, channel: activeChannel });
  resultsView.clear();
  resultsPanel.scrollTop = 0;
  if (searchNotice) searchNotice.hidden = true;
  renderChannels([]);
  setFooter("");
  resultsView.setEmpty(true, "Loading Are.na results", "Searching image blocks and curated channels…");
  resultsTitle.textContent = activeChannel ? activeChannel.title : searchTerm;
  resultsSubtitle.textContent = "Searching Are.na…";
  setStatus("Searching Are.na…");
  await loadMore();
}

for (const control of Object.values(settingControls)) control?.addEventListener("change", () => {
  const previews = settings.includePreviews;
  settings = normalizeSettings(Object.fromEntries(Object.entries(settingControls).map(([key, input]) => [key, Boolean(input?.checked)])));
  persistSettings();
  if (previews !== settings.includePreviews && searchTerm) void startSearch();
});
settingsButton.addEventListener("click", () => {
  settingsPanel.hidden = !settingsPanel.hidden;
  settingsButton.setAttribute("aria-expanded", String(!settingsPanel.hidden));
});
resetSettingsButton.addEventListener("click", () => { settings = { ...DEFAULT_SETTINGS }; renderSettings(); persistSettings(); });
clearHistoryButton.addEventListener("click", () => { importQueue.clearHistory(); updateCounts(); setStatus("Session history cleared."); });
searchForm.addEventListener("submit", (event) => { event.preventDefault(); activeChannel = null; void startSearch(); });
searchButton.addEventListener("click", () => { activeChannel = null; void startSearch(); });
resultsPanel.addEventListener("scroll", () => { if (needsMore()) void loadMore(); }, { passive: true });

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
setStatus("Ready");

if (typeof eagle !== "undefined") {
  eagle.onPluginCreate(() => {
    pluginReady = true;
    searchButton.disabled = false;
    clearHistoryButton.disabled = false;
    setStatus("Enter a keyword to search Are.na.");
  });
} else {
  setStatus("Eagle is unavailable.");
}

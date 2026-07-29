/// <reference path="../../../types/eagle-plugin-api.d.ts" />
"use strict";

const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");
const os = require("os");
const crypto = require("crypto");

const MAX_CONCURRENT = 3;
const STAGING_ROOT = path.join(os.tmpdir(), "eagle-vimeo-downloader");
const SETTINGS_KEY = "vimeo-downloader:bin-settings";

/** Window heights (must match manifest.json's default `main.height`). */
const COMPACT_HEIGHT = 340;
const EXPANDED_HEIGHT = 620;

/**
 * @typedef {Object} DownloadItem
 * @property {string} id
 * @property {string} url
 * @property {string[]} tags
 * @property {string[]} folderIds
 * @property {"queued"|"resolving"|"downloading"|"importing"|"done"|"error"} status
 * @property {string} [title]
 * @property {string} [thumbnail]
 * @property {number} progress
 * @property {string} [error]
 * @property {string} [outputDir]
 * @property {string} [outputPath]
 */

/** @type {DownloadItem[]} */
const items = [];
let activeCount = 0;

/** @type {{ytDlp: string, ffmpeg: string, cookieSource: string}} */
let binPaths = { ytDlp: "", ffmpeg: "", cookieSource: "chrome" };

/**
 * eagle.folder/eagle.item etc. throw until Eagle's own `plugin-create` event
 * has fired. DOM events (like `window`'s `focus`, which fires as soon as the
 * plugin window opens) can race ahead of that, so every Eagle API call
 * outside the onPluginCreate callback itself must check this first.
 */
let pluginReady = false;

/** Whether the downloads list panel is expanded. Starts collapsed to keep
 * the window compact; the user opts into the taller layout. */
let listExpanded = false;

// ----------------------------------------------------------------------------
// DOM refs
// ----------------------------------------------------------------------------

const el = {
  urlInput: /** @type {HTMLInputElement} */ (
    document.getElementById("urlInput")
  ),
  tagsInput: /** @type {HTMLInputElement} */ (
    document.getElementById("tagsInput")
  ),
  downloadBtn: /** @type {HTMLButtonElement} */ (
    document.getElementById("downloadBtn")
  ),
  targetLabel: document.getElementById("targetLabel"),
  list: document.getElementById("list"),
  listCount: document.getElementById("listCount"),
  emptyState: document.getElementById("emptyState"),
  clearDoneBtn: document.getElementById("clearDoneBtn"),
  listCard: document.getElementById("listCard"),
  toggleListBtn: /** @type {HTMLButtonElement} */ (
    document.getElementById("toggleListBtn")
  ),
  settingsBtn: document.getElementById("settingsBtn"),
  settingsPanel: document.getElementById("settingsPanel"),
  closeSettingsBtn: document.getElementById("closeSettingsBtn"),
  redetectBtn: document.getElementById("redetectBtn"),
  ytdlpPathInput: /** @type {HTMLInputElement} */ (
    document.getElementById("ytdlpPath")
  ),
  ffmpegPathInput: /** @type {HTMLInputElement} */ (
    document.getElementById("ffmpegPath")
  ),
  cookieSourceSelect: /** @type {HTMLSelectElement} */ (
    document.getElementById("cookieSource")
  ),
  toolsWarning: document.getElementById("toolsWarning"),
  toolsWarningText: document.getElementById("toolsWarningText"),
  openSettingsFromWarning: document.getElementById("openSettingsFromWarning"),
  toolsStatus: document.getElementById("toolsStatus"),
  toolsStatusText: document.getElementById("toolsStatusText"),
};

// ----------------------------------------------------------------------------
// Binary detection
// ----------------------------------------------------------------------------

function loadBinSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw)
      return { ytDlp: "", ffmpeg: "", cookieSource: "", ...JSON.parse(raw) };
  } catch (_) {
    /* ignore corrupt settings */
  }
  return { ytDlp: "", ffmpeg: "", cookieSource: "" };
}

function saveBinSettings() {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(binPaths));
}

/** Resolves a binary's absolute path using the user's real login-shell PATH. */
function which(bin) {
  return new Promise((resolve) => {
    const shell = process.env.SHELL || "/bin/zsh";
    const child = spawn(shell, ["-lc", `which ${bin}`], { env: process.env });
    let out = "";
    child.stdout.on("data", (d) => (out += d.toString()));
    child.on("close", (code) => {
      const found = out.trim().split("\n")[0];
      resolve(code === 0 && found ? found : "");
    });
    child.on("error", () => resolve(""));
  });
}

/**
 * @param {string} binPath
 * @param {string} [versionFlag] yt-dlp accepts GNU-style `--version`; this
 *   ffmpeg build only accepts the single-dash `-version` (exits 8 on
 *   `--version`), so the flag must be caller-specified per binary.
 */
function verifyBinary(binPath, versionFlag = "--version") {
  return new Promise((resolve) => {
    if (!binPath) return resolve(false);
    const child = spawn(binPath, [versionFlag]);
    child.on("close", (code) => resolve(code === 0));
    child.on("error", () => resolve(false));
  });
}

async function detectBinaries({ force = false } = {}) {
  const stored = loadBinSettings();
  binPaths.ytDlp = stored.ytDlp || binPaths.ytDlp;
  binPaths.ffmpeg = stored.ffmpeg || binPaths.ffmpeg;
  binPaths.cookieSource = stored.cookieSource ?? binPaths.cookieSource;
  el.cookieSourceSelect.value = binPaths.cookieSource;

  if (force || !(await verifyBinary(binPaths.ytDlp, "--version"))) {
    binPaths.ytDlp = (await which("yt-dlp")) || binPaths.ytDlp;
  }
  if (force || !(await verifyBinary(binPaths.ffmpeg, "-version"))) {
    binPaths.ffmpeg = (await which("ffmpeg")) || binPaths.ffmpeg;
  }

  el.ytdlpPathInput.value = binPaths.ytDlp;
  el.ffmpegPathInput.value = binPaths.ffmpeg;
  saveBinSettings();

  const [ytOk, ffOk] = await Promise.all([
    verifyBinary(binPaths.ytDlp, "--version"),
    verifyBinary(binPaths.ffmpeg, "-version"),
  ]);
  updateToolsStatus(ytOk, ffOk);
  return ytOk && ffOk;
}

function updateToolsStatus(ytOk, ffOk) {
  const ok = ytOk && ffOk;
  el.toolsStatus.className = "status-dot " + (ok ? "ok" : "bad");
  if (ok) {
    el.toolsStatusText.textContent = "yt-dlp & ffmpeg ready";
    el.toolsWarning.classList.add("hidden");
    el.downloadBtn.disabled = false;
  } else {
    const missing = [!ytOk && "yt-dlp", !ffOk && "ffmpeg"]
      .filter(Boolean)
      .join(" and ");
    el.toolsStatusText.textContent = `${missing} not found`;
    el.toolsWarningText.textContent = `${missing} not found — set the path manually in Settings.`;
    el.toolsWarning.classList.remove("hidden");
    el.downloadBtn.disabled = true;
  }
}

// ----------------------------------------------------------------------------
// Eagle integration helpers
// ----------------------------------------------------------------------------

async function getTargetFolders() {
  if (!pluginReady) return [];
  try {
    const selected = await eagle.folder.getSelected();
    return selected || [];
  } catch (_) {
    return [];
  }
}

async function refreshTargetLabel() {
  if (!pluginReady) return;
  const folders = await getTargetFolders();
  el.targetLabel.textContent = folders.length
    ? `Saving to: ${folders.map((f) => f.name).join(", ")}`
    : "Saving to: library (no folder selected)";
}

/** Toggles the downloads list panel, resizing the actual OS window to match
 * so the collapsed state is genuinely compact rather than leaving blank
 * space in a window that stays tall. */
async function setListExpanded(expanded) {
  listExpanded = expanded;
  el.listCard.classList.toggle("collapsed", !expanded);
  el.toggleListBtn.setAttribute("aria-expanded", String(expanded));

  if (!pluginReady) return;
  try {
    const [width] = await eagle.window.getSize();
    await eagle.window.setSize(
      width,
      expanded ? EXPANDED_HEIGHT : COMPACT_HEIGHT,
    );
  } catch (_) {
    /* window resize is best-effort; the CSS collapse still applies */
  }
}

// ----------------------------------------------------------------------------
// Download pipeline
// ----------------------------------------------------------------------------

function parseTags(raw) {
  return raw
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
}

function isLikelyVimeoUrl(raw) {
  return /vimeo\.com\//i.test(raw.trim());
}

async function enqueueDownload() {
  const url = el.urlInput.value.trim();
  if (!url) return;
  if (!isLikelyVimeoUrl(url)) {
    eagle.dialog.showErrorBox(
      "Not a Vimeo URL",
      "Paste a vimeo.com video link.",
    );
    return;
  }

  const folders = await getTargetFolders();
  /** @type {DownloadItem} */
  const item = {
    id: crypto.randomUUID(),
    url,
    tags: parseTags(el.tagsInput.value),
    folderIds: folders.map((f) => f.id),
    status: "queued",
    progress: 0,
    title: url,
  };
  items.unshift(item);
  el.urlInput.value = "";
  el.urlInput.focus();

  render();
  pump();
}

function pump() {
  if (activeCount >= MAX_CONCURRENT) return;
  const next = items.find((i) => i.status === "queued");
  if (!next) return;
  activeCount++;
  runDownload(next)
    .catch((err) => {
      next.status = "error";
      next.error = String((err && err.message) || err);
    })
    .finally(() => {
      activeCount--;
      render();
      pump();
    });
}

/**
 * Spawns yt-dlp, resolving with { code, stdout, stderr }.
 * @param {string[]} args
 * @param {{ onLine?: (line: string, isErr?: boolean) => void }} [options]
 */
function execYtDlp(args, { onLine } = {}) {
  return new Promise((resolve, reject) => {
    let child;
    try {
      child = spawn(binPaths.ytDlp, args);
    } catch (err) {
      reject(err);
      return;
    }
    let stdout = "";
    let stderr = "";
    let buf = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
      buf += chunk.toString();
      const lines = buf.split(/\r|\n/);
      buf = lines.pop() || "";
      for (const line of lines) if (onLine) onLine(line, false);
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
      const lines = chunk.toString().split(/\r|\n/).filter(Boolean);
      for (const line of lines) if (onLine) onLine(line, true);
    });
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
}

/** Vimeo currently requires an authenticated session for most videos (see
 * https://github.com/yt-dlp/yt-dlp/issues/17271 — the anonymous OAuth
 * fallback is broken upstream), so reuse a real browser's login when set. */
function cookieArgs() {
  return binPaths.cookieSource
    ? ["--cookies-from-browser", binPaths.cookieSource]
    : [];
}

async function fetchMetadata(url) {
  const { code, stdout } = await execYtDlp([
    "-J",
    "--no-playlist",
    "--no-warnings",
    "--socket-timeout",
    "20",
    ...cookieArgs(),
    url,
  ]);
  if (code !== 0) throw new Error("Could not read video info");
  const jsonLine = stdout
    .trim()
    .split("\n")
    .find((l) => l.trim().startsWith("{"));
  if (!jsonLine) throw new Error("Unexpected yt-dlp output");
  const data = JSON.parse(jsonLine);
  return { title: data.title || url, thumbnail: data.thumbnail || "" };
}

/** Runs the actual download, trying a referer-based retry on failure. */
async function downloadWithFallback(item, outTemplate) {
  const baseArgs = [
    "-f",
    "bv*+ba/b",
    "--merge-output-format",
    "mp4",
    "--no-playlist",
    "--newline",
    "--no-warnings",
    "--ffmpeg-location",
    binPaths.ffmpeg,
    "--print",
    "after_move:filepath",
    "-o",
    outTemplate,
    ...cookieArgs(),
  ];

  // Vimeo sometimes locks embedded players to a referring domain. Retrying
  // with a plausible Referer mirrors what a normal browser tab would send —
  // it does not touch DRM/encrypted (Vimeo OTT) content, which yt-dlp simply
  // can't decode and will keep failing with a clear error below.
  const attempts = [
    [],
    ["--referer", "https://vimeo.com/"],
    ["--referer", item.url],
  ];

  let lastErr = "";
  for (const extra of attempts) {
    let finalPath = "";
    let passwordPromptSeen = false;
    const args = [...baseArgs, ...extra, item.url];
    const { code, stderr } = await execYtDlp(args, {
      onLine: (line) => {
        const m = line.match(/(\d{1,3}(?:\.\d)?)%/);
        if (m) {
          item.status = "downloading";
          item.progress = Math.min(99, parseFloat(m[1]));
          render();
        } else if (line.startsWith("/") || /^[A-Za-z]:\\/.test(line)) {
          finalPath = line.trim();
        }
        if (/password protected/i.test(line)) passwordPromptSeen = true;
      },
    });

    if (code === 0 && finalPath) return finalPath;
    lastErr = stderr.trim().split("\n").pop() || "Download failed";
    if (passwordPromptSeen)
      throw new Error("This video is password protected.");
    if (/drm|widevine/i.test(lastErr))
      throw new Error("This video is DRM-protected and can't be downloaded.");
  }
  throw new Error(lastErr || "Download failed");
}

async function runDownload(item) {
  item.status = "resolving";
  render();

  try {
    const meta = await fetchMetadata(item.url);
    item.title = meta.title;
    item.thumbnail = meta.thumbnail;
  } catch (_) {
    // metadata is best-effort; fall back to the raw URL as the title
  }
  render();

  const dlDir = path.join(STAGING_ROOT, item.id);
  fs.mkdirSync(dlDir, { recursive: true });
  item.outputDir = dlDir;
  const outTemplate = path.join(dlDir, "%(title).200B [%(id)s].%(ext)s");

  item.status = "downloading";
  render();

  const finalPath = await downloadWithFallback(item, outTemplate);
  item.outputPath = finalPath;

  item.status = "importing";
  item.progress = 100;
  render();

  await eagle.item.addFromPath(finalPath, {
    name: item.title,
    tags: item.tags,
    folders: item.folderIds,
    website: item.url,
  });

  cleanupDir(dlDir);
  item.status = "done";
  render();
}

function cleanupDir(dir) {
  fs.rm(dir, { recursive: true, force: true }, () => {});
}

// ----------------------------------------------------------------------------
// Rendering
// ----------------------------------------------------------------------------

const STATUS_LABEL = {
  queued: "Queued",
  resolving: "Fetching info…",
  downloading: "Downloading",
  importing: "Importing to Eagle…",
  done: "Done",
  error: "Failed",
};

/** Builds one of the three trusted status glyphs as real SVG DOM nodes (no innerHTML). */
function buildStatusIcon(status) {
  const NS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", "16");
  svg.setAttribute("height", "16");
  const p = document.createElementNS(NS, "path");
  p.setAttribute("fill", "currentColor");
  let d = "M12 4a8 8 0 0 1 8 8h-2a6 6 0 0 0-6-6Z"; // spinner arc (default)
  if (status === "done") d = "M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z";
  if (status === "error")
    d = "M12 2 1 21h22Zm0 4.5 7.5 13h-15ZM11 10h2v5h-2Zm0 6h2v2h-2Z";
  p.setAttribute("d", d);
  svg.appendChild(p);
  return svg;
}

function statusExtraClass(status) {
  if (
    status === "resolving" ||
    status === "downloading" ||
    status === "importing"
  )
    return " spin";
  if (status === "done") return " done";
  if (status === "error") return " error";
  return "";
}

function clearChildren(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
}

function render() {
  clearChildren(el.list);
  el.emptyState.classList.toggle("hidden", items.length > 0);
  el.listCount.textContent = `${items.length} download${items.length === 1 ? "" : "s"}`;

  for (const item of items) {
    const row = document.createElement("div");
    row.className =
      "row" +
      (item.status === "done" || item.status === "error" ? " finished" : "");

    const thumb = document.createElement("div");
    thumb.className = "thumb";
    if (item.thumbnail) {
      thumb.style.backgroundImage = `url("${item.thumbnail}")`;
    } else {
      thumb.textContent = "▶";
    }

    const main = document.createElement("div");
    main.className = "row-main";

    const title = document.createElement("div");
    title.className = "row-title";
    title.textContent = item.title || item.url;

    const sub = document.createElement("div");
    sub.className = "row-sub" + (item.status === "error" ? " error" : "");
    sub.textContent =
      item.status === "downloading"
        ? `${STATUS_LABEL[item.status]} · ${item.progress.toFixed(0)}%`
        : item.status === "error"
          ? item.error || STATUS_LABEL.error
          : STATUS_LABEL[item.status];

    main.appendChild(title);
    main.appendChild(sub);

    if (item.status === "downloading" || item.status === "importing") {
      const track = document.createElement("div");
      track.className = "progress-track";
      const fill = document.createElement("div");
      fill.className = "progress-fill";
      fill.style.width = `${item.progress}%`;
      track.appendChild(fill);
      main.appendChild(track);
    }

    const status = document.createElement("div");
    status.className = "row-status" + statusExtraClass(item.status);
    status.appendChild(buildStatusIcon(item.status));

    const remove = document.createElement("button");
    remove.className = "row-remove";
    remove.textContent = "✕";
    remove.title = "Remove";
    remove.addEventListener("click", () => {
      const idx = items.indexOf(item);
      if (idx >= 0) items.splice(idx, 1);
      render();
    });

    row.appendChild(thumb);
    row.appendChild(main);
    row.appendChild(status);
    row.appendChild(remove);
    el.list.appendChild(row);
  }
}

// ----------------------------------------------------------------------------
// Wiring
// ----------------------------------------------------------------------------

function applyTheme() {
  const dark = eagle.app.isDarkColors();
  document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
}

el.toggleListBtn.addEventListener("click", () =>
  setListExpanded(!listExpanded),
);
el.downloadBtn.addEventListener("click", enqueueDownload);
el.urlInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") enqueueDownload();
});
el.clearDoneBtn.addEventListener("click", () => {
  for (let i = items.length - 1; i >= 0; i--) {
    if (items[i].status === "done" || items[i].status === "error")
      items.splice(i, 1);
  }
  render();
});

el.cookieSourceSelect.addEventListener("change", () => {
  binPaths.cookieSource = el.cookieSourceSelect.value;
  saveBinSettings();
});

el.settingsBtn.addEventListener("click", () =>
  el.settingsPanel.classList.toggle("hidden"),
);
el.closeSettingsBtn.addEventListener("click", () =>
  el.settingsPanel.classList.add("hidden"),
);
el.openSettingsFromWarning.addEventListener("click", () =>
  el.settingsPanel.classList.remove("hidden"),
);

el.ytdlpPathInput.addEventListener("change", () => {
  binPaths.ytDlp = el.ytdlpPathInput.value.trim();
  saveBinSettings();
  detectBinaries();
});
el.ffmpegPathInput.addEventListener("change", () => {
  binPaths.ffmpeg = el.ffmpegPathInput.value.trim();
  saveBinSettings();
  detectBinaries();
});
el.redetectBtn.addEventListener("click", () => detectBinaries({ force: true }));

eagle.onPluginCreate(async (plugin) => {
  pluginReady = true;
  eagle.log.info(`[${plugin.manifest.name}] created`);
  fs.mkdirSync(STAGING_ROOT, { recursive: true });
  applyTheme();
  await detectBinaries();
  await refreshTargetLabel();
  render();
  // Registered only now: DOM `focus` fires as soon as the window opens,
  // which can race ahead of Eagle's own plugin-create event.
  window.addEventListener("focus", refreshTargetLabel);
});

eagle.onThemeChanged(() => applyTheme());
eagle.onPluginShow(() => refreshTargetLabel());

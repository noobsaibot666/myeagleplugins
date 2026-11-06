/* global URL */
"use strict";

/** @typedef {Partial<Record<"1200x"|"original"|"600x", string>>} ImageVariants */
/** @typedef {{pinId: string, pinUrl: string, imageUrl: string, imageVariants?: ImageVariants, title: string, description: string, author: string, isVideo: boolean}} PinterestPin */

/** @param {unknown} value */
function parseHttpUrl(value) {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    if (
      !/^https?:$/.test(url.protocol) ||
      url.username ||
      url.password ||
      url.port
    )
      return null;
    return url;
  } catch (_error) {
    return null;
  }
}

/** @param {string} query */
function buildSearchUrl(query) {
  return `https://www.pinterest.com/search/pins/?q=${encodeURIComponent(query.trim())}`;
}

/** @param {unknown} value @returns {string|null} */
function normalizePinUrl(value) {
  const url = parseHttpUrl(value);
  if (!url || !/(^|\.)pinterest\.com$/.test(url.hostname)) return null;
  const match = /^\/pin\/([1-9]\d*)\/?$/.exec(url.pathname);
  return match ? `https://www.pinterest.com/pin/${match[1]}/` : null;
}

/** @param {unknown} value @returns {string|null} */
function normalizeImageUrl(value) {
  const url = parseHttpUrl(value);
  if (!url || !/(^|\.)pinimg\.com$/.test(url.hostname)) return null;
  if (!/\/[^/]+\.(?:jpe?g|png|webp|gif|avif)$/i.test(url.pathname)) return null;
  url.hash = "";
  return url.href;
}

/** @param {unknown} value */
function metadataText(value) {
  return typeof value === "string" ? value.trim() : "";
}

/** @param {unknown} message @returns {PinterestPin|null} */
function validateImportMessage(message) {
  if (!message || typeof message !== "object" || Array.isArray(message))
    return null;
  const input = /** @type {Record<string, unknown>} */ (message);
  const pinUrl = normalizePinUrl(input.pinUrl);
  const imageUrl = normalizeImageUrl(input.imageUrl);
  if (!pinUrl || !imageUrl) return null;
  const pinId = pinUrl.split("/")[4];
  if (input.pinId !== undefined && input.pinId !== pinId) return null;
  /** @type {ImageVariants} */
  const imageVariants = {};
  if (
    input.imageVariants &&
    typeof input.imageVariants === "object" &&
    !Array.isArray(input.imageVariants)
  ) {
    for (const variant of ["1200x", "original", "600x"]) {
      const url = normalizeImageUrl(input.imageVariants[variant]);
      if (url) imageVariants[variant] = url;
    }
  }
  return {
    pinId,
    pinUrl,
    imageUrl,
    ...(Object.keys(imageVariants).length ? { imageVariants } : {}),
    title: metadataText(input.title),
    description: metadataText(input.description),
    author: metadataText(input.author),
    isVideo: input.isVideo === true,
  };
}

// Serialized into Pinterest's main world. All dependencies are included below.
function decoratePinterestCards() {
  const page =
    /** @type {Window & {eaglePinterestHost?: {send: (message: unknown) => void}, __eaglePinterestDecorated?: boolean}} */ (
      window
    );
  if (typeof page.eaglePinterestHost?.send !== "function") return false;
  if (page.__eaglePinterestDecorated) return true;
  page.__eaglePinterestDecorated = true;

  /** @type {Map<string, {state: string, error?: string}>} */
  const statuses = new Map();

  /** @param {HTMLButtonElement} button */
  function renderStatus(button) {
    const status = statuses.get(button.getAttribute("data-eagle-pin-id"));
    const done = status?.state === "done";
    const busy = status?.state === "importing" || status?.state === "queued";
    const failed = status?.state === "error";
    button.disabled = done || busy;
    button.textContent = done
      ? "Imported"
      : busy
        ? "Importing…"
        : failed
          ? "Retry"
          : "Download to Eagle";
    button.className = `pin-import-button${done ? " imported" : busy ? " importing" : failed ? " failed" : ""}`;
    button.title = status?.error || "";
  }

  const style = document.createElement("style");
  style.textContent = `
    .pin-import-button { position:absolute; bottom:12px; left:12px; z-index:10;
      padding:10px 14px; border:2px solid white; border-radius:22px; background:#bd081c;
      color:white; font:600 14px/1.2 sans-serif; cursor:pointer; box-shadow:0 2px 8px #0004; }
    .pin-import-button:focus-visible { outline:3px solid #007aff; outline-offset:2px; }
    .pin-import-button.importing { background:#555; cursor:progress; }
    .pin-import-button.imported { background:#287a43; cursor:default; }
    .pin-import-button.failed { background:#a32318; }
  `;
  (document.head || document.documentElement).appendChild(style);

  /** @param {Element} card */
  function bestImage(card) {
    /** @type {{url: string, size: number, image: HTMLImageElement}[]} */
    const candidates = [];
    for (const image of Array.from(card.querySelectorAll("img"))) {
      /** @param {string|null} source @param {number} [size] */
      const add = (source, size = 0) => {
        const url = normalizeImageUrl(source);
        if (!url) return;
        const width = /\/(\d+)x(?:\d+)?\//.exec(url);
        const inferred = url.includes("/originals/")
          ? 1000000
          : Number(width?.[1] || image.naturalWidth || 0);
        candidates.push({ url, size: Math.max(size, inferred), image });
      };
      add(image.getAttribute("src"));
      add(image.getAttribute("data-src"));
      for (const source of (image.getAttribute("srcset") || "").split(",")) {
        const [url, descriptor = ""] = source.trim().split(/\s+/);
        const size = descriptor.endsWith("x")
          ? parseFloat(descriptor) * (image.naturalWidth || 1000)
          : parseFloat(descriptor);
        add(url, Number.isFinite(size) ? size : 0);
      }
    }
    const best = candidates.sort((a, b) => b.size - a.size)[0];
    if (!best) return null;
    /** @type {ImageVariants} */
    const imageVariants = {};
    for (const candidate of candidates) {
      if (candidate.image !== best.image) continue;
      const variant = /^https?:\/\/[^/]+\/(1200x|600x|originals)\//.exec(
        candidate.url,
      )?.[1];
      if (variant)
        imageVariants[variant === "originals" ? "original" : variant] =
          candidate.url;
    }
    return { ...best, imageVariants };
  }

  /** @param {Element} card @param {string} pinUrl @param {Element} link */
  function extractPin(card, pinUrl, link) {
    const best = bestImage(link.querySelector("img") ? link : card);
    if (!best) return null;
    return validateImportMessage({
      pinUrl,
      imageUrl: best.url,
      imageVariants: best.imageVariants,
      title:
        best.image.alt ||
        card.querySelector('[data-test-id="pinTitle"]')?.textContent ||
        "",
      description:
        card.querySelector('[data-test-id="pinDescription"]')?.textContent ||
        "",
      author:
        card.querySelector('[data-test-id="pinnerName"]')?.textContent || "",
      isVideo: Boolean(card.querySelector('video, [data-test-id="video-pin"]')),
    });
  }

  /** @param {Element} node @returns {Element|null} */
  function getOwningCard(node) {
    return (
      node.closest('[data-test-id="pin"]') ||
      node.closest('[data-test-id="pinWrapper"]') ||
      node.closest("[data-grid-item]") ||
      node.closest("a[href]") ||
      (node.matches?.("a[href]") ? node : null)
    );
  }

  /** @param {Element} node @returns {Element|null} */
  function getCanonicalCard(node) {
    if (!node.matches?.("a[href]")) {
      for (const link of Array.from(node.querySelectorAll("a[href]"))) {
        const card = getOwningCard(link);
        if (card) return card;
      }
    }
    return getOwningCard(node);
  }

  /** @param {Element} card @returns {Element|null} */
  function findPinLink(card) {
    const links = card.matches("a[href]")
      ? [card]
      : Array.from(card.querySelectorAll("a[href]"));
    for (const link of links) {
      if (link.closest("button[data-eagle-import-control]")) continue;
      try {
        if (
          normalizePinUrl(
            new URL(link.getAttribute("href"), window.location.href).href,
          )
        )
          return link;
      } catch (_error) {
        // A malformed link is not a Pin link; keep scanning this card.
      }
    }
    return null;
  }

  /** @param {Element} card @returns {{link: Element, pin: PinterestPin}|null} */
  function getCurrentPin(card) {
    const link = findPinLink(card);
    if (!link) return null;
    let pinUrl;
    try {
      pinUrl = normalizePinUrl(
        new URL(link.getAttribute("href"), window.location.href).href,
      );
    } catch (_error) {
      return null;
    }
    const pin = pinUrl ? extractPin(card, pinUrl, link) : null;
    return pin ? { link, pin } : null;
  }

  /** @param {Element} card */
  function decorateCard(card) {
    const current = getCurrentPin(card);
    if (!current) return;
    const existing = /** @type {HTMLButtonElement|null} */ (
      card.querySelector("button[data-eagle-pin-id]")
    );
    if (existing) {
      const previousPinId = existing.getAttribute("data-eagle-pin-id");
      existing.setAttribute("data-eagle-pin-id", current.pin.pinId);
      if (
        previousPinId !== current.pin.pinId ||
        statuses.has(current.pin.pinId)
      ) {
        renderStatus(existing);
      }
      return;
    }
    const pin = current.pin;
    let pinUrl;
    try {
      pinUrl = normalizePinUrl(
        new URL(current.link.getAttribute("href"), window.location.href).href,
      );
    } catch (_error) {
      return;
    }
    if (!pinUrl) return;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "pin-import-button";
    button.textContent = "Download to Eagle";
    button.setAttribute("data-eagle-pin-id", pin.pinId);
    button.setAttribute("data-eagle-import-control", "true");
    renderStatus(button);
    if (window.getComputedStyle(card).position === "static") {
      /** @type {HTMLElement} */ (card).style.position = "relative";
    }
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (button.disabled) return;
      const current = getCurrentPin(card);
      if (!current) {
        button.textContent = "Retry";
        button.className = "pin-import-button failed";
        return;
      }
      const retry = statuses.get(current.pin.pinId)?.state === "error";
      button.setAttribute("data-eagle-pin-id", current.pin.pinId);
      button.textContent = "Importing…";
      button.className = "pin-import-button importing";
      button.disabled = true;
      try {
        page.eaglePinterestHost.send({
          type: "eagle-pinterest-import",
          payload: current.pin,
          retry,
        });
      } catch (_error) {
        button.textContent = "Retry";
        button.className = "pin-import-button failed";
        button.disabled = false;
      }
    });
    card.appendChild(button);
  }

  /** @param {Element} root */
  function inspect(root) {
    const cards = new Set();
    const card = getCanonicalCard(root);
    if (card) cards.add(card);
    for (const link of Array.from(root.querySelectorAll("a[href]"))) {
      const card = getOwningCard(link);
      if (card) cards.add(card);
    }
    for (const card of cards) decorateCard(card);
  }

  page.addEventListener("eagle-pinterest-import-status", (event) => {
    const message = /** @type {CustomEvent} */ (event).detail;
    if (!message || typeof message !== "object") return;
    const history = Array.isArray(message.history) ? message.history : null;
    if (history) statuses.clear();
    for (const status of history || [message]) {
      if (!status || typeof status !== "object") continue;
      const key = status.key || status.pinId;
      if (typeof key !== "string") continue;
      if (status.state === "idle") statuses.delete(key);
      else if (
        ["queued", "importing", "done", "error"].includes(status.state)
      ) {
        statuses.set(key, status);
      }
    }
    for (const button of Array.from(
      document.querySelectorAll("button[data-eagle-pin-id]"),
    )) {
      const key = button.getAttribute("data-eagle-pin-id");
      if (history || key === (message.key || message.pinId)) {
        renderStatus(/** @type {HTMLButtonElement} */ (button));
      }
    }
  });

  let inspectionScheduled = false;
  const pendingInspectionRoots = new Set();
  const scheduleInspect = (root) => {
    if (!root) return;
    pendingInspectionRoots.add(root);
    if (inspectionScheduled) return;
    inspectionScheduled = true;
    const schedule = typeof window.setTimeout === "function" ? window.setTimeout : (callback) => callback();
    schedule(() => {
      inspectionScheduled = false;
      const roots = Array.from(pendingInspectionRoots);
      pendingInspectionRoots.clear();
      for (const pendingRoot of roots) inspect(pendingRoot);
    }, 50);
  };
  const observer = new window.MutationObserver((records) => {
    for (const record of records) {
      if (record.type === "attributes")
        scheduleInspect(/** @type {Element} */ (record.target));
      for (const node of Array.from(record.addedNodes)) {
        if (node.nodeType === 1) scheduleInspect(/** @type {Element} */ (node));
      }
    }
  });
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["href", "src", "srcset", "data-src"],
  });
  inspect(document.documentElement);
  page.addEventListener("pagehide", () => observer.disconnect(), {
    once: true,
  });
  return true;
}

function getInjectedCardScript() {
  return `(() => {
    ${[parseHttpUrl, normalizePinUrl, normalizeImageUrl, metadataText, validateImportMessage].map((fn) => fn.toString()).join("\n")}
    return (${decoratePinterestCards.toString()})();
  })()`;
}

function getCollectResultsScript() {
  return `(() => {
    ${[parseHttpUrl, normalizePinUrl, normalizeImageUrl, metadataText, validateImportMessage].map((fn) => fn.toString()).join("\n")}
    const results = [];
    const seen = new Set();
    const links = Array.from(document.querySelectorAll('a[href*="/pin/"]'));
    for (const link of links) {
      let pinUrl;
      try { pinUrl = normalizePinUrl(new URL(link.getAttribute('href'), location.href).href); } catch (_) { pinUrl = null; }
      if (!pinUrl) continue;
      const pinId = pinUrl.split('/')[4];
      if (seen.has(pinId)) continue;
      const card = link.closest('[data-test-id="pin"], [data-test-id="pinWrapper"], [data-grid-item]') || link;
      const images = Array.from(card.querySelectorAll('img'));
      const candidates = [];
      for (const image of images) {
        for (const source of [image.currentSrc, image.src, image.getAttribute('data-src'), ...(image.getAttribute('srcset') || '').split(',').map((entry) => entry.trim().split(/\\s+/)[0])]) {
          const url = normalizeImageUrl(source);
          if (!url) continue;
          const size = url.includes('/originals/') ? 4000 : Number((/\\/(\\d+)x\\//.exec(url) || [])[1] || 0);
          candidates.push({ url, size });
        }
      }
      if (!candidates.length) continue;
      // Prefer a sharp-but-light preview (<= 736px wide) for the native grid.
      const sized = candidates.filter((candidate) => candidate.size && candidate.size <= 736).sort((a, b) => b.size - a.size);
      const imageUrl = (sized[0] || candidates[0]).url;
      const image0 = images[0];
      const pin = validateImportMessage({
        pinId, pinUrl, imageUrl,
        title: images[0]?.alt || card.querySelector('[data-test-id="pinTitle"]')?.textContent || '',
        description: card.querySelector('[data-test-id="pinDescription"]')?.textContent || '',
        author: card.querySelector('[data-test-id="pinnerName"]')?.textContent || '',
        isVideo: Boolean(card.querySelector('video, [data-test-id="video-pin"]'))
      });
      if (pin && image0 && image0.naturalWidth && image0.naturalHeight) { pin.width = image0.naturalWidth; pin.height = image0.naturalHeight; }
      if (pin) { seen.add(pinId); results.push(pin); }
    }
    const loginRequired = Boolean(document.querySelector('[data-test-id="login-page"], form[action*="login"], [aria-label*="Log in" i], [aria-label*="Sign up" i]')) && !results.length;
    return { results, authenticated: !loginRequired, required: loginRequired };
  })()`;
}

function getAdvanceResultsScript() {
  return `(() => {
    const amount = Math.max(window.innerHeight || 800, 600);
    const cached = window.__eaglePinterestScrollRoot;
    if (cached && cached.scrollHeight > cached.clientHeight + 20) {
      cached.scrollTop += amount;
      return true;
    }
    const preferred = [
      document.scrollingElement,
      document.querySelector('[data-test-id="search-feed"]'),
      document.querySelector('main'),
      document.querySelector('[role="main"]'),
    ].filter((element, index, all) => element && all.indexOf(element) === index);
    const preferredScroller = preferred.find(
      (element) => element.scrollHeight > element.clientHeight + 20,
    );
    if (preferredScroller) {
      window.__eaglePinterestScrollRoot = preferredScroller;
      preferredScroller.scrollTop += amount;
      return true;
    }
    const candidates = [
      document.documentElement,
      document.body,
      ...Array.from(document.querySelectorAll("*")),
    ].filter((element, index, all) => {
      if (!element || all.indexOf(element) !== index) return false;
      if (element.scrollHeight <= element.clientHeight + 20) return false;
      if (element === document.scrollingElement || element === document.documentElement || element === document.body) return true;
      const style = window.getComputedStyle(element);
      return /auto|scroll/i.test(style.overflowY || "");
    });
    const scroller = candidates.sort(
      (a, b) => b.scrollHeight - b.clientHeight - (a.scrollHeight - a.clientHeight),
    )[0];
    if (scroller) {
      window.__eaglePinterestScrollRoot = scroller;
      scroller.scrollTop += amount;
      return true;
    }
    if (typeof window.scrollBy === "function") {
      window.scrollBy(0, amount);
      return true;
    }
    return false;
  })()`;
}

module.exports = {
  buildSearchUrl,
  normalizePinUrl,
  normalizeImageUrl,
  validateImportMessage,
  getInjectedCardScript,
  getCollectResultsScript,
  getAdvanceResultsScript,
};

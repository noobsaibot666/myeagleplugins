/* global URL */
"use strict";

/** @typedef {{pinId: string, pinUrl: string, imageUrl: string, title: string, description: string, author: string, isVideo: boolean}} PinterestPin */

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
  return {
    pinId,
    pinUrl,
    imageUrl,
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
    return candidates.sort((a, b) => b.size - a.size)[0];
  }

  /** @param {Element} card @param {string} pinUrl @param {Element} link */
  function extractPin(card, pinUrl, link) {
    const best = bestImage(link.querySelector("img") ? link : card);
    if (!best) return null;
    return validateImportMessage({
      pinUrl,
      imageUrl: best.url,
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

  /** @param {Element} link */
  function getCard(link) {
    return (
      link.closest('[data-test-id="pin"]') ||
      link.closest("[data-grid-item]") ||
      link.closest('[data-test-id="pinWrapper"]') ||
      link
    );
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
      if (previousPinId !== current.pin.pinId) {
        existing.textContent = "Download to Eagle";
        existing.className = "pin-import-button";
        existing.disabled = false;
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
      button.textContent = "Importing…";
      button.className = "pin-import-button importing";
      button.disabled = true;
      try {
        page.eaglePinterestHost.send({
          type: "eagle-pinterest-import",
          payload: current.pin,
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
    const ancestorCard = root.closest('[data-test-id="pin"], [data-grid-item]');
    if (ancestorCard) cards.add(ancestorCard);
    const ancestorWrapper = root.closest('[data-test-id="pinWrapper"]');
    const nestedPin = root.querySelector('[data-test-id="pin"]');
    if (ancestorWrapper && !nestedPin) cards.add(ancestorWrapper);
    if (root.matches?.('[data-test-id="pin"], [data-grid-item]'))
      cards.add(root);
    for (const link of Array.from(root.querySelectorAll("a[href]")))
      cards.add(getCard(link));
    for (const card of cards) decorateCard(card);
  }

  page.addEventListener("eagle-pinterest-import-status", (event) => {
    const status = /** @type {CustomEvent} */ (event).detail;
    if (!status || typeof status.pinId !== "string") return;
    for (const button of Array.from(
      document.querySelectorAll("button[data-eagle-pin-id]"),
    )) {
      if (button.getAttribute("data-eagle-pin-id") !== status.pinId) continue;
      const control = /** @type {HTMLButtonElement} */ (button);
      const done = status.state === "done";
      const busy = status.state === "importing" || status.state === "queued";
      control.disabled = done || busy;
      control.textContent = done ? "Imported" : busy ? "Importing…" : "Retry";
      control.className = `pin-import-button ${done ? "imported" : busy ? "importing" : "failed"}`;
    }
  });

  const observer = new window.MutationObserver((records) => {
    for (const record of records) {
      if (record.type === "attributes")
        inspect(/** @type {Element} */ (record.target));
      for (const node of Array.from(record.addedNodes)) {
        if (node.nodeType === 1) inspect(/** @type {Element} */ (node));
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

module.exports = {
  buildSearchUrl,
  normalizePinUrl,
  normalizeImageUrl,
  validateImportMessage,
  getInjectedCardScript,
};

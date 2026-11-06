# Frame Set Search Importer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and install a native Eagle plugin that searches Frame Set for still frames, renders a 16:9-first feed, and saves selected frames directly into Eagle.

**Architecture:** Copy the proven Are.na native importer structure into a new self-contained plugin, replacing its provider bridge with Frame Set’s public `/api/search` endpoint. Keep provider normalization, rendering, queueing, settings, and Eagle import boundaries separate so the CloudFront fallback is testable without the UI.

**Tech Stack:** Plain HTML/CSS/JavaScript, Eagle Plugin API, Node’s built-in test runner, TypeScript checkJs, Python deterministic packager.

---

### Task 1: Scaffold the plugin package

**Files:**
- Create: `plugins/frameset-search-importer/manifest.json`
- Create: `plugins/frameset-search-importer/package.json`
- Create: `plugins/frameset-search-importer/jsconfig.json`
- Create: `plugins/frameset-search-importer/plugin.png`

- [ ] **Step 1: Add manifest and package metadata**

Use plugin ID `com.eagle.frameset-search-importer`, display name `Frame Set Search Importer`, version `0.1.0`, `devTools: false`, and a resizable `1100x760` window with the existing dark Eagle background.

- [ ] **Step 2: Add editor config and icon**

Extend the shared JS config exactly as the Are.na plugin does and generate a plugin-local 128×128 icon using the repository’s existing placeholder-logo script, with the letter `F` as the visible mark.

- [ ] **Step 3: Verify the scaffold**

Run `node -e "const m=require('./plugins/frameset-search-importer/manifest.json'); const p=require('./plugins/frameset-search-importer/package.json'); if(m.version!==p.version||m.logo!=='plugin.png') process.exit(1)"`.

Expected: exit code 0.

- [ ] **Step 4: Commit**

```bash
git add plugins/frameset-search-importer/manifest.json plugins/frameset-search-importer/package.json plugins/frameset-search-importer/jsconfig.json plugins/frameset-search-importer/plugin.png
git commit -m "feat: scaffold Frame Set Eagle plugin"
```

### Task 2: Implement and test the Frame Set bridge

**Files:**
- Create: `plugins/frameset-search-importer/js/frameset-bridge.js`
- Test: `plugins/frameset-search-importer/tests/frameset-bridge.test.js`

- [ ] **Step 1: Write failing bridge tests**

Cover the public endpoint and normalized output with tests equivalent to:

```js
const test = require("node:test");
const assert = require("node:assert/strict");
const { buildSearchUrl, normalizeFrameSetResult, searchFrameSet } = require("../js/frameset-bridge");

const still = {
  id: "frame-1",
  type: "still",
  title: { title: "Windrunners", href: "/brand/nike/windrunners", entity: [{ name: "Nike" }] },
  size: { width: 1920, height: 1080, aspect: 16 / 9 },
};

test("builds Frame Set paginated search URLs", () => {
  assert.equal(buildSearchUrl(" moody night ", 2), "https://frameset.app/api/search?page=2&size=50&search=moody+night");
});

test("normalizes a still into a wide Eagle result", () => {
  assert.deepEqual(normalizeFrameSetResult(still), {
    frameId: "frame-1",
    frameUrl: "https://d13mryl9xv19vu.cloudfront.net/frame-1_sm.avif",
    frameVariants: { small: "https://d13mryl9xv19vu.cloudfront.net/frame-1_sm.avif" },
    framePageUrl: "https://frameset.app/brand/nike/windrunners",
    title: "Windrunners",
    brand: "Nike",
    type: "still",
    width: 1920,
    height: 1080,
    aspect: 16 / 9,
  });
});

test("filters motion records and malformed records", () => {
  assert.equal(normalizeFrameSetResult({ ...still, type: "motion" }), null);
  assert.equal(normalizeFrameSetResult({ ...still, id: null }), null);
});

test("returns cursor pagination state", async () => {
  const result = await searchFrameSet("hyrox", 1, 50, async () => ({
    ok: true,
    status: 200,
    async json() { return { success: true, data: { results: [still], cursor: { hasMore: true, from: 0, size: 50 } } }; },
  }));
  assert.equal(result.results.length, 1);
  assert.equal(result.currentPage, 1);
  assert.equal(result.hasMore, true);
});
```

- [ ] **Step 2: Run the bridge tests and verify RED**

Run `node --test plugins/frameset-search-importer/tests/frameset-bridge.test.js`.

Expected: FAIL because the bridge module does not exist yet.

- [ ] **Step 3: Implement the minimal bridge**

Implement strict HTTPS URL construction, `type === "still"` filtering, title/brand/entity extraction, 16:9 dimensions, CloudFront `_sm.avif` URLs, and response pagination from `data.cursor.hasMore`. Use a small injectable `requestJson` function for tests.

- [ ] **Step 4: Run the bridge tests and verify GREEN**

Run the same command.

Expected: all bridge tests pass.

- [ ] **Step 5: Commit**

```bash
git add plugins/frameset-search-importer/js/frameset-bridge.js plugins/frameset-search-importer/tests/frameset-bridge.test.js
git commit -m "feat: add Frame Set search bridge"
```

### Task 3: Add normalized result rendering for a 16:9 feed

**Files:**
- Create: `plugins/frameset-search-importer/js/native-results.js`
- Create: `plugins/frameset-search-importer/js/native-results-view.js`
- Create: `plugins/frameset-search-importer/tests/native-results.test.js`

- [ ] **Step 1: Write failing normalization tests**

Test deduplication by frame ID and image URL, preserving the first occurrence and retaining source metadata.

- [ ] **Step 2: Run tests and verify RED**

Run `node --test plugins/frameset-search-importer/tests/native-results.test.js`.

Expected: FAIL because the modules do not exist.

- [ ] **Step 3: Implement the result utilities and view**

Create `normalizeFrameSetResult` wrappers and a view that renders each result as an image-only card with an accessible `↓` button. Use `data-frame-id`, lazy images, an error placeholder, and queued/saving/saved/retry states.

- [ ] **Step 4: Run tests and verify GREEN**

Run the same test command.

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add plugins/frameset-search-importer/js/native-results.js plugins/frameset-search-importer/js/native-results-view.js plugins/frameset-search-importer/tests/native-results.test.js
git commit -m "feat: render Frame Set results as wide cards"
```

### Task 4: Implement Eagle import with CloudFront fallback

**Files:**
- Create: `plugins/frameset-search-importer/js/eagle-importer.js`
- Create: `plugins/frameset-search-importer/js/import-queue.js`
- Test: `plugins/frameset-search-importer/tests/eagle-importer.test.js`
- Test: `plugins/frameset-search-importer/tests/import-queue.test.js`

- [ ] **Step 1: Write failing importer tests**

Cover current-folder capture, metadata fields, URL import success, and fallback to `addFromBase64` when `addFromURL` rejects. The fallback test should use an injected fetch response with a small ArrayBuffer and assert a `data:image/avif;base64,...` payload.

- [ ] **Step 2: Run tests and verify RED**

Run `node --test plugins/frameset-search-importer/tests/eagle-importer.test.js plugins/frameset-search-importer/tests/import-queue.test.js`.

Expected: FAIL because the modules do not exist.

- [ ] **Step 3: Implement importer and FIFO queue**

Implement `getCurrentTargetFolderIds`, `importFrameSetFrame`, `fetchImageAsDataUrl`, and a three-slot queue. Validate `frameId`, `frameUrl`, and `framePageUrl`; preserve title/brand/type/dimension metadata; use `eagle.item.addFromURL` first; fallback to `eagle.item.addFromBase64`; and retry only through the card’s explicit retry state.

- [ ] **Step 4: Run tests and verify GREEN**

Run the same test command.

Expected: all importer and queue tests pass.

- [ ] **Step 5: Commit**

```bash
git add plugins/frameset-search-importer/js/eagle-importer.js plugins/frameset-search-importer/js/import-queue.js plugins/frameset-search-importer/tests/eagle-importer.test.js plugins/frameset-search-importer/tests/import-queue.test.js
git commit -m "feat: import Frame Set images into Eagle"
```

### Task 5: Build the native plugin window

**Files:**
- Create: `plugins/frameset-search-importer/index.html`
- Create: `plugins/frameset-search-importer/css/style.css`
- Create: `plugins/frameset-search-importer/js/settings.js`
- Create: `plugins/frameset-search-importer/js/plugin.js`

- [ ] **Step 1: Add settings module and tests**

Copy the existing session settings behavior with Frame Set-specific defaults: source tag enabled, search-term tag disabled, open-after-import disabled. Add tests for normalization and tag construction.

- [ ] **Step 2: Implement the document shell**

Create one search toolbar, settings drawer, one active keyword tab, status/count area, scrollable results panel, and empty/loading state. Do not include an iframe, visual search tab, or DevTools control.

- [ ] **Step 3: Implement plugin orchestration**

Wire the search form to page 1, append and dedupe results, trigger page N+1 when within 600px of the bottom, guard concurrent searches, capture selected folder IDs at click time, and connect import queue updates to the status line and card actions.

- [ ] **Step 4: Implement the 16:9 visual system**

Use CSS Grid with `repeat(auto-fill, minmax(240px, 1fr))`, card `aspect-ratio: 16 / 9`, `object-fit: cover`, hidden scrollbars, dark Eagle-style surfaces, and the centered download icon that fades in on hover/focus.

- [ ] **Step 5: Run static checks**

Run:

```bash
npm --prefix plugins/frameset-search-importer test
npm run lint
npx tsc --noEmit -p plugins/frameset-search-importer
git diff --check
```

Expected: all tests pass, lint/typecheck exit 0, and no whitespace errors.

- [ ] **Step 6: Commit**

```bash
git add plugins/frameset-search-importer
git commit -m "feat: add native Frame Set search importer"
```

### Task 6: Package, install, and smoke-test in Eagle

**Files:**
- Create: `scripts/package-frameset-search-importer.py`
- Modify: `README.md`

- [ ] **Step 1: Add deterministic packager**

Mirror `scripts/package-arena-search-importer.py`, allowlisting only the manifest, package metadata, HTML, CSS, plugin-local JS modules, tests excluded, and `plugin.png`.

- [ ] **Step 2: Add workspace documentation**

Document the plugin name, local install path, test command, package command, and the 16:9 still-only behavior.

- [ ] **Step 3: Package and validate**

Run `python3 scripts/package-frameset-search-importer.py`.

Expected: a validated archive under `dist/frameset-search-importer-0.1.0.eagleplugin` with a SHA-256 line.

- [ ] **Step 4: Install the local plugin in Eagle**

Use Eagle’s developer plugin import/create flow with `plugins/frameset-search-importer`, remove any prior copy with the same plugin ID, and ensure the window opens without DevTools.

- [ ] **Step 5: Perform live smoke tests**

In Eagle:

1. Open **Frame Set Search Importer**.
2. Search `hyrox` and confirm cards are visibly widescreen rather than portrait masonry.
3. Scroll near the bottom and confirm more still frames append automatically.
4. Click one centered download icon and confirm the item appears in Eagle with the selected folder, website metadata, and no duplicate on a second click.
5. Search `cinematic night exterior` and confirm the search replaces the prior result set.
6. Inspect the plugin window and confirm no console/devtools window opens.

- [ ] **Step 6: Commit packaging/docs changes**

```bash
git add scripts/package-frameset-search-importer.py README.md
git commit -m "build: package Frame Set search importer"
```

## Final verification

Run the complete validation suite:

```bash
npm --prefix plugins/frameset-search-importer test
npm run lint
npx tsc --noEmit -p plugins/frameset-search-importer
git diff --check
python3 scripts/package-frameset-search-importer.py
git status --short --branch
```

Expected: green tests/checks, validated package, and only intentional committed changes.

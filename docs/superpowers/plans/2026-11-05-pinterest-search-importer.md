# Pinterest Search Importer for Eagle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a compatible v2 replacement for Eagle’s Pinterest Visual Search plugin with a Pinterest keyword search field and an in-image “Download to Eagle” action that imports selected images directly into the current Eagle folder.

**Architecture:** Create a self-contained Eagle Window plugin in `plugins/pinterest-search-importer`. The plugin owns a compact toolbar and an embedded Pinterest `webview`; it navigates the webview to Pinterest search results, injects a small content script that adds import buttons to image cards, and sends normalized Pin/image metadata back to the plugin process. A queue module performs duplicate checks, downloads/imports through `eagle.item.addFromURL` or a temporary local file, and reports progress in the plugin UI. Because the original published plugin source is not present in this repository, this is a clean compatible implementation rather than a binary patch.

**Tech Stack:** Eagle Plugin API, plain HTML/CSS/JavaScript, Electron `webview`, Node 16 built-ins, `eagle.item.addFromURL`, `eagle.folder.getSelected`, `node:test` fixtures, ESLint, TypeScript checkJs.

---

## Product decisions

- Search is performed by the user in Pinterest’s own web experience; the plugin does not implement an unauthorized Pinterest API or background scraper.
- Each image card gets an explicit user-controlled import button. There is no automatic bulk downloading.
- Imports go to the folders currently selected in Eagle. If no folder is selected, the item is added to the library root.
- Every imported item records the Pin URL as its source link and stores Pinterest metadata in the item description/comment where the Eagle API supports it.
- The first release supports image Pins. Video Pins show a clear “not supported yet” state instead of silently importing a thumbnail.
- Pinterest login remains inside the webview session. The plugin must not ask for or store Pinterest passwords or cookies.

## File map

- Create `plugins/pinterest-search-importer/manifest.json` — Eagle Window plugin manifest, version `2.0.0`.
- Create `plugins/pinterest-search-importer/package.json` — self-contained plugin metadata and test script.
- Create `plugins/pinterest-search-importer/jsconfig.json` — shared checkJs configuration.
- Create `plugins/pinterest-search-importer/index.html` — search toolbar, status area, embedded webview, and import feedback UI.
- Create `plugins/pinterest-search-importer/css/style.css` — compact Eagle-style layout and button states.
- Create `plugins/pinterest-search-importer/js/plugin.js` — lifecycle wiring, UI events, webview bridge, and Eagle integration.
- Create `plugins/pinterest-search-importer/js/webview-preload.js` — minimal isolated preload that forwards validated guest-page messages with Electron `ipcRenderer.sendToHost`.
- Create `plugins/pinterest-search-importer/js/pinterest-bridge.js` — search URL creation, injected-card script, message validation, and Pin/image normalization.
- Create `plugins/pinterest-search-importer/js/import-queue.js` — concurrency-limited import queue, dedupe, progress, retry, and cancellation.
- Create `plugins/pinterest-search-importer/js/eagle-importer.js` — selected-folder lookup and `eagle.item` import adapter.
- Create `plugins/pinterest-search-importer/js/settings.js` — local settings for image-size preference and import metadata behavior.
- Create `plugins/pinterest-search-importer/tests/pinterest-bridge.test.js` — deterministic tests using saved HTML/message fixtures.
- Create `plugins/pinterest-search-importer/tests/import-queue.test.js` — queue, dedupe, retry, and concurrency tests with a fake importer.
- Create `plugins/pinterest-search-importer/plugin.png` — 128×128 plugin icon.
- Modify `package.json` — add a root test command that runs plugin unit tests.

### Task 1: Scaffold the compatible v2 plugin

**Files:** Create the manifest, package, jsconfig, HTML, CSS, and placeholder plugin icon listed above.

- [ ] **Step 1: Write the manifest and package metadata.**

Use this manifest shape:

```json
{
  "id": "com.eagle.pinterest-search-importer",
  "version": "2.0.0",
  "name": "Pinterest Search Importer",
  "logo": "plugin.png",
  "devTools": true,
  "keywords": ["pinterest", "search", "download", "import", "visual search"],
  "main": {
    "url": "index.html",
    "width": 1100,
    "height": 760,
    "minWidth": 720,
    "minHeight": 480,
    "resizable": true,
    "frame": true,
    "backgroundColor": "#f7f7f5"
  }
}
```

Use a plugin-local package with:

```json
{
  "name": "eagle-pinterest-search-importer",
  "private": true,
  "version": "2.0.0",
  "scripts": { "test": "node --test tests/*.test.js" }
}
```

- [ ] **Step 2: Add the initial UI structure.**

`index.html` must contain a search input with id `searchInput`, a `searchButton`, a `targetLabel`, an `importStatus`, a `settingsButton`, and a `<webview id="pinterestView" allowpopups></webview>`. Add a hidden `#loginNotice` that explains that Pinterest login, if needed, happens in the embedded Pinterest page.

- [ ] **Step 3: Add baseline styling.**

Style the toolbar as a fixed top row, keep the webview filling the remaining window, and define `.pin-import-button`, `.pin-import-button.importing`, `.pin-import-button.imported`, and `.pin-import-button.failed` classes so the injected controls can reuse the visual language.

- [ ] **Step 4: Run static checks.**

Run `npm run lint` and `npx tsc --noEmit -p plugins/pinterest-search-importer`.

Expected result: the new files load without syntax/type errors; the plugin may still be non-functional because event wiring is not implemented yet.

- [ ] **Step 5: Commit.**

```bash
git add plugins/pinterest-search-importer
git commit -m "feat: scaffold Pinterest search importer plugin"
```

### Task 2: Implement Pinterest navigation and result-card bridge

**Files:** Create `plugins/pinterest-search-importer/js/pinterest-bridge.js` and `plugins/pinterest-search-importer/js/webview-preload.js`; modify `index.html`/`css/style.css` only if bridge styles need to be exposed.

- [ ] **Step 1: Write failing normalization tests.**

In `tests/pinterest-bridge.test.js`, test that `buildSearchUrl("  interior design ")` returns `https://www.pinterest.com/search/pins/?q=interior%20design`, that a Pin URL is normalized without tracking parameters, and that an extracted message with `pinUrl`, `imageUrl`, and `title` is accepted while a message without `pinUrl` or `imageUrl` is rejected.

- [ ] **Step 2: Run the focused tests.**

Run `npm --prefix plugins/pinterest-search-importer test`.

Expected result: FAIL because the bridge module and exports do not exist.

- [ ] **Step 3: Implement pure bridge functions.**

Export CommonJS functions with these signatures:

```js
buildSearchUrl(query) -> string
normalizePinUrl(url) -> string|null
normalizeImageUrl(url) -> string|null
validateImportMessage(message) -> object|null
```

`validateImportMessage` must reject non-object values, non-HTTP(S) URLs, URLs not pointing to Pinterest/image hosts where applicable, and messages with missing IDs. It must return a new object containing `pinId`, `pinUrl`, `imageUrl`, `title`, `description`, `author`, and `isVideo`.

- [ ] **Step 4: Add the isolated webview preload.**

Create `js/webview-preload.js` with no Node filesystem, network, or credential access. Expose only a `window.eaglePinterestHost.send(payload)` function through `contextBridge`; the implementation sends `{ type: "eagle-pinterest-import", payload }` using `ipcRenderer.sendToHost`. The preload must also listen for host status messages and dispatch a browser `eagle-pinterest-import-status` event. Add the preload path to the webview’s `preload` attribute using the plugin’s local absolute path resolution.

- [ ] **Step 5: Implement the injected card script.**

The bridge must expose `getInjectedCardScript()`, returning a self-contained script that:

1. Uses a `MutationObserver` to inspect newly rendered Pinterest cards.
2. Finds the card’s Pin link and the best available image source (`src`, `srcset`, or `data-src`).
3. Adds exactly one button per card, marked with `data-eagle-pin-id`.
4. Sends `{ type: "eagle-pinterest-import", payload: ... }` through `window.eaglePinterestHost.send(...)` after the user clicks the button.
5. Stops event propagation so the normal Pinterest card click is not triggered.
6. Changes the button label to `Importing…`, `Imported`, or `Retry` based on messages sent back by the plugin.

Do not attempt to scrape pages in the background or follow infinite scroll programmatically; the observer only decorates content that Pinterest has rendered for the user.

- [ ] **Step 6: Wire navigation and messages in `plugin.js`.**

On search submit, call `pinterestView.loadURL(buildSearchUrl(searchInput.value))`. On `did-finish-load`, execute the injected script with `pinterestView.executeJavaScript(getInjectedCardScript())`. Listen for the webview’s `ipc-message` event, require the `eagle-pinterest-import` channel, validate the payload, and forward it to the queue. Send queue status back through the webview’s send/preload channel so the matching card button changes state. Add an explicit fallback “Open Pinterest” button if webview messaging is unavailable.

- [ ] **Step 7: Run tests and static checks.**

Run `npm --prefix plugins/pinterest-search-importer test`, `npm run lint`, and `npx tsc --noEmit -p plugins/pinterest-search-importer`.

Expected result: bridge tests PASS and static checks report no new errors.

- [ ] **Step 8: Commit.**

```bash
git add plugins/pinterest-search-importer/js/pinterest-bridge.js plugins/pinterest-search-importer/tests/pinterest-bridge.test.js plugins/pinterest-search-importer/index.html plugins/pinterest-search-importer/js/plugin.js
git commit -m "feat: add Pinterest search and image-card bridge"
```

### Task 3: Implement Eagle import adapter

**Files:** Create `plugins/pinterest-search-importer/js/eagle-importer.js` and modify `types/eagle-plugin-api.d.ts` only if the existing declarations are missing required `addFromURL` option fields.

- [ ] **Step 1: Define the adapter contract.**

Implement:

```js
async function getCurrentTargetFolderIds(eagleApi) -> string[]
async function importPin(eagleApi, pin, options) -> { itemId, folderIds }
```

`getCurrentTargetFolderIds` calls `eagle.folder.getSelected()` and returns selected folder IDs, or `[]` when no folder is selected or the API is temporarily unavailable.

- [ ] **Step 2: Implement direct Eagle import.**

Call `eagle.item.addFromURL(pin.imageUrl, { name, website, description, tags, folders })`, using the highest-resolution URL supplied by the bridge. The `website` value must be the normalized Pin URL. Use the Pin title as the item name, falling back to `Pinterest ${pin.pinId}`. Never write directly to Eagle’s library files.

- [ ] **Step 3: Add metadata and safe fallback behavior.**

If `addFromURL` fails, retry once with the same URL after a short delay, then return a typed error for the queue. If Eagle rejects a URL because the image host blocks the request, optionally download it to a temporary file using Node’s HTTPS client and call `eagle.item.addFromPath`; ensure temporary files are removed in a `finally` block.

- [ ] **Step 4: Add adapter tests with a fake Eagle API.**

Test selected folders, root-library fallback, item naming, source URL preservation, tags, and the one-time retry. The tests must never contact Pinterest or Eagle.

- [ ] **Step 5: Run tests and commit.**

Run `npm --prefix plugins/pinterest-search-importer test` and `npx tsc --noEmit -p plugins/pinterest-search-importer`.

```bash
git add plugins/pinterest-search-importer/js/eagle-importer.js plugins/pinterest-search-importer/tests
git commit -m "feat: import Pinterest images into Eagle folders"
```

### Task 4: Add import queue, duplicate protection, and feedback

**Files:** Create `plugins/pinterest-search-importer/js/import-queue.js` and `tests/import-queue.test.js`; modify `plugin.js` and injected bridge messaging.

- [ ] **Step 1: Write queue tests first.**

Cover these cases with a fake importer: duplicate Pin IDs are imported once, at most three imports run concurrently, a failed import can be retried once by the user, completed imports emit `done`, and failed imports emit `error` without stopping unrelated jobs.

- [ ] **Step 2: Implement the queue.**

Expose a factory:

```js
createImportQueue({ importer, concurrency, onUpdate })
```

The queue key is `pinId` when available and the normalized image URL otherwise. It must preserve insertion order, cap active imports at `3`, and emit `{ key, state, progress, error, itemId }` updates.

- [ ] **Step 3: Connect queue updates to the webview.**

When a queue item changes state, send a small status message back to the Pinterest webview so the matching card button changes state. Also update the plugin toolbar with `Imported N`, `Queued N`, and `Failed N` counts.

- [ ] **Step 4: Add an import history session cache.**

Keep imported Pin IDs in memory for the current plugin session. Add a “Clear session history” setting. Do not persist Pinterest content or image data in plugin storage.

- [ ] **Step 5: Run focused and full checks, then commit.**

Run `npm --prefix plugins/pinterest-search-importer test`, `npm run lint`, and `npx tsc --noEmit -p plugins/pinterest-search-importer`.

```bash
git add plugins/pinterest-search-importer/js/import-queue.js plugins/pinterest-search-importer/js/plugin.js plugins/pinterest-search-importer/tests
git commit -m "feat: add queued Pinterest imports with duplicate protection"
```

### Task 5: Add settings and preserve the existing visual-search workflow

**Files:** Create `js/settings.js`; modify `index.html`, `css/style.css`, and `js/plugin.js`.

- [ ] **Step 1: Define settings.**

Persist only these values in `localStorage` under `pinterest-search-importer:settings`:

```js
{
  imageVariant: "1200x",
  addPinterestTag: true,
  addSearchTag: false,
  openPinAfterImport: false
}
```

- [ ] **Step 2: Add settings UI.**

Provide image-size selection (`1200x`, `original`, `600x`), a Pinterest tag toggle, a search-term tag toggle, and an “Open imported Pin after import” toggle. Defaults must be conservative: `1200x`, Pinterest tag enabled, search-term tag disabled, open-after-import disabled.

- [ ] **Step 3: Preserve visual-search inputs.**

Add an “Image search” tab that accepts an Eagle-selected image, clipboard image, or local dropped image and navigates to the current plugin’s existing visual-search flow when available. If the original visual-search implementation is not available in source, show a clear “Visual search compatibility is planned; keyword search is available now” state rather than pretending it works.

- [ ] **Step 4: Verify settings and UI behavior manually.**

Launch the plugin in Eagle, change each setting, close/reopen the plugin, and confirm settings persist without storing credentials or downloaded image data.

- [ ] **Step 5: Commit.**

```bash
git add plugins/pinterest-search-importer/js/settings.js plugins/pinterest-search-importer/index.html plugins/pinterest-search-importer/css/style.css plugins/pinterest-search-importer/js/plugin.js
git commit -m "feat: add importer settings and visual-search compatibility state"
```

### Task 6: Validate the real Pinterest/Eagle workflow

**Files:** Modify documentation and release metadata as needed: `plugins/pinterest-search-importer/README.md`, root `README.md`, and the plugin manifest.

- [ ] **Step 1: Run the automated verification suite.**

Run:

```bash
npm --prefix plugins/pinterest-search-importer test
npm run lint
npx tsc --noEmit -p plugins/pinterest-search-importer
```

Expected result: all tests pass, ESLint exits 0, and TypeScript exits 0.

- [ ] **Step 2: Test the plugin in Eagle with a public search.**

Search for `mid century interior`, confirm Pinterest renders cards, click one image’s in-image import button, and verify a new Eagle item appears in the currently selected folder with a Pinterest source URL.

- [ ] **Step 3: Test authenticated and failure paths.**

Verify that a Pinterest login prompt remains inside the webview, a failed image import changes the card to `Retry`, duplicate clicks do not create duplicate Eagle items, and a video Pin is clearly marked unsupported.

- [ ] **Step 4: Test folder and metadata behavior.**

Run one import with a selected Eagle folder and one with no folder selected. Confirm the item name, source link, Pinterest tag, and optional search-term tag match settings.

- [ ] **Step 5: Document policy and limitations.**

The plugin README must state that imports are user-initiated, Pinterest login credentials are never collected, imported content remains subject to Pinterest and copyright rules, and Pinterest layout changes may require bridge updates. Link to the official [Pinterest developer terms](https://developers.pinterest.com/terms/) and [Eagle Plugin API](https://developer.eagle.cool/plugin-api/get-started).

- [ ] **Step 6: Package the plugin and commit.**

Create a zip containing only `manifest.json`, `index.html`, `css/`, `js/`, `plugin.png`, and the plugin-local package metadata needed by Eagle. Do not include tests, fixtures, `node_modules`, or credentials.

```bash
git add plugins/pinterest-search-importer/README.md README.md
git commit -m "docs: document Pinterest Search Importer release and limitations"
```

## Self-review checklist

- Search field: covered by Tasks 1–2.
- Download button directly on each image: covered by Task 2.
- Import directly into Eagle: covered by Task 3.
- Current-folder behavior: covered by Task 3.
- Duplicate protection and feedback: covered by Task 4.
- Existing visual-search positioning: covered by Task 5, with an explicit compatibility state if source is unavailable.
- Pinterest policy/security constraints: covered by Product decisions and Task 6.
- Automated tests and manual verification: covered by Tasks 2–4 and Task 6.
- No direct library-file mutation, password collection, or unattended scraping is included.

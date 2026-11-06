# Native Pinterest Workspace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the visible embedded Pinterest page with a native Eagle-style Pinterest results workspace while retaining authenticated Pinterest-backed search and direct Eagle importing.

**Architecture:** Keep a hidden Pinterest webview as the authenticated data/session source. Change the bridge from visible DOM button injection to normalized result collection and host messages. Render and manage results in the plugin host with focused modules for session state, result cards, and view state.

**Tech Stack:** Eagle plugin HTML/CSS/JavaScript, Electron webview preload messaging, Node’s built-in test runner, existing Eagle importer/import queue.

---

### Task 1: Add native result/session contracts and failing tests

**Files:**
- Create: `plugins/pinterest-search-importer/js/native-results.js`
- Create: `plugins/pinterest-search-importer/js/session-state.js`
- Create: `plugins/pinterest-search-importer/tests/native-results.test.js`
- Create: `plugins/pinterest-search-importer/tests/session-state.test.js`

- [ ] **Step 1: Write failing result normalization tests**

Test `normalizePinterestResult` with a valid normalized pin, reject unsafe URLs, preserve `title`/`author`, and deduplicate records by `pinId`.

- [ ] **Step 2: Run the focused tests and verify they fail**

Run: `npm --prefix plugins/pinterest-search-importer test -- tests/native-results.test.js`

Expected: FAIL because the new modules do not exist.

- [ ] **Step 3: Write failing session-state tests**

Test transitions `checking -> authenticated`, `checking -> required`, authenticated search navigation staying authenticated, and `required -> checking -> authenticated` after a successful probe.

- [ ] **Step 4: Run the focused tests and verify they fail for the intended reason**

Run: `npm --prefix plugins/pinterest-search-importer test -- tests/session-state.test.js`

Expected: FAIL with missing module/export errors.

- [ ] **Step 5: Implement the minimal contracts**

Export pure functions for result normalization/deduplication and a small session-state reducer. Keep these modules independent of the DOM and Eagle globals.

- [ ] **Step 6: Run both focused suites and verify they pass**

Run: `npm --prefix plugins/pinterest-search-importer test -- tests/native-results.test.js tests/session-state.test.js`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add plugins/pinterest-search-importer/js/native-results.js plugins/pinterest-search-importer/js/session-state.js plugins/pinterest-search-importer/tests/native-results.test.js plugins/pinterest-search-importer/tests/session-state.test.js
git commit -m "test: define native Pinterest result and session contracts"
```

### Task 2: Change the Pinterest bridge to emit data instead of visible controls

**Files:**
- Modify: `plugins/pinterest-search-importer/js/pinterest-bridge.js`
- Modify: `plugins/pinterest-search-importer/js/webview-preload.js`
- Modify: `plugins/pinterest-search-importer/tests/pinterest-bridge.test.js`

- [ ] **Step 1: Add a failing bridge test for result collection**

Add a test asserting the injected script contains a collector that emits `eagle-pinterest-results` records and does not inject `.pin-import-button` controls.

- [ ] **Step 2: Run the bridge suite and verify the new assertion fails**

Run: `npm --prefix plugins/pinterest-search-importer test -- tests/pinterest-bridge.test.js`

Expected: FAIL because the bridge still injects buttons.

- [ ] **Step 3: Implement result collection**

Refactor the serialized page script to inspect Pinterest cards, extract validated pin records, batch/dedupe them, and send `{ type: "eagle-pinterest-results", results, authenticated }` through the preload host. Keep URL/image validation and mutation observation. Add a session probe that recognizes Pinterest login-required pages without treating every search page as unauthenticated.

- [ ] **Step 4: Update preload forwarding**

Forward result and session messages from the webview to the host without exposing a visible Pinterest page. Preserve existing import-status forwarding only for compatibility while the host becomes the owner of import controls.

- [ ] **Step 5: Run bridge and existing suites**

Run: `npm --prefix plugins/pinterest-search-importer test`

Expected: PASS, including all previous URL validation and import-message tests.

- [ ] **Step 6: Commit**

```bash
git add plugins/pinterest-search-importer/js/pinterest-bridge.js plugins/pinterest-search-importer/js/webview-preload.js plugins/pinterest-search-importer/tests/pinterest-bridge.test.js
git commit -m "refactor: emit Pinterest results for native rendering"
```

### Task 3: Build the native Eagle-style document structure and visual system

**Files:**
- Modify: `plugins/pinterest-search-importer/index.html`
- Modify: `plugins/pinterest-search-importer/css/style.css`

- [ ] **Step 1: Add DOM contract checks**

Add a lightweight test or static assertion that the document contains `appShell`, `resultsGrid`, `emptyState`, `sessionAction`, `resultCount`, and `signInPanel`, and no visible `webview` element in the main results region.

- [ ] **Step 2: Run the check and verify it fails**

Run: `npm --prefix plugins/pinterest-search-importer test -- tests/native-results.test.js`

Expected: FAIL until the new markup exists.

- [ ] **Step 3: Replace the current page-first markup**

Create a dark Eagle-like shell with compact toolbar, search field/button, target-folder label, session action, settings action, result count/status, native results grid, empty/loading/error states, and a focused sign-in panel. Keep the image-search compatibility panel inside the same shell. Move the Pinterest webview into a hidden session container.

- [ ] **Step 4: Implement responsive Eagle styling**

Use Eagle-like dark surfaces, restrained borders, compact controls, 8px/12px spacing, neutral typography, muted red only for Pinterest/session emphasis, masonry columns with card image ratios, hover/focus overlays, visible keyboard focus, and neutral image-error placeholders. Remove the full-width yellow login banner and large red injected-button styling.

- [ ] **Step 5: Run static checks and verify the markup contract passes**

Run: `npm --prefix plugins/pinterest-search-importer test`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add plugins/pinterest-search-importer/index.html plugins/pinterest-search-importer/css/style.css plugins/pinterest-search-importer/tests/native-results.test.js
git commit -m "feat: add native Eagle Pinterest workspace shell"
```

### Task 4: Render native cards and route save/retry actions through the existing importer

**Files:**
- Create: `plugins/pinterest-search-importer/js/native-results-view.js`
- Modify: `plugins/pinterest-search-importer/js/plugin.js`
- Modify: `plugins/pinterest-search-importer/tests/native-results.test.js`

- [ ] **Step 1: Add failing view tests**

Test that rendering a result creates one card with image/title/source, that duplicate `pinId`s produce one card, and that status updates change the action text to `Saving…`, `Saved`, or `Retry` without replacing the result.

- [ ] **Step 2: Run the focused suite and verify it fails**

Run: `npm --prefix plugins/pinterest-search-importer test -- tests/native-results.test.js`

Expected: FAIL because the view module does not exist.

- [ ] **Step 3: Implement the view module**

Export a DOM renderer/controller that accepts normalized results, creates safe DOM nodes with textContent, attaches save/retry callbacks, renders image failures, and applies queue status by pin ID. Do not use `innerHTML` with Pinterest-controlled strings.

- [ ] **Step 4: Connect host messages in `plugin.js`**

Listen for `eagle-pinterest-results`, normalize/dedupe results, render them, and on save create the existing import job with the current Eagle target folder, current settings, query, and retry flag. Route import queue updates to both compact global counters and card status. Preserve session history and clear-history behavior.

- [ ] **Step 5: Run all tests**

Run: `npm --prefix plugins/pinterest-search-importer test`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add plugins/pinterest-search-importer/js/native-results-view.js plugins/pinterest-search-importer/js/plugin.js plugins/pinterest-search-importer/tests/native-results.test.js
git commit -m "feat: render Pinterest results as native Eagle cards"
```

### Task 5: Implement authentication-aware UI and eliminate the stale login message

**Files:**
- Modify: `plugins/pinterest-search-importer/js/plugin.js`
- Modify: `plugins/pinterest-search-importer/js/session-state.js`
- Modify: `plugins/pinterest-search-importer/index.html`
- Modify: `plugins/pinterest-search-importer/css/style.css`
- Modify: `plugins/pinterest-search-importer/tests/session-state.test.js`

- [ ] **Step 1: Add failing UI-state tests**

Test that authenticated session state hides the session action and login panel, required state shows only the compact sign-in action, and a successful post-login probe returns to authenticated with no login notice.

- [ ] **Step 2: Run the focused suite and verify it fails**

Run: `npm --prefix plugins/pinterest-search-importer test -- tests/session-state.test.js`

Expected: FAIL against the current unconditional login notice behavior.

- [ ] **Step 3: Implement session-aware rendering**

Start in `checking`, update from bridge probe messages, show the sign-in panel only for `required`, and re-probe on webview navigation, `dom-ready`, and explicit sign-in completion. The ordinary search flow must never set a login banner visible by default.

- [ ] **Step 4: Implement sign-in action behavior**

The compact action temporarily reveals the hidden session webview in the focused sign-in panel, loads Pinterest account/search context, and returns to the native results view after the probe reports authenticated. If authentication fails, keep the compact action and show one actionable error.

- [ ] **Step 5: Run all tests and lint**

Run: `npm test && npm run lint`

Expected: PASS with no lint errors.

- [ ] **Step 6: Commit**

```bash
git add plugins/pinterest-search-importer/js/plugin.js plugins/pinterest-search-importer/js/session-state.js plugins/pinterest-search-importer/index.html plugins/pinterest-search-importer/css/style.css plugins/pinterest-search-importer/tests/session-state.test.js
git commit -m "fix: make Pinterest login state session-aware"
```

### Task 6: Update package metadata, documentation, and verification coverage

**Files:**
- Modify: `plugins/pinterest-search-importer/README.md`
- Modify: `plugins/pinterest-search-importer/manifest.json`
- Modify: `docs/superpowers/plans/2026-11-06-native-pinterest-workspace.md`

- [ ] **Step 1: Update README behavior and troubleshooting**

Document the native results view, hidden authenticated Pinterest session, compact login action, import states, target-folder behavior, and the fact that Pinterest login prompts disappear after session detection.

- [ ] **Step 2: Update manifest/version if needed**

Bump the plugin patch/minor version only if Eagle requires a new install to replace the already-tested package; keep the plugin ID stable so existing settings and install identity are preserved.

- [ ] **Step 3: Run complete verification**

Run:

```bash
npm test
npm run lint
npx tsc --noEmit -p plugins/pinterest-search-importer
git diff --check
python3 scripts/package-pinterest-search-importer.py
```

Expected: all commands pass and the deterministic `.eagleplugin` package is recreated.

- [ ] **Step 4: Commit**

```bash
git add plugins/pinterest-search-importer/README.md plugins/pinterest-search-importer/manifest.json docs/superpowers/plans/2026-11-06-native-pinterest-workspace.md
git commit -m "docs: document native Pinterest workspace"
```

### Task 7: Verify inside Eagle and finish integration

**Files:**
- No source changes expected; package output: `dist/pinterest-search-importer-<version>.eagleplugin`

- [ ] **Step 1: Install the rebuilt package in Eagle**

Use Eagle → Plugin → Developer options → Import Local Project and select the generated package. Preserve the existing original Pinterest plugin until the new package has been verified.

- [ ] **Step 2: Verify native initial state**

Launch `Pinterest Search Importer`; confirm the app opens as a dark Eagle-style workspace with native toolbar/grid empty state and no visible Pinterest page or unconditional login banner.

- [ ] **Step 3: Verify search and session states**

Search for `Hyrox` or `interior design`; confirm cards render in the native grid. Confirm authenticated state hides login UI. If Pinterest requires login, use the compact sign-in action, complete login, and confirm the login panel/banner disappears without restarting the plugin.

- [ ] **Step 4: Verify Eagle import**

Choose a target folder, save one card, verify `Saving…` then `Saved`, confirm the image appears in Eagle with Pinterest URL/tag metadata, and verify retry/error behavior with a failed image or network interruption.

- [ ] **Step 5: Record any Eagle-only defects and fix them with a regression test**

If a defect is found, add a focused test before changing the implementation, rerun the complete verification commands, and rebuild the package.

- [ ] **Step 6: Commit final verification notes if needed**

```bash
git status --short --branch
```

Expected: clean main branch with the native redesign commits and generated package available in `dist/`.


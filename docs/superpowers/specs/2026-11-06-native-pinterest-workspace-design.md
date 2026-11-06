# Native Pinterest Workspace Design

## Goal

Make Pinterest Search Importer feel like a native Eagle tool instead of a Pinterest page inside a pop-up, while preserving Pinterest-backed search, authentication, image extraction, and direct Eagle importing.

## Product decisions

- The visible experience is always an Eagle-style dark workspace.
- Pinterest page chrome, navigation, promoted content controls, and oversized Pinterest download buttons are not shown in the main interface.
- Search results are rendered as the plugin's own responsive masonry grid.
- Each result card has a compact import control revealed on hover/focus, with states `Save`, `Saving…`, `Saved`, and `Retry`.
- The current Eagle target folder remains visible in the toolbar and is captured when the user saves a result.
- Settings remain available but are presented as a compact popover/panel rather than a full-width utility row.

## Authentication behavior

Pinterest remains available as a hidden authenticated webview/session because Pinterest session cookies and page data are required by the current bridge. The webview is not the primary visual surface.

The UI has three session states:

1. `checking`: results area shows a small neutral session indicator.
2. `authenticated`: the indicator disappears; no login banner is rendered.
3. `required`: a compact toolbar action says `Sign in to Pinterest`; selecting it temporarily presents the sign-in webview in a focused modal/panel. After navigation or authentication completes, the plugin re-checks the page for a signed-in account and returns to the native results view.

The plugin must not show “sign in” text merely because a search page has loaded. Authentication is required only when the page/session probe reports it.

## Search and data flow

1. User submits a keyword in the native toolbar.
2. The hidden Pinterest session navigates to the search URL.
3. The bridge extracts normalized pin records from Pinterest’s DOM and sends them to the host.
4. The host renders records in the native grid.
5. Saving a card sends the normalized record through the existing import queue and Eagle importer.
6. Queue updates update the card state and compact global counters.

The extraction bridge remains isolated from rendering. It may continue to use DOM mutation observation, but it must emit normalized records rather than injecting visible controls into Pinterest cards.

## UI structure

- `app-shell`: dark Eagle background and three vertical regions.
- `toolbar`: plugin icon/name, search field, search button, target folder, session action, settings, compact import counts.
- `results-header`: current query, result count, refresh/loading state.
- `results-grid`: responsive masonry-like CSS columns or grid with stable card ordering.
- `result-card`: image, optional title/source metadata, hover/focus save action, import state.
- `empty-state`: first-use, no-results, session-required, or error message with one clear action.
- `sign-in-panel`: only mounted/displayed while authentication is required or the user explicitly chooses sign in.

Image cards must use safe normalized image URLs already validated by the bridge. Image loading failures show a neutral placeholder and a retry action; they must not break the rest of the grid.

## Compatibility and scope

- The existing Image search compatibility tab stays available, but it receives the same native shell and no longer exposes the Pinterest webview as its main content.
- Existing folder selection, import settings, duplicate handling, queue concurrency, retry behavior, and Eagle metadata remain unchanged unless the native result adapter requires a small interface adjustment.
- The old webview injection button path is removed from the visible workflow and retained only as a fallback for extracting records if no direct bridge path is available.

## Testing and verification

- Unit tests cover session-state transitions, result normalization, native card rendering/state updates, and import event routing.
- Existing bridge, importer, queue, and settings tests continue to pass.
- Type checking, linting, package validation, and `git diff --check` must pass.
- Eagle manual verification covers: initial state, keyword search, authenticated state with no login banner, required-login flow, save-to-Eagle, retry, target folder display, and settings.


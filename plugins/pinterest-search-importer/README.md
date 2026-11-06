# Pinterest Search Importer (v2.1.0)

Eagle Window plugin for Pinterest keyword searches and user-initiated image imports.
This is a compatible v2 implementation: the original published Pinterest Visual
Search plugin source is unavailable in this repository. It is not a patch of that
plugin, and visual search is not implemented. Live Eagle/Pinterest UI validation
is still required before publishing.

## Install and use

1. Use Eagle with Window plugins and Electron `webview` support, an internet
   connection, and an open Eagle library. No plugin-local npm install or build
   step is needed; runtime modules come from Node/Eagle.
2. In Eagle's Plugin panel, use **Developer Options → Create Plugin** (or
   **Import**, depending on the Eagle version) and select this folder. For a
   release zip, extract it into its own folder first and select that folder.
   See the [Eagle Plugin API guide](https://developer.eagle.cool/plugin-api/get-started).
3. Select the destination folder(s) in Eagle's sidebar before importing.
4. In **Keyword search**, enter a phrase such as `mid century interior`, then
   press Enter or **Search**. Results render in an Eagle-native masonry grid.
   The Pinterest session stays hidden unless a sign-in action is required.
5. Hover a result and click **Save to Eagle**. The control changes to **Saving…**,
   then **Saved**, or **Retry** on failure. Video
   Pins are unsupported and report an error instead of importing a thumbnail.

Only clicked images are imported. Scrolling decorates cards Pinterest renders;
there is no unattended search, automatic scrolling, or bulk download action.
Up to three imports run concurrently in click order. **Queued** includes active
imports; **Imported** and **Failed** count retained session outcomes.

## Folders, metadata, and settings

Folder selection is read when **Download to Eagle** (or **Retry**) is clicked.
Changing Eagle's selection while an import waits in the queue does not redirect
that job. Multiple selected folders are supported. No selection, or an unavailable
folder-selection API, means the library root. The toolbar's `Saving to: —` text is
currently a placeholder; confirm the selection in Eagle itself.

Imports use Eagle's API without writing library files directly. The item name
comes from the image/Pin title, falling back to `Pinterest <Pin ID>`. The canonical
Pinterest Pin URL becomes the source website link, with tracking parameters
removed. Available title, description, and author text goes into Eagle's
`annotation` field. Metadata depends on what the rendered card exposes and may
be incomplete.

Open **Settings** to change these preferences; changes apply to subsequent clicks:

| Setting | Default | Behavior |
| --- | --- | --- |
| Image size | `1200x` | Choose `1200x`, `Original`, or `600x` if Pinterest supplied that variant; otherwise use the best supplied image. URLs are never guessed. |
| Add Pinterest tag | On | Adds the tag `Pinterest`. |
| Add search-term tag | Off | Adds the trimmed search phrase from the current results URL as one tag. |
| Open Eagle item after import | Off | Opens the newly imported Eagle item, not the Pinterest page. Opening failure does not invalidate the import. |

**Reset settings** restores these defaults. Only these four preferences persist
in localStorage under `pinterest-search-importer:settings`. If local storage is
unavailable, preferences apply for this session and the toolbar reports that.

## Retries and session history

An Eagle URL import failure automatically retries the same image URL once after
250 ms. If both attempts fail, the card shows **Retry** with the error in its
tooltip and the toolbar. Clicking **Retry** explicitly queues another attempt,
using the then-current folders and settings. Other jobs continue after a failure.
The adapter has an optional temporary-file fallback for callers, but the plugin UI
does not enable it; blocked image downloads can therefore still fail.

Duplicate clicks on a queued, active, or completed Pin are suppressed within the
current plugin session, including across searches/page reloads in that window.
This is not a search for duplicates already in your Eagle library. **Clear session
history** removes completed and failed entries, resets their card controls, and
allows those Pins to be imported again; queued/active jobs remain protected.
Closing/reopening the plugin also resets history. Session history retains IDs and
outcomes in memory, not downloaded images or Pin descriptions. Closing is not a
durable queue/resume mechanism; let imports finish before closing the window.

## Search scope

This release intentionally focuses on Pinterest keyword search and direct Eagle
imports. Visual/image search is not exposed in the plugin UI.

Pinterest results are collected progressively as Pinterest's infinite-scroll
page loads more Pins; the plugin does not impose a result-count cap.

Results are locally ranked using title, description, author, exact-phrase, and
all-term matches. Duplicate image URLs are removed while preserving stable
source order for equal scores.

## Pinterest login, security, and policy

Sign in only through Pinterest's page in the embedded browser. The plugin does
not collect Pinterest passwords, read/export cookies, or save credentials in its
settings. Browser session/cookie handling belongs to Eagle/Electron; sign-in
persistence across plugin restarts has not been validated. Use Pinterest's own
account controls to sign out. Do not send credentials or session cookies in bug
reports.

The Pinterest guest uses context isolation, sandboxing, and disabled Node
integration. Its minimal preload exposes the import/status bridge, with no
filesystem, network, or credential API. Host-side imports validate Pin IDs and
URLs: Pin links must be on `pinterest.com`, and supported image URLs must be on
`pinimg.com`. This does not bypass Pinterest login, challenges, or access limits.

Save only content you own or have permission to save. A Pin's availability and
its source link do not grant copyright or redistribution rights. Imports remain
subject to Pinterest's rules and the rights of content owners. Review the official
[Pinterest developer terms](https://developers.pinterest.com/terms/) and
[Pinterest Terms of Service](https://policy.pinterest.com/en/terms-of-service)
before use or distribution. This compatible implementation is not a statement of
Pinterest approval or policy compliance. Pinterest layout changes may require
bridge updates.

## Troubleshooting

| Symptom | Action |
| --- | --- |
| Search is disabled or **Open Pinterest** appears | Let Eagle initialize the plugin. If embedded webview/messaging is unavailable or navigation fails, use **Open Pinterest** to browse externally. External browsing does not inject import controls; it is not an alternative automatic import path. Verify webview support in the target Eagle version. |
| Login, challenge, or blank results | Complete Pinterest's prompts in the embedded page, check connectivity, and try a public keyword search. Do not attempt to bypass a challenge. |
| No **Download to Eagle** button | Let cards/images render and scroll normally. Unsupported cards, image hosts, or changed Pinterest markup may not be decorated. Record the page URL and Eagle version for bridge diagnosis. |
| **Retry** or a failed import | Read the toolbar/error tooltip, check the library and image availability, and retry explicitly. Try another Pin or an available size. Video Pins remain unsupported. |
| Item went to the root or an unexpected folder | Check Eagle's selection at click time; selection API failure falls back to root. The toolbar does not currently display the resolved folders. |
| Missing tags, low-resolution image, or sparse metadata | Check Settings before clicking. Only variants and metadata present in the rendered card are available. |
| Reimport is suppressed | Use **Clear session history** if intentional. This can create a second Eagle item; there is no library-wide deduplication. |
| Settings reset after reopening | Check whether local storage is available; session-only settings are reported in the toolbar. |

For development builds, enable DevTools in the manifest. For reports, include the Eagle
version, plugin version, relevant public Pin/search URL, and error text, with
credentials/cookies removed.

## Automated verification and release packaging

From the repository root, install development dependencies with `npm ci`, then run:

```bash
npm --prefix plugins/pinterest-search-importer test
npm run lint
npx tsc --noEmit -p plugins/pinterest-search-importer
git diff --check
python3 scripts/package-pinterest-search-importer.py
```

Packaging requires Python 3.9+ and uses only its standard library. The default
output is `dist/pinterest-search-importer-2.0.0.zip` (ignored by Git).
Use `--output <path>` to override it. Do not commit the generated archive.

The packager uses an explicit runtime file allowlist, sorted entries, fixed ZIP
timestamps/permissions, and stored bytes (no compressor variation). Unchanged
inputs produce identical archive bytes. It validates matching manifest/package
versions, packaged entry point/icon, archive entries, and CRCs before writing.
The zip has no enclosing folder and contains the allowlisted runtime files,
including the native results and session modules:

```text
css/style.css
index.html
js/eagle-importer.js
js/import-queue.js
js/pinterest-bridge.js
js/plugin.js
js/settings.js
js/webview-preload.js
manifest.json
package.json
plugin.png
```

The packaged `package.json` contains only `name`, `private`, and `version`.
Tests, fixtures, node_modules, docs, editor/type-check configs, credentials,
temporary files, and development scripts/dependencies are excluded. New runtime
files require an explicit allowlist update and package review.

Task 6 automated verification results (2026-11-05):

| Command/check | Recorded result |
| --- | --- |
| `npm --prefix plugins/pinterest-search-importer test` | Exit 0: 79 tests passed; 0 failed, cancelled, skipped, or todo. Tests use fake Eagle/browser/network dependencies, not a live service. |
| `npm run lint` | Exit 0: ESLint reported no warnings or errors. |
| `npx tsc --noEmit -p plugins/pinterest-search-importer` | Exit 0: no diagnostics. |
| `git diff --check` | Exit 0: no whitespace errors. |
| Static package validation | 11 allowlisted entries; CRC/content/metadata checks passed; repeated builds were byte-identical, including after source timestamp/mode changes; all 9 excluded-file sentinel checks passed. |

Validated archive SHA-256:
`3f5f7eb1ee7bf8d0373039afa6763593f7c864cc4c14d086875f4d481d561a95`.

### Required live validation before publishing

**Not performed for Task 6: live Eagle/Pinterest UI validation is still required.**
Automated/static checks do not establish compatibility with a real Eagle runtime
or Pinterest's current markup. Test the extracted release package and record the
Eagle version/platform and outcomes before publishing:

- Search `mid century interior`, confirm cards and in-image controls render, import
  a public image, and inspect the saved item/source URL in Eagle.
- Test logged-out and authenticated Pinterest flows, keeping credentials in
  Pinterest's page; confirm challenges and blocked images fail visibly.
- Import with selected folder(s), no selected folder, and a folder change while
  jobs are queued; inspect name, annotation, source, and tags.
- Exercise duplicate clicks, a failed import and explicit **Retry**, video-Pin
  rejection, session counts, history clearing, and reopening the plugin.
- Change every setting, restart to verify persistence, test available image sizes
  and opening the Eagle item, then reset defaults.
- Preview Eagle-selected, clipboard, and dropped images; confirm the compatibility
  limitation is visible and no visual search/upload is implied.
- Verify navigation/reload status restoration and the external-browser fallback
  when embedded messaging is unavailable.

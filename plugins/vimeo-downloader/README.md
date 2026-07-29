# Vimeo Downloader

Eagle window plugin: paste a Vimeo URL → downloads best available quality via
`yt-dlp` + `ffmpeg` → imports the file into whichever Eagle folder(s) are
currently selected, with your tags applied.

## Requirements

- `yt-dlp` and `ffmpeg` on your machine. The plugin auto-detects them by
  running `which` through your login shell (`$SHELL -lc "which yt-dlp"`), so
  anything on your normal shell PATH (Homebrew, pipx, etc.) is found
  automatically. If detection fails, set explicit paths in the plugin's
  **Settings** panel (gear icon, top right).
- Verified on this machine: `yt-dlp` at `/opt/homebrew/bin/yt-dlp`, `ffmpeg`
  at `/usr/local/bin/ffmpeg`.
- **`curl_cffi`** installed into yt-dlp's own Homebrew venv
  (`/opt/homebrew/Cellar/yt-dlp/*/libexec/bin/python3 -m pip install curl_cffi`)
  so yt-dlp can impersonate a real browser's TLS fingerprint for Vimeo. Without
  it you'll see `WARNING: attempting impersonation, but no impersonate target
  is available`.
- **A logged-in Vimeo session, via `--cookies-from-browser`.** As of writing,
  Vimeo's anonymous API access is broken upstream in yt-dlp
  ([yt-dlp#17271](https://github.com/yt-dlp/yt-dlp/issues/17271) — the
  "macos OAuth token" fallback yt-dlp used for anonymous requests now 401s),
  so almost every video needs real account cookies. Pick your browser in the
  plugin's **Settings → Cookies from browser** (defaults to Chrome). Chrome
  and Brave decrypt their cookie DB via a Keychain item ("Chrome Safe
  Storage" / "Brave Safe Storage") — the first download after picking one
  will trigger a one-time macOS Keychain permission prompt; choose **Always
  Allow** so it doesn't ask again. Safari needs **Eagle.app** granted Full
  Disk Access instead (System Settings → Privacy & Security → Full Disk
  Access → **+** → browse to `/Applications/Eagle.app`; if Eagle doesn't
  appear in the list after adding it, that's a known Full Disk Access UI
  quirk — Chrome/Brave sidestep it entirely). Firefox needs no extra
  permission at all. Once yt-dlp/Vimeo fix the anonymous path upstream, this
  requirement should relax again — leave the setting on "None" to test if
  it's no longer needed.

## How it works

1. Paste a `vimeo.com/...` URL, optionally add comma-separated tags, hit
   **Download** (or Enter).
2. The currently selected Eagle folder(s) (shown under the input as
   "Saving to: …") become the target for that download — select a folder in
   Eagle's sidebar before/while pasting.
3. Up to 3 downloads run concurrently. Each row fetches metadata first
   (title + thumbnail) via `yt-dlp -J`, then downloads with
   `-f "bv*+ba/b"` (always best available video+audio, merged to mp4 by
   ffmpeg).
4. If the initial request fails (common with domain-locked embedded
   players), it retries once with `--referer https://vimeo.com/` and once
   with `--referer <the video URL itself>` — mirroring what a normal browser
   tab sends, not a DRM bypass. Password-protected or DRM-protected (Vimeo
   OTT) videos surface a clear error instead of being forced.
5. On success the finished file is imported via `eagle.item.addFromPath`
   with your tags/folders/source URL, then the temp copy is deleted.
6. **Clear finished** removes completed/failed rows from the list; active
   ones keep running.

Please only download content you own or otherwise have the rights to save,
per Vimeo's Terms of Service.

## Loading it into Eagle

Eagle plugins are registered through its UI, not via a CLI/API:

1. Open Eagle → **Plugin panel → Developer Options → Create Plugin** (or
   **Import**, depending on your Eagle version).
2. Point it at this folder: `plugins/vimeo-downloader`.
3. Launch it from the Plugin panel. Press **F12** for DevTools if something
   looks off; `eagle.log.*` calls also land in Eagle's app log.

## Known limitations (v0.1.0)

- Download list is in-memory only — closing the plugin window clears it
  (finished imports are already safely in your Eagle library by then).
- No cancel button yet for in-flight downloads.
- Vimeo "showcase"/album URLs and unlisted-hash URLs work through yt-dlp's
  own extractor as-is; no special-casing beyond the referer retry above.

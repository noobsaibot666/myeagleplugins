# Frame Set Search Importer Design

## Goal

Create a native Eagle window plugin that searches Frame Set’s public search endpoint and imports still frames directly into the current Eagle folder.

## User experience

- A single keyword/natural-language search field and Search button.
- Results load in an Eagle-native dark interface with no embedded Frame Set page.
- The feed uses a responsive CSS grid with 16:9 cards because Frame Set’s search results are predominantly widescreen.
- Each card shows only the image and a minimal centered download icon on hover/focus.
- Infinite loading begins near the bottom of the scroll container; there is no “Load more” button.
- Search results are still frames only. Motion previews are excluded from this image-importer version so downloading always produces a still image in Eagle.
- Imports use Eagle’s currently selected folder, with library-root fallback when no folder is selected.
- The plugin reports search, queue, success, and failure states without opening Frame Set in a popup or opening DevTools.

## Data flow

1. The plugin requests `GET https://frameset.app/api/search?page=N&size=50&search=QUERY`.
2. The bridge validates the response, keeps `type === "still"`, and normalizes title, collection URL, source metadata, dimensions, and the CloudFront image URL `https://d13mryl9xv19vu.cloudfront.net/{id}_sm.avif`.
3. Results are deduplicated by Frame Set ID and image URL before rendering.
4. Clicking the download icon queues one import per frame ID.
5. Eagle first receives the public image URL through `eagle.item.addFromURL`. If that fails, the plugin fetches the image in the renderer, converts it to a data URL, and retries through `eagle.item.addFromBase64`.
6. The imported item stores the Frame Set collection URL as `website`, a concise annotation with title/brand/type, and optional source/search tags.

## Error handling

- Reject malformed or non-HTTPS Frame Set image URLs.
- Convert non-2xx search responses into readable status messages.
- Reject missing/invalid Frame Set IDs and malformed API records.
- Apply a 20 MiB limit to renderer-fetched fallback images.
- Keep failed cards retryable and prevent duplicate queue entries for the same frame.
- Continue rendering successful results if some image URLs fail.

## Testing

- Bridge tests cover URL construction, still-frame normalization, motion filtering, pagination, and malformed records.
- Importer tests cover selected-folder targeting, metadata construction, URL import, and base64 fallback.
- Queue/view tests cover duplicate protection and terminal button states.
- Run plugin unit tests, lint, TypeScript checking, diff checks, deterministic packaging, and a live Eagle install/search/import smoke test.

## Scope decisions

- The first version does not include image search, filters, account login, project/sets management, or motion/video downloading.
- The plugin name is **Frame Set Search Importer**.
- The layout intentionally favors wide 16:9 cards instead of the masonry layout used by portrait-heavy sources.

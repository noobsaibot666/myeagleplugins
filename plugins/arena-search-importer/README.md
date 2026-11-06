# Are.na Search Importer

Native Eagle keyword search for public Are.na image blocks. Search results are
rendered in an Eagle-native masonry grid; hover an image and click the centered
download control to save it directly into the current Eagle library or folder.

On Are.na most meaningful images live in curated **channels**, while the
individual blocks are often titled only by a filename. Searching blocks alone
therefore misses most relevant content and surfaces fuzzy text matches. Each
search now:

1. queries Are.na's block search and channel search in parallel,
2. keeps image blocks whose title/description matches every search term
   (with light stemming, so "chairs" matches "chair"),
3. ranks matching channels by title match and size, and pages through the
   best ones round-robin, mixing their images into the results,
4. drops duplicates (the same block connected to several channels) and
   filename-only titles, labelling each card with its channel instead.

Matched channels appear as chips above the results; click one to browse only
that channel. When nothing matches every term of a multi-word query, the plugin
falls back to channels for the most specific single term and says so. Link,
video and web-page preview blocks are excluded by default (Settings → *Include
link & video previews*). Results are shown in a stable masonry grid and the
next page is prefetched before you reach the bottom.

Each import keeps the Are.na block URL as its source website, records the
channel in the annotation, and can add `Are.na`, the search phrase, and the
channel title as tags. The original image file is imported.

Are.na API access and availability can change. The plugin does not store Are.na
credentials or require a login for public search results. Save only content you
have permission to use.

## Development

```bash
node --test plugins/arena-search-importer/tests/*.test.js
npx eslint plugins/arena-search-importer
npx tsc --noEmit -p plugins/arena-search-importer
python3 scripts/package-arena-search-importer.py
```

# Are.na Search Importer

Native Eagle keyword search for public Are.na image blocks. Search results are
rendered in an Eagle-native masonry grid; hover an image and click the centered
download control to save it directly into the current Eagle library or folder.

The plugin uses Are.na's public v2 search endpoint and filters results to image
blocks. Results paginate automatically as you scroll near the bottom of the
Eagle canvas. Each
import keeps the Are.na block URL as its source website and can add `Are.na` and
the search phrase as tags.

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

# Frame Set Search Importer

Native Eagle importer for searching public Frame Set still-frame references and saving them directly to the selected Eagle folder.

## Features

- Frame Set keyword search through the public search endpoint.
- Native Eagle-style dark UI with a 16:9-first results grid.
- Infinite loading as the results panel approaches the bottom.
- Image-only cards with a minimal download action on hover or keyboard focus.
- Imports with Frame Set source URL, dimensions, brand, and tags.
- Saves to the folder selected when each download is started.

The first version intentionally imports still frames only; motion results are filtered out.

## Verification

From the repository root:

```bash
npm --prefix plugins/frameset-search-importer test
npx eslint plugins/frameset-search-importer --no-warn-ignored
npx tsc --noEmit -p plugins/frameset-search-importer
python3 scripts/package-frameset-search-importer.py
```

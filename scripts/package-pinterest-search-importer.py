#!/usr/bin/env python3
"""Build and validate a reproducible, allowlisted Eagle plugin release zip."""

import argparse
import hashlib
import io
import json
from pathlib import Path
import zipfile


ROOT = Path(__file__).resolve().parent.parent
PLUGIN = ROOT / "plugins" / "pinterest-search-importer"
# Explicit files, never a directory walk: new files require release review.
RUNTIME_FILES = (
    "manifest.json",
    "index.html",
    "css/style.css",
    "js/eagle-importer.js",
    "js/import-queue.js",
    "js/native-results.js",
    "js/native-results-view.js",
    "js/pinterest-api.js",
    "js/pinterest-bridge.js",
    "js/plugin.js",
    "js/settings.js",
    "js/session-state.js",
    "js/webview-preload.js",
    "plugin.png",
)


def main():
    manifest = json.loads((PLUGIN / "manifest.json").read_text(encoding="utf-8"))
    package = json.loads((PLUGIN / "package.json").read_text(encoding="utf-8"))
    if manifest["version"] != package["version"]:
        raise ValueError("Manifest and package versions must match")
    if manifest["main"]["url"] != "index.html" or manifest["logo"] != "plugin.png":
        raise ValueError("Manifest entry point and icon must be packaged assets")

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--output", type=Path,
        default=ROOT / "dist" / f"pinterest-search-importer-{package['version']}.zip",
    )
    destination = parser.parse_args().output
    assets = {}
    for name in RUNTIME_FILES:
        source = PLUGIN / name
        if source.is_symlink() or not source.resolve().is_relative_to(PLUGIN):
            raise ValueError(f"Runtime asset must be a plugin-local file: {name}")
        assets[name] = source.read_bytes()
    # Ship plugin identity only; development scripts/dependencies are unnecessary.
    assets["package.json"] = (
        json.dumps({key: package[key] for key in ("name", "private", "version")},
                   indent=2) + "\n"
    ).encode("utf-8")

    archive = io.BytesIO()
    with zipfile.ZipFile(archive, "w", compression=zipfile.ZIP_STORED) as release:
        for name in sorted(assets):
            info = zipfile.ZipInfo(name, date_time=(1980, 1, 1, 0, 0, 0))
            info.create_system = 3
            info.external_attr = 0o100644 << 16
            release.writestr(info, assets[name])
    archive.seek(0)
    with zipfile.ZipFile(archive) as release:
        if release.namelist() != sorted(assets) or release.testzip() is not None:
            raise ValueError("Release archive failed entry/CRC validation")
    payload = archive.getvalue()
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_bytes(payload)
    print(f"Validated {len(assets)} files: {destination}")
    print(f"SHA-256: {hashlib.sha256(payload).hexdigest()}")


if __name__ == "__main__":
    main()

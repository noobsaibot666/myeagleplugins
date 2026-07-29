#!/usr/bin/env node
// Scaffolds a new Eagle window plugin under plugins/<folder> from _template/.
// Usage: node scripts/new-plugin.js <folder-name> "Display Name" [id]

const fs = require("fs");
const path = require("path");

const [, , folderArg, nameArg, idArg] = process.argv;

if (!folderArg) {
  console.error(
    'Usage: node scripts/new-plugin.js <folder-name> "Display Name" [reverse-domain-id]'
  );
  process.exit(1);
}

const root = path.resolve(__dirname, "..");
const src = path.join(root, "_template");
const dest = path.join(root, "plugins", folderArg);
const displayName = nameArg || folderArg;
const id = idArg || `cool.eagle.local.${folderArg.replace(/[^a-z0-9-]/gi, "-").toLowerCase()}`;

if (fs.existsSync(dest)) {
  console.error(`Plugin folder already exists: ${dest}`);
  process.exit(1);
}

function copyDir(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const s = path.join(from, entry.name);
    const d = path.join(to, entry.name);
    if (entry.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

copyDir(src, dest);

const manifestPath = path.join(dest, "manifest.json");
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
manifest.id = id;
manifest.name = displayName;
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");

const pkgPath = path.join(dest, "package.json");
const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
pkg.name = folderArg;
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");

const htmlPath = path.join(dest, "index.html");
fs.writeFileSync(htmlPath, fs.readFileSync(htmlPath, "utf8").replace(/Plugin Name/g, displayName));

console.log(`Created plugin at plugins/${folderArg}`);
console.log(`  id:   ${id}`);
console.log(`  name: ${displayName}`);
console.log("Next: add a 128x128 logo.png, then create it in Eagle via Plugin > Developer Options > Create Plugin (Window), pointing at this folder, or load it directly if your Eagle version supports 'Import' from folder.");

# Eagle Plugins Workspace

Local dev environment for building [Eagle](https://eagle.cool) plugins. Docs: https://developer.eagle.cool/plugin-api

## Layout

```
_eagle/
├── plugins/               # every plugin lives here, one folder per plugin
├── _template/              # scaffold copied for each new plugin (window type)
├── types/eagle-plugin-api.d.ts  # ambient types for the global `eagle` object
├── tsconfig.base.json      # shared JS type-checking config (checkJs, no build/emit)
├── scripts/new-plugin.js   # scaffolds a new plugin from _template/
└── package.json            # root dev tooling only (eslint, prettier, typescript) — not loaded by Eagle
```

Each plugin folder is self-contained (manifest.json, index.html, js/, its own package.json) because
Eagle loads a plugin directly from its folder and resolves `require()` against that folder's own
`node_modules` — there is no shared bundling/hoisting across plugins.

## Creating a new plugin

```bash
node scripts/new-plugin.js <folder-name> "Display Name"
```

This copies `_template/` into `plugins/<folder-name>/`, fills in `manifest.json` (id/name), and
prints next steps. Then:

1. Add a 128×128 `logo.png` to the plugin folder.
2. In Eagle: **Plugin panel → Developer Options → Create Plugin** (or **Import** an existing
   folder, depending on your Eagle version) and point it at `plugins/<folder-name>`.
3. Edit `js/plugin.js` / `index.html`. Press **F12** inside the running plugin window for DevTools.
4. Use `eagle.log.*` for logging in contexts without DevTools (background service / preview
   plugins).

The template only covers **Window** plugins (the common case: one-click tools, importers,
exporters). For **Background Service**, **Format Extension (preview)**, or **Inspector** plugins,
the manifest shape differs — see:
- https://developer.eagle.cool/plugin-api/get-started/plugin-types/service
- https://developer.eagle.cool/plugin-api/get-started/plugin-types/preview
- https://developer.eagle.cool/plugin-api/get-started/plugin-types/inspector

## Types / editor support

`types/eagle-plugin-api.d.ts` is a hand-built ambient declaration for the global `eagle` object
(no official `.d.ts` is published by Eagle). Each plugin's `jsconfig.json` extends
`tsconfig.base.json` and includes this file, so plain JS gets autocomplete + type checking in
VS Code with no build step — Eagle still loads the plain `.js` files directly.

Run `npx tsc --noEmit -p plugins/<folder-name>` to type-check a plugin from the CLI.

## Third-party npm modules inside a plugin

```bash
cd plugins/<folder-name>
npm install <package>
```

Then `require('<package>')` from `js/plugin.js` — works like Node's native modules. Eagle's
plugin runtime is Chromium 107 + Node 16, CommonJS only (no native modules in the browser context).

## Local Eagle API (separate from the Plugin API)

This machine also has the `eagle-skill` Claude Code skill installed
(`~/.claude/skills/eagle-skill`), which talks to Eagle's **local HTTP API** (port 41596) for
external scripting/automation — separate from the in-app Plugin API. Useful for driving Eagle from
this workspace while iterating (e.g. seeding test items/folders/tags) without writing plugin code:

```bash
node ~/.claude/skills/eagle-skill/scripts/eagle-api-cli.js call get_app_info
```

## Linting / formatting

```bash
npm run lint     # eslint plugins/
npm run format    # prettier --write plugins/
```

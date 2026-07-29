/**
 * @fileoverview
 * UNOFFICIAL, hand-derived TypeScript ambient declarations for the Eagle
 * (eagle.cool) Plugin API.
 *
 * Eagle plugins are plain JS/HTML apps loaded into a Chromium + Node16
 * runtime inside the Eagle app. Eagle injects a global `eagle` object into
 * every plugin window/service giving access to namespaces such as
 * eagle.app, eagle.item, eagle.folder, eagle.tag, eagle.tagGroup,
 * eagle.smartFolder, eagle.library, eagle.window, eagle.os, eagle.screen,
 * eagle.notification, eagle.contextMenu, eagle.dialog, eagle.clipboard,
 * eagle.drag, eagle.shell, eagle.log, and plugin lifecycle event
 * registration methods (onPluginCreate, onPluginRun, onPluginShow,
 * onPluginHide, onPluginBeforeExit, onLibraryChanged, onThemeChanged).
 *
 * These declarations were transcribed by hand from the official docs at:
 *   https://developer.eagle.cool/plugin-api
 * (every page fetched via its `.md` clean-markdown variant, e.g.
 *   https://developer.eagle.cool/plugin-api/api/item.md)
 *
 * This is NOT an official Eagle/onetool product and is NOT guaranteed to be
 * complete, exhaustive, or perfectly accurate. Several fields/return shapes
 * are only loosely documented upstream (Electron passthrough types like
 * NativeImage, Display, Rectangle; free-form Object payloads for comments,
 * palettes, smart-folder conditions, etc). Those are typed as `any` or as
 * best-effort partial interfaces with `// TODO:` notes rather than guessed.
 *
 * This file is meant to be referenced from a jsconfig.json (`checkJs: true`)
 * with no build step, so it is written as a pure global ambient declaration
 * (no top-level `import`/`export`) — just include it in your `include`/
 * `files` globs (or use a `<reference path="..." />` comment) and plain .js
 * plugin files will pick up `eagle` as a global with autocomplete.
 *
 * Extend this file as you discover more of the API surface; PRs/edits
 * welcome against your own copy.
 */

// ============================================================================
// Shared / cross-cutting primitive-ish helper types
// ============================================================================

/**
 * Electron NativeImage passthrough type. Eagle's plugin API returns/accepts
 * Electron NativeImage instances for icons/thumbnails/screenshots in several
 * places (eagle.app.getFileIcon, eagle.app.createThumbnailFromPath,
 * eagle.window.capturePage, eagle.clipboard.writeImage/readImage).
 * TODO: Not re-declared here since Eagle docs just link to Electron's
 * NativeImage docs (https://www.electronjs.org/docs/latest/api/native-image)
 * without restating its full method surface; typed as `any` to avoid
 * fabricating a shape. If you have Electron's types available, you can
 * replace this with `Electron.NativeImage`.
 */
type EagleNativeImage = any;

/**
 * Node.js Buffer passthrough type, used by eagle.clipboard's raw buffer
 * read/write methods (the Eagle plugin runtime embeds Node16). Resolves to
 * the real `Buffer` type if `@types/node` is installed in the consuming
 * project, and falls back to `any` otherwise so this file has no hard
 * dependency on `@types/node` being present.
 */
type EagleNodeBuffer = typeof globalThis extends { Buffer: infer B }
  ? B extends { prototype: infer P }
    ? P
    : any
  : any;

/** Electron Display passthrough type (see eagle.screen). */
// TODO: Eagle docs just link to Electron's Display structure
// (https://www.electronjs.org/docs/latest/api/structures/display) without
// restating its fields; typed as `any` to avoid fabricating a shape.
type EagleDisplay = any;

/** A simple x/y/width/height rectangle, as used by eagle.window bounds APIs. */
interface EagleRectangle {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** A simple x/y point, as returned by eagle.screen.getCursorScreenPoint(). */
interface EaglePoint {
  x: number;
  y: number;
}

/** One of Eagle's built-in application color themes. */
type EagleThemeName =
  | "Auto"
  | "LIGHT"
  | "LIGHTGRAY"
  | "GRAY"
  | "DARK"
  | "BLUE"
  | "PURPLE";

/** Icon color constants shared by Folder / SmartFolder icon coloring APIs. */
type EagleIconColorName =
  | "red"
  | "orange"
  | "yellow"
  | "green"
  | "aqua"
  | "blue"
  | "purple"
  | "pink";

// ============================================================================
// eagle.item
// ============================================================================

/**
 * A single comment attached to an Item (image-rect or video-timestamp
 * comment). Requires Eagle 4.0 build22+.
 * TODO: Docs only show the write-side fields accepted by addComment/
 * updateComment; the exact shape of comment objects returned by the
 * `item.comments` read-only property (e.g. whether it includes an `id` or
 * timestamps) is not fully documented.
 */
interface EagleItemComment {
  /** Comment text content. */
  annotation?: string;
  /** X offset, for image-rect comments. */
  x?: number;
  /** Y offset, for image-rect comments. */
  y?: number;
  /** Width, for image-rect comments. */
  width?: number;
  /** Height, for image-rect comments. */
  height?: number;
  /** Timestamp (seconds), for video-timestamp comments. */
  duration?: number;
  /** TODO: unknown/undocumented additional fields may be present. */
  [key: string]: any;
}

/**
 * Query/filter options accepted by eagle.item.get()/eagle.item.count().
 * TODO: Eagle's docs describe these as a loosely-typed filter object; exact
 * value shapes for `tags`, `folders`, `shape`, and `fields` are not spelled
 * out beyond examples, so several fields are left broad.
 */
interface EagleItemQueryOptions {
  id?: string;
  ids?: string[];
  isSelected?: boolean;
  isUntagged?: boolean;
  isUnfiled?: boolean;
  keywords?: string[] | string;
  tags?: string[];
  folders?: string[];
  ext?: string;
  annotation?: string;
  rating?: number;
  url?: string;
  /** TODO: undocumented exact shape (image dimension/shape filter). */
  shape?: any;
  /** Restrict which fields are returned, for perf. */
  fields?: string[];
}

interface EagleItemAddOptions {
  name?: string;
  website?: string;
  tags?: string[];
  folders?: string[];
  annotation?: string;
  /** TODO: only documented on addBookmark(); base64 thumbnail override. */
  base64?: string;
}

interface EagleItemOpenOptions {
  /** Open the item in a new window instead of the main window. */
  window?: boolean;
}

/**
 * An Eagle library Item (image/file) instance, as returned by
 * eagle.item.get()/getAll()/getById()/getSelected() etc.
 */
interface EagleItemObject {
  /** Unique file identifier. Read-only. */
  readonly id: string;
  /** File name (without extension). */
  name: string;
  /** File extension. Read-only. */
  readonly ext: string;
  /** Image width in pixels. */
  width: number;
  /** Image height in pixels. */
  height: number;
  /** Source URL/link the item was imported from. */
  url: string;
  /** File annotation/description. */
  annotation: string;
  /** Array of tag name strings. */
  tags: string[];
  /** Array of folder ID strings the item belongs to. */
  folders: string[];
  /** Star rating from 0 to 5. */
  star: number;
  /** File size in bytes. Read-only. */
  readonly size: number;
  /** Import timestamp (ms). Requires Eagle 4.0 build18+. */
  importedAt: number;
  /** Last modification timestamp (ms). Read-only. */
  readonly modifiedAt: number;
  /** Whether the file is currently in the trash. Read-only. */
  readonly isDeleted: boolean;
  /** Whether the file lacks a generated thumbnail. Read-only. */
  readonly noThumbnail: boolean;
  /** Whether the file type is unsupported for preview. Read-only. */
  readonly noPreview: boolean;
  /** Color palette analysis data. Read-only. */
  // TODO: exact per-entry shape (color, ratio, etc.) not documented.
  readonly palettes: any[];
  /** Comments attached to the item. Requires Eagle 4.0 build22+. Read-only. */
  readonly comments: EagleItemComment[];
  /** Local file system path. Read-only. */
  readonly filePath: string;
  /** File URL with `file:///` protocol. Read-only. */
  readonly fileURL: string;
  /** Local thumbnail file path. Read-only. */
  readonly thumbnailPath: string;
  /** Thumbnail URL, suitable for use directly in HTML `<img>` src. Read-only. */
  readonly thumbnailURL: string;
  /** Path to this item's `metadata.json` file. Read-only. */
  readonly metadataFilePath: string;

  /** Persists all property modifications made on this instance to storage. */
  save(): Promise<boolean>;
  /** Moves this file to the trash. */
  moveToTrash(): Promise<boolean>;
  /** Replaces the underlying file content; auto-refreshes the thumbnail. */
  replaceFile(filePath: string): Promise<boolean>;
  /** Regenerates the thumbnail and derived metadata (size/colors/dimensions). */
  refreshThumbnail(): Promise<boolean>;
  /** Sets a custom thumbnail image for this item. */
  setCustomThumbnail(thumbnailPath: string): Promise<boolean>;
  /**
   * Adds an image-rect or video-timestamp comment to this item.
   * Requires Eagle 4.0 build22+.
   */
  addComment(commentData: EagleItemComment): Promise<EagleItemComment>;
  /**
   * Updates an existing comment's fields. Requires Eagle 4.0 build22+.
   */
  updateComment(
    commentId: string,
    updateData: Partial<EagleItemComment>
  ): Promise<EagleItemComment>;
  /** Deletes a comment by ID. Requires Eagle 4.0 build22+. */
  removeComment(commentId: string): Promise<boolean>;
  /** Displays this file in the full list; optionally opens it in a new window. */
  open(options?: EagleItemOpenOptions): Promise<void>;
  /** Selects only this file, clearing any other current selection. */
  select(): Promise<boolean>;
}

interface EagleIdWithModifiedAt {
  id: string;
  modifiedAt: number;
}

interface EagleItemModule {
  /** Universal search: retrieves files matching the specified conditions. */
  get(options: EagleItemQueryOptions): Promise<EagleItemObject[]>;
  /** Retrieves all files in the current library. */
  getAll(): Promise<EagleItemObject[]>;
  /** Fetches a single file by its ID. */
  getById(itemId: string): Promise<EagleItemObject>;
  /** Fetches multiple files by their IDs. */
  getByIds(itemIds: string[]): Promise<EagleItemObject[]>;
  /** Returns the currently selected files in the application. */
  getSelected(): Promise<EagleItemObject[]>;
  /** Returns `{id, modifiedAt}` pairs for all files (cheap sync helper). */
  getIdsWithModifiedAt(): Promise<EagleIdWithModifiedAt[]>;
  /** Counts files matching the specified query conditions. */
  count(options: EagleItemQueryOptions): Promise<number>;
  /** Returns the total file count in the library. */
  countAll(): Promise<number>;
  /** Returns the number of currently selected files. */
  countSelected(): Promise<number>;
  /** Selects the specified files, replacing the current selection. */
  select(itemIds: string[]): Promise<boolean>;
  /** Adds an image from a URL (http/https/base64 supported); returns the new item ID. */
  addFromURL(url: string, options?: EagleItemAddOptions): Promise<string>;
  /** Adds a base64-encoded image; returns the new item ID. */
  addFromBase64(
    base64: string,
    options?: EagleItemAddOptions
  ): Promise<string>;
  /** Adds a local file by path; returns the new item ID. */
  addFromPath(path: string, options?: EagleItemAddOptions): Promise<string>;
  /** Adds a bookmark link, optionally with a custom thumbnail; returns the new item ID. */
  addBookmark(url: string, options?: EagleItemAddOptions): Promise<string>;
  /** Displays a file in the full list; optionally opens it in a new window. */
  open(itemId: string, options?: EagleItemOpenOptions): Promise<boolean>;
}

// ============================================================================
// eagle.folder
// ============================================================================

interface EagleFolderCreateOptions {
  name: string;
  description?: string;
  parent?: string;
}

interface EagleFolderQueryOptions {
  id?: string;
  ids?: string[];
  isSelected?: boolean;
  isRecent?: boolean;
}

interface EagleFolderObject {
  /** Unique folder identifier. Read-only. */
  readonly id: string;
  /** Folder display name. */
  name: string;
  /** Folder description/introduction text. */
  description: string;
  /** Folder icon identifier. Read-only. */
  readonly icon: string;
  /** Folder icon color. Modifiable since Eagle 4.0 build12. */
  iconColor: string;
  /** Creation timestamp. Read-only. */
  readonly createdAt: number;
  /** Parent folder ID. Modifiable since Eagle 4.0 build12. */
  parent: string;
  /** Child (sub-)folders. Read-only. */
  readonly children: EagleFolderObject[];

  /** Persists all modifications made on this folder instance. */
  save(): Promise<void>;
  /** Opens this folder in the application. */
  open(): Promise<void>;
}

interface EagleFolderModule {
  /** Creates a new folder, optionally under a parent folder. */
  create(options: EagleFolderCreateOptions): Promise<EagleFolderObject>;
  /** Creates a subfolder under the specified parent folder ID. */
  createSubfolder(
    parentId: string,
    options: { name: string; description?: string }
  ): Promise<EagleFolderObject>;
  /** Retrieves folders matching the specified query conditions. */
  get(options: EagleFolderQueryOptions): Promise<EagleFolderObject[]>;
  /** Retrieves all folders in the library. */
  getAll(): Promise<EagleFolderObject[]>;
  /** Retrieves a single folder by ID. */
  getById(folderId: string): Promise<EagleFolderObject>;
  /** Retrieves multiple folders by an array of IDs. */
  getByIds(folderIds: string[]): Promise<EagleFolderObject[]>;
  /** Retrieves the currently selected folders. */
  getSelected(): Promise<EagleFolderObject[]>;
  /** Retrieves recently accessed folders. */
  getRecents(): Promise<EagleFolderObject[]>;
  /** Opens the specified folder in the application. */
  open(folderId: string): Promise<void>;
  /** Eight named icon color constants (Red, Orange, Yellow, Green, Aqua, Blue, Purple, Pink). */
  IconColor: {
    Red: string;
    Orange: string;
    Yellow: string;
    Green: string;
    Aqua: string;
    Blue: string;
    Purple: string;
    Pink: string;
  };
}

// ============================================================================
// eagle.tag
// ============================================================================

interface EagleTagQueryOptions {
  /** Fuzzy, case-insensitive name filter. */
  name?: string;
}

interface EagleTagMergeOptions {
  /** Source tag name to be merged away. */
  source: string;
  /** Target tag name that absorbs the source tag's items. */
  target: string;
}

interface EagleTagMergeResult {
  affectedItems: number;
  sourceRemoved: boolean;
}

interface EagleTagObject {
  /** Tag name (writable — renames the tag). */
  name: string;
  /** Number of files using this tag. Read-only. */
  readonly count: number;
  /** Visual tag color. Read-only. */
  readonly color: string;
  /** Tag group memberships. Read-only. */
  readonly groups: string[];
  /** Phonetic search/sort key. Read-only. */
  readonly pinyin: string;

  /** Persists tag modifications (currently name changes only). */
  save(): Promise<boolean>;
}

interface EagleTagModule {
  /** Retrieves tags, with optional fuzzy name filtering. */
  get(options?: EagleTagQueryOptions): Promise<EagleTagObject[]>;
  /** Fetches the most recently used tags. */
  getRecentTags(): Promise<EagleTagObject[]>;
  /** Obtains the user's favorited/starred tags. Requires Eagle 4.0 build18+. */
  getStarredTags(): Promise<EagleTagObject[]>;
  /** Consolidates tags by renaming `source` into `target` across all items. */
  merge(options: EagleTagMergeOptions): Promise<EagleTagMergeResult>;
}

// ============================================================================
// eagle.tagGroup
// ============================================================================

interface EagleTagGroupCreateOptions {
  name: string;
  color?: EagleIconColorName | string;
  tags?: string[];
  /** Requires Eagle 4.0 build18+. */
  description?: string;
}

interface EagleTagGroupAddTagsOptions {
  tags: string[];
  /** Whether tags are moved out of their source group (true) or duplicated (false). */
  removeFromSource?: boolean;
}

interface EagleTagGroupRemoveTagsOptions {
  tags: string[];
}

/**
 * A tag group object.
 * TODO: Docs do not explicitly confirm an `id` field exists on TagGroup
 * instances (only implied by object structure); included as optional.
 */
interface EagleTagGroupObject {
  /** TODO: presence/read-write-ness not explicitly confirmed by docs. */
  id?: string;
  /** Group display name. */
  name: string;
  /** One of the eight named icon colors. */
  color: EagleIconColorName | string;
  /** Tag names belonging to this group. */
  tags: string[];
  /** Optional description. Requires Eagle 4.0 build18+. */
  description?: string;

  /** Saves changes to the tag group. */
  save(): Promise<EagleTagGroupObject>;
  /** Removes the tag group. */
  remove(): Promise<boolean>;
  /** Adds tags to the group incrementally. */
  addTags(options: EagleTagGroupAddTagsOptions): Promise<EagleTagGroupObject>;
  /** Removes the specified tags from the group. */
  removeTags(options: EagleTagGroupRemoveTagsOptions): Promise<EagleTagGroupObject>;
}

interface EagleTagGroupModule {
  /** Retrieves all tag groups. */
  get(): Promise<EagleTagGroupObject[]>;
  /** Creates a new tag group. */
  create(options: EagleTagGroupCreateOptions): Promise<EagleTagGroupObject>;
}

// ============================================================================
// eagle.smartFolder
// ============================================================================

/**
 * A single smart-folder filter rule.
 * TODO: `SmartFolder.Rule`/`SmartFolder.Condition` shapes are only loosely
 * documented ("individual filter rule definition" / "group of rules with a
 * logic operator and boolean mode"); the exact property names beyond what's
 * shown here are not confirmed, so extra properties are allowed via index
 * signature.
 */
interface EagleSmartFolderRule {
  /** Property being filtered on, e.g. via `smartFolder.rule(property)`. */
  property?: string;
  [key: string]: any;
}

interface EagleSmartFolderCondition {
  /** "AND" | "OR" logic operator combining the rules. */
  match?: "AND" | "OR" | string;
  /** TRUE = include matches, FALSE = exclude matches. */
  boolean?: boolean;
  rules?: EagleSmartFolderRule[];
  [key: string]: any;
}

interface EagleSmartFolderCreateOptions {
  name: string;
  conditions: EagleSmartFolderCondition[];
  description?: string;
  iconColor?: EagleIconColorName | string;
  parent?: string;
}

interface EagleSmartFolderQueryOptions {
  id?: string;
  ids?: string[];
}

interface EagleSmartFolderGetItemsOptions {
  orderBy?: string;
  fields?: string[];
}

interface EagleSmartFolderObject {
  /** Smart folder identifier. Read-only. */
  readonly id: string;
  /** Display name of the folder. */
  name: string;
  /** Filter conditions array. */
  conditions: EagleSmartFolderCondition[];
  /** Descriptive text. */
  description: string;
  /** Icon identifier. Read-only. */
  readonly icon: string;
  /** Icon color designation. */
  iconColor: EagleIconColorName | string;
  /** Last update timestamp. Read-only. */
  readonly modificationTime: number;
  /** Nested smart folders. Read-only. */
  readonly children: EagleSmartFolderObject[];
  /** Parent folder identifier. Read-only. */
  readonly parent: string;
  /** Number of items matching the conditions. Read-only. */
  readonly imageCount: number;

  /** Persists all property modifications made on this instance. */
  save(): Promise<EagleSmartFolderObject>;
  /** Gets items matching this smart folder's filter conditions. */
  getItems(options?: EagleSmartFolderGetItemsOptions): Promise<any[]>;
}

interface EagleSmartFolderModule {
  /** Creates a new smart folder. */
  create(options: EagleSmartFolderCreateOptions): Promise<EagleSmartFolderObject>;
  /** Queries smart folders by ID criteria. */
  get(options: EagleSmartFolderQueryOptions): Promise<EagleSmartFolderObject[]>;
  /** Retrieves every smart folder. */
  getAll(): Promise<EagleSmartFolderObject[]>;
  /** Fetches a smart folder by a single identifier. */
  getById(smartFolderId: string): Promise<EagleSmartFolderObject>;
  /** Fetches smart folders matching an ID array. */
  getByIds(smartFolderIds: string[]): Promise<EagleSmartFolderObject[]>;
  /** Deletes the specified smart folder. */
  remove(smartFolderId: string): Promise<boolean>;
  /** Gets the available filter rule schema. */
  getRules(): Promise<any>;
  /** Fluent builder for constructing a single filter rule on a property. */
  rule(property: string): any;
  /** Eight named icon color constants. */
  IconColor: {
    Red: string;
    Orange: string;
    Yellow: string;
    Green: string;
    Aqua: string;
    Blue: string;
    Purple: string;
    Pink: string;
  };
}

// ============================================================================
// eagle.library
// ============================================================================

interface EagleLibraryModule {
  /** Name of the current library. Read-only. */
  readonly name: string;
  /** Filesystem path where the current library is located. Read-only. */
  readonly path: string;
  /** Last modification timestamp of the library (ms). Read-only. */
  readonly modificationTime: number;
  /**
   * Gets detailed information about the current library, including
   * folders, smart folders, tag groups, etc.
   */
  // TODO: exact shape of the resolved info object is not spelled out in the
  // docs beyond "folders, smart folders, tag groups, etc."; typed as `any`.
  info(): Promise<any>;
}

// ============================================================================
// eagle.window
// ============================================================================

interface EagleWindowModule {
  /** Shows and focuses the plugin window. */
  show(): Promise<void>;
  /** Shows the plugin window without focusing it. */
  showInactive(): Promise<void>;
  /** Hides the plugin window. */
  hide(): Promise<void>;
  /** Gives the plugin window focus. */
  focus(): Promise<void>;
  /** Minimizes the plugin window. */
  minimize(): Promise<void>;
  /** Determines whether the window is currently minimized. */
  isMinimized(): Promise<boolean>;
  /** Restores the plugin window from a minimized state. */
  restore(): Promise<void>;
  /** Enlarges (maximizes) the window; shows it if not yet shown. */
  maximize(): Promise<void>;
  /** Un-maximizes the plugin window. */
  unmaximize(): Promise<void>;
  /** Determines whether the window is currently maximized. */
  isMaximized(): Promise<boolean>;
  /** Toggles fullscreen display mode. */
  setFullScreen(flag: boolean): Promise<void>;
  /** Determines whether the window is currently in fullscreen. */
  isFullScreen(): Promise<boolean>;
  /** Makes the window maintain the given aspect ratio. */
  setAspectRatio(aspectRatio: number): Promise<void>;
  /** Applies a background color to the window via a hex color string. */
  setBackgroundColor(backgroundColor: string): Promise<void>;
  /** Sets the window size. */
  setSize(width: number, height: number): Promise<void>;
  /** Gets the window size as `[width, height]`. */
  getSize(): Promise<[number, number]>;
  /** Adjusts the window's dimensions and repositions it. */
  setBounds(bounds: EagleRectangle): Promise<void>;
  /** Returns the window's current bounds. */
  getBounds(): Promise<EagleRectangle>;
  /** Controls whether the window can be resized by the user. */
  setResizable(resizable: boolean): Promise<void>;
  /** Checks whether resizing is currently enabled. */
  isResizable(): Promise<boolean>;
  /** Keeps the window layered above other windows. */
  setAlwaysOnTop(flag: boolean): Promise<void>;
  /** Determines whether the window is currently always-on-top. */
  isAlwaysOnTop(): Promise<boolean>;
  /** Moves the window to the given x/y screen coordinates. */
  setPosition(x: number, y: number): Promise<void>;
  /** Returns the window's current position as `[x, y]`. */
  getPosition(): Promise<[number, number]>;
  /** Adjusts the window's transparency level (0.0–1.0). */
  setOpacity(opacity: number): Promise<void>;
  /** Returns the window's current transparency value. */
  getOpacity(): Promise<number>;
  /** Starts or stops the window's taskbar/dock attention-flash. */
  flashFrame(flag: boolean): Promise<void>;
  /** When true, passes mouse events through to windows below this one. */
  setIgnoreMouseEvents(ignore: boolean): Promise<void>;
  /** Captures a screenshot of the page, optionally within a specific rect. */
  capturePage(rect?: EagleRectangle): Promise<EagleNativeImage>;
  /** Sets the current referer URL used for outgoing requests. */
  setReferer(url: string): void;
}

// ============================================================================
// eagle.app
// ============================================================================

interface EagleFileIconOptions {
  size?: "small" | "normal" | "large" | string;
}

/** Rough size hint, e.g. for eagle.app.createThumbnailFromPath(). */
interface EagleSize {
  width: number;
  height: number;
}

interface EagleAppModule {
  /** Current Eagle application version. Read-only. */
  readonly version: string;
  /** Current Eagle application build number. Read-only. */
  readonly build: number;
  /** Current language setting, e.g. `en`, `zh_CN`, `zh_TW`, `ja_JP`, `ko_KR`, `es_ES`, `de_DE`, `ru_RU`. Read-only. */
  readonly locale: string;
  /** CPU architecture: `x64`, `arm64`, or `x86`. Read-only. */
  readonly arch: string;
  /** OS identifier: `darwin` (macOS) or `win32` (Windows). Read-only. */
  readonly platform: string;
  /** Environment variables available to the plugin process. Read-only. */
  readonly env: Record<string, string | undefined>;
  /** Current application executable path. Read-only. */
  readonly execPath: string;
  /** Current plugin process ID. Read-only. */
  readonly pid: number;
  /** Whether running on Windows. Read-only. */
  readonly isWindows: boolean;
  /** Whether running on macOS. Read-only. */
  readonly isMac: boolean;
  /** Whether running under ARM64 translation (Rosetta/WOW). Read-only. */
  readonly runningUnderARM64Translation: boolean;
  /** Current application theme name. Read-only. */
  readonly theme: EagleThemeName;
  /** Path to the current user data directory. Read-only. */
  readonly userDataPath: string;

  /** Detects whether the OS-level dark mode setting is active. */
  isDarkColors(): boolean;
  /** Retrieves well-known system paths (home, appData, temp, desktop, documents, etc). */
  getPath(name: string): Promise<string>;
  /** Retrieves the file-associated system icon for the given path. */
  getFileIcon(
    path: string,
    options?: EagleFileIconOptions
  ): Promise<EagleNativeImage>;
  /** Gets a thumbnail/icon associated with the file at the specified path. */
  createThumbnailFromPath(
    path: string,
    maxSize: EagleSize
  ): Promise<EagleNativeImage>;
  /** Brings the Eagle application window to the foreground. */
  show(): Promise<boolean>;
}

// ============================================================================
// eagle.os
// ============================================================================

interface EagleOsModule {
  /** Gets the OS's default temporary file path. */
  tmpdir(): string;
  /** Gets the OS kernel version string. */
  version(): string;
  /** Returns the OS identifier, e.g. `Darwin` or `Windows_NT`. */
  type(): string;
  /** Returns the OS release version string. */
  release(): string;
  /** Returns the machine hostname. */
  hostname(): string;
  /** Returns the home directory of the current user. */
  homedir(): string;
  /** Returns the CPU architecture, e.g. `x64`, `arm64`, `x86`. */
  arch(): string;
}

// ============================================================================
// eagle.screen
// ============================================================================

interface EagleScreenModule {
  /** Absolute position `{x, y}` of the current mouse cursor. */
  getCursorScreenPoint(): Promise<EaglePoint>;
  /** Returns primary display information (Electron Display object). */
  getPrimaryDisplay(): Promise<EagleDisplay>;
  /** Returns an array of all currently available displays/screens. */
  getAllDisplays(): Promise<EagleDisplay[]>;
  /** Retrieves display information for the screen nearest the given point. */
  getDisplayNearestPoint(point: EaglePoint): Promise<EagleDisplay>;
}

// ============================================================================
// eagle.notification
// ============================================================================

interface EagleNotificationShowOptions {
  /** Notification window title. */
  title: string;
  /** Notification window description/body text. */
  body: string;
  /** Notification icon, as a URL or base64 string. */
  icon?: string;
  /** Whether to suppress the notification sound effect. */
  mute?: boolean;
  /** Auto-hide duration in milliseconds. */
  duration?: number;
}

interface EagleNotificationModule {
  /** Displays a notification window. */
  show(options: EagleNotificationShowOptions): Promise<void>;
}

// ============================================================================
// eagle.contextMenu
// ============================================================================

/**
 * A context menu item, following Electron's MenuItem shape.
 * TODO: Eagle docs defer to Electron's MenuItem
 * (https://www.electronjs.org/docs/latest/api/menu-item) for the full
 * option set; only the fields shown in Eagle's own example are captured
 * here precisely, remaining Electron MenuItem options are allowed via the
 * index signature.
 */
interface EagleContextMenuItem {
  /** Unique identifier for the menu item. */
  id: string;
  /** Display text shown in the menu. */
  label: string;
  /** Callback executed when this item is selected. */
  click?: (...args: any[]) => void;
  /** Nested submenu items. */
  submenu?: EagleContextMenuItem[];
  [key: string]: any;
}

interface EagleContextMenuModule {
  /** Displays a context menu with the specified menu items. */
  open(menuItems: EagleContextMenuItem[]): void;
}

// ============================================================================
// eagle.dialog
// ============================================================================

interface EagleOpenDialogOptions {
  title?: string;
  defaultPath?: string;
  buttonLabel?: string;
  filters?: { name: string; extensions: string[] }[];
  message?: string;
  properties?: Array<
    | "openFile"
    | "openDirectory"
    | "multiSelections"
    | "showHiddenFiles"
    | "createDirectory"
    | "promptToCreate"
    | string
  >;
}

interface EagleOpenDialogResult {
  canceled: boolean;
  filePaths: string[];
}

interface EagleSaveDialogOptions {
  title?: string;
  defaultPath?: string;
  buttonLabel?: string;
  filters?: { name: string; extensions: string[] }[];
  properties?: Array<"openDirectory" | "showHiddenFiles" | "createDirectory" | string>;
}

interface EagleSaveDialogResult {
  canceled: boolean;
  filePath: string;
}

interface EagleMessageBoxOptions {
  /** Required message text. */
  message: string;
  title?: string;
  detail?: string;
  buttons?: string[];
  type?: "none" | "info" | "error" | "question" | "warning";
}

interface EagleMessageBoxResult {
  /** Index of the button clicked. */
  response: number;
}

interface EagleDialogModule {
  /** Displays the open-file dialog. */
  showOpenDialog(options: EagleOpenDialogOptions): Promise<EagleOpenDialogResult>;
  /** Displays the save-file dialog. */
  showSaveDialog(options: EagleSaveDialogOptions): Promise<EagleSaveDialogResult>;
  /** Displays a message dialog. */
  showMessageBox(options: EagleMessageBoxOptions): Promise<EagleMessageBoxResult>;
  /** Displays an error message dialog. */
  showErrorBox(title: string, content: string): Promise<void>;
}

// ============================================================================
// eagle.clipboard
// ============================================================================

interface EagleClipboardModule {
  /** Clears the clipboard content. */
  clear(): void;
  /** Determines whether the clipboard currently holds the specified format. */
  has(format: string): boolean;
  /** Writes plain text to the clipboard. */
  writeText(text: string): void;
  /** Reads plain text currently in the clipboard. */
  readText(): string;
  /**
   * Writes raw buffer data under a specified format to the clipboard.
   * TODO: Typed as `EagleNodeBuffer` (an alias to Node's `Buffer` when
   * `@types/node` is present, else `any`) so this file has no hard
   * dependency on `@types/node` being installed in the consuming project.
   */
  writeBuffer(format: string, buffer: EagleNodeBuffer): void;
  /** Reads raw buffer content of a specified format from the clipboard. */
  readBuffer(format: string): EagleNodeBuffer;
  /** Writes an image to the clipboard. */
  writeImage(image: EagleNativeImage): void;
  /** Reads image content from the clipboard. */
  readImage(): EagleNativeImage;
  /** Writes HTML markup to the clipboard. */
  writeHTML(markup: string): void;
  /** Reads HTML-formatted content from the clipboard. */
  readHTML(): string;
  /** Copies the specified files to the clipboard (paste-able in a file manager). */
  copyFiles(paths: string[]): void;
}

// ============================================================================
// eagle.drag
// ============================================================================

interface EagleDragModule {
  /**
   * Initiates a native drag operation with the specified files, showing a
   * notification/drag-image during the action (mirrors Electron's
   * webContents.startDrag).
   */
  startDrag(filePaths: string[]): Promise<void>;
}

// ============================================================================
// eagle.shell
// ============================================================================

interface EagleShellModule {
  /** Plays the system's beep sound. */
  beep(): Promise<void>;
  /** Opens the specified URL using the system's default handler. */
  openExternal(url: string): Promise<void>;
  /** Opens the specified path using the system's default handler. */
  openPath(path: string): Promise<void>;
  /** Shows the specified file or folder in the system file manager. */
  showItemInFolder(path: string): Promise<void>;
  // TODO: Eagle's own docs page did not document a `trashItem` method as of
  // this writing (unlike Electron's shell module which has one); omitted
  // rather than fabricated. Add it back if you confirm it exists.
}

// ============================================================================
// eagle.log
// ============================================================================

/** Loggable payload: a string, or any structured value the logger will serialize. */
type EagleLoggable = string | number | boolean | object | any[] | null | undefined;

interface EagleLogModule {
  /** Logs debug-level content to the application log. */
  debug(obj: EagleLoggable): void;
  /** Logs info-level content to the application log. */
  info(obj: EagleLoggable): void;
  /** Logs warn-level content to the application log. */
  warn(obj: EagleLoggable): void;
  /** Logs error-level content to the application log. */
  error(obj: EagleLoggable): void;
}

// ============================================================================
// Plugin lifecycle events (eagle.onPlugin*, eagle.on*)
// ============================================================================

/** manifest.json contents, as passed into onPluginCreate's `plugin.manifest`. */
interface EagleManifest {
  /** Plugin ID. */
  id?: string;
  /** Plugin display name. */
  name?: string;
  /** Plugin version string. */
  version?: string;
  /** Supported platform(s): `all`, `mac`, `win`. */
  platform?: "all" | "mac" | "win" | string;
  /** Supported CPU architecture(s): `all`, `arm`, `x64`. */
  arch?: "all" | "arm" | "x64" | string;
  /** Path to the plugin's logo (PNG/JPG/WebP). */
  logo?: string;
  /** Search keywords for plugin discovery. */
  keywords?: string[];
  /** Whether the developer debug window is enabled. */
  devTools?: boolean;
  /** Whether this plugin runs as a background service on app start. */
  serviceMode?: boolean;
  /** Main window entry-point configuration. */
  // TODO: `main` window-config sub-schema (url, width/height, min/max
  // width/height, alwaysOnTop, frame, fullscreenable, maximizable,
  // minimizable, resizable, backgroundColor, childWindow, followCursor,
  // multiple, runAfterInstall) is only partially documented; left as `any`.
  main?: any;
  /** manifest.json may contain additional undocumented fields. */
  [key: string]: any;
}

/** The `plugin` object passed to eagle.onPluginCreate's callback. */
interface EaglePluginInfo {
  /** The complete parsed configuration of the plugin's manifest.json. */
  manifest: EagleManifest;
  /** The filesystem path where the plugin is located. */
  path: string;
}

/**
 * The `event` object passed to eagle.onPluginBeforeExit's callback.
 * TODO: Eagle's docs show this callback used both with and without an
 * `event` parameter, and do not enumerate its properties (the documented
 * pattern for preventing exit is instead `window.onbeforeunload`); typed
 * loosely as `any`.
 */
type EaglePluginBeforeExitEvent = any;

// ============================================================================
// The global `eagle` object
// ============================================================================

/**
 * The global `eagle` object injected into every Eagle plugin's JS context.
 */
interface EagleGlobal {
  app: EagleAppModule;
  item: EagleItemModule;
  folder: EagleFolderModule;
  tag: EagleTagModule;
  tagGroup: EagleTagGroupModule;
  smartFolder: EagleSmartFolderModule;
  library: EagleLibraryModule;
  window: EagleWindowModule;
  os: EagleOsModule;
  screen: EagleScreenModule;
  notification: EagleNotificationModule;
  contextMenu: EagleContextMenuModule;
  dialog: EagleDialogModule;
  clipboard: EagleClipboardModule;
  drag: EagleDragModule;
  shell: EagleShellModule;
  log: EagleLogModule;

  /**
   * When the plugin window is created, Eagle actively calls this method.
   * Use it to initialize modules required by the plugin.
   */
  onPluginCreate(callback: (plugin: EaglePluginInfo) => void): void;
  /**
   * When the user clicks on the plugin in the plugin panel, Eagle actively
   * calls this method.
   */
  onPluginRun(callback: () => void): void;
  /** When the plugin window is displayed, Eagle actively calls this method. */
  onPluginShow(callback: () => void): void;
  /** When the plugin window is hidden, Eagle actively calls this method. */
  onPluginHide(callback: () => void): void;
  /** Before the plugin window closes, Eagle actively calls this method. */
  onPluginBeforeExit(
    callback: (event: EaglePluginBeforeExitEvent) => void
  ): void;
  /**
   * TODO: `onPluginOut` was requested/expected but is NOT present in
   * Eagle's official published API docs as of this writing (only
   * onPluginCreate, onPluginRun, onPluginShow, onPluginHide,
   * onPluginBeforeExit, onLibraryChanged, and onThemeChanged are
   * documented). Declared here as optional/untyped for forward-
   * compatibility in case it exists undocumented or is added later —
   * verify against your installed Eagle version before relying on it.
   */
  onPluginOut?(callback: (...args: any[]) => void): void;
  /** When the user switches the resource library, Eagle actively calls this method. */
  onLibraryChanged(callback: (libraryPath: string) => void): void;
  /**
   * When the main program's theme color changes, Eagle actively calls this
   * method. Useful for plugins that support multiple color themes.
   */
  onThemeChanged(callback: (theme: EagleThemeName) => void): void;
}

/**
 * The global `eagle` object available in every Eagle plugin window/service
 * JS context. See https://developer.eagle.cool/plugin-api for the official
 * (partial) reference this file was derived from.
 */
declare const eagle: EagleGlobal;

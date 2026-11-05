/* global CustomEvent */
"use strict";

// Electron is provided by Eagle; it is not bundled with this plugin.
// @ts-expect-error Electron's types are not part of the workspace dependencies.
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("eaglePinterestHost", {
  /** @param {unknown} message */
  send(message) {
    if (!message || typeof message !== "object" || Array.isArray(message))
      return;
    const envelope = /** @type {{type?: string, payload?: unknown}} */ (
      message
    );
    if (envelope.type !== "eagle-pinterest-import") return;
    ipcRenderer.sendToHost("eagle-pinterest-import", {
      type: "eagle-pinterest-import",
      payload: envelope.payload,
    });
  },
});

ipcRenderer.on("eagle-pinterest-import-status", (_event, status) => {
  window.dispatchEvent(
    new CustomEvent("eagle-pinterest-import-status", {
      detail: status,
    }),
  );
});

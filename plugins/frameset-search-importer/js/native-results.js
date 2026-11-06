"use strict";

function dedupeFrameSetResults(results) {
  const output = [];
  const seenFrames = new Set();
  const seenImages = new Set();
  for (const result of Array.isArray(results) ? results : []) {
    if (!result || typeof result !== "object") continue;
    const frameId = typeof result.frameId === "string" ? result.frameId : "";
    const imageUrl = typeof result.frameUrl === "string" ? result.frameUrl : "";
    if (!frameId || !imageUrl || seenFrames.has(frameId) || seenImages.has(imageUrl)) continue;
    seenFrames.add(frameId);
    seenImages.add(imageUrl);
    output.push(result);
  }
  return output;
}

module.exports = { dedupeFrameSetResults };

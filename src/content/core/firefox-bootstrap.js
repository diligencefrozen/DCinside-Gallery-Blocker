/*
 * firefox-bootstrap.js
 *
 * Static, tiny Firefox-only bridge. It exists in the common manifest so a
 * temporary-addon Reload cannot leave Firefox without any content entrypoint.
 * Chromium parses this file but exits immediately; Chromium keeps its V14
 * registered content-script profile unchanged.
 */
(() => {
  "use strict";
  if (!/Firefox\//i.test(navigator.userAgent || "")) return;
  if (globalThis.__DCB_FIREFOX_STATIC_BOOTSTRAP__) return;
  globalThis.__DCB_FIREFOX_STATIC_BOOTSTRAP__ = true;

  const api = typeof browser !== "undefined" ? browser : chrome;
  try {
    const task = api.runtime.sendMessage({ type: "dcb:firefox-bootstrap" });
    if (task && typeof task.catch === "function") {
      task.catch((error) => console.warn("[DCB] Firefox bootstrap failed", error));
    }
  } catch (error) {
    console.warn("[DCB] Firefox bootstrap failed", error);
  }
})();

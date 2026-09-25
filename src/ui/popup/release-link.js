(() => {
  "use strict";

  const FALLBACK_RELEASES_URL = "https://github.com/diligencefrozen/DCinside-Gallery-Blocker/releases";
  const RELEASE_PATH_PREFIX = "/diligencefrozen/DCinside-Gallery-Blocker/releases";

  function resolveReleaseUrl(candidate) {
    try {
      const url = new URL(String(candidate || "").trim());
      const path = url.pathname.replace(/\/+$/, "");
      if (url.protocol === "https:"
        && url.hostname.toLowerCase() === "github.com"
        && (path === RELEASE_PATH_PREFIX || path.startsWith(`${RELEASE_PATH_PREFIX}/`))) {
        url.hash = "";
        return url.href;
      }
    } catch (_) {}
    return FALLBACK_RELEASES_URL;
  }

  function configure(link, candidate, label) {
    if (!link) return FALLBACK_RELEASES_URL;
    const releaseUrl = resolveReleaseUrl(candidate);
    link.href = releaseUrl;
    link.dataset.releaseUrl = releaseUrl;
    link.textContent = label || "GitHub 릴리스에서 업데이트 확인 ↗";
    link.hidden = false;
    if (link.dataset.releaseLinkBound !== "true") {
      link.dataset.releaseLinkBound = "true";
      link.addEventListener("click", (event) => {
        event.preventDefault();
        const safeUrl = resolveReleaseUrl(link.dataset.releaseUrl || link.href);
        if (globalThis.chrome?.tabs?.create) {
          globalThis.chrome.tabs.create({ url: safeUrl });
          return;
        }
        globalThis.open?.(safeUrl, "_blank", "noopener,noreferrer");
      });
    }
    return releaseUrl;
  }

  globalThis.DCBPopupReleaseLink = Object.freeze({
    FALLBACK_RELEASES_URL,
    resolveReleaseUrl,
    configure
  });
})();

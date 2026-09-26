/*
 * feature-loader.js
 *
 * Firefox/Chromium common lazy feature loader.
 * The manifest only injects first-paint critical code. Optional Firefox features
 * are planned from the shared settings snapshot and injected in a handful of
 * batches. This keeps refresh work distributed without making every feature wait
 * for its own message/executeScript round trip.
 */
(() => {
  "use strict";
  if (globalThis.__DCB_FEATURE_LOADER__) return;
  globalThis.__DCB_FEATURE_LOADER__ = true;

  const api = typeof browser !== "undefined" ? browser : chrome;
  const cache = globalThis.DCBRuntimeSettingsCache;
  if (!cache) return;
  const loaded = new Set();
  let running = false;
  let rerun = false;

  const isGall = location.hostname === "gall.dcinside.com";
  const isWww = location.hostname === "www.dcinside.com";
  const isSearch = location.hostname === "search.dcinside.com";
  const isBoard = isGall && /^\/(?:mgallery\/|mini\/|person\/)?board\/(?:lists|view)/.test(location.pathname);
  const isList = isGall && /^\/(?:mgallery\/|mini\/|person\/)?board\/lists/.test(location.pathname);
  const isView = isGall && /^\/(?:mgallery\/|mini\/|person\/)?board\/view/.test(location.pathname);

  function truthy(value, fallback = false) {
    return typeof value === "boolean" ? value : fallback;
  }

  function imageFeatureEnabled(settings) {
    return settings?.dcbImageBlockConfig?.enabled === true || settings?.dcbImageAccountRules?.enabled === true;
  }

  function desired(settings) {
    const out = [];
    const add = (id, when = true, phase = "normal") => { if (when) out.push({ id, phase }); };

    // Small shared helper first. It is optional at first paint.
    add("block-stats", true, "visual");

    if (isBoard) {
      const galleryFilterOn = truthy(settings.galleryBlockEnabled, truthy(settings.enabled, true));
      const keywordCoreOn = galleryFilterOn || settings.keywordBlockEnabled === true || settings.keywordHideEnabled === true;
      const ipCoreOn = settings.showMemberIpInfo === true || settings.hideForeignIpEnabled === true || settings.hideAnonymousEnabled === true;
      add("keyword-core", keywordCoreOn, "visual");
      add("list-filter", galleryFilterOn || settings.keywordBlockEnabled === true, "visual");
      add("keyword-hider", settings.keywordHideEnabled === true, "visual");
      add("keyword-blocker", settings.keywordBlockEnabled === true, "visual");
      add("uid-badge", settings.showUidBadge === true, "visual");
      add("ip-core", ipCoreOn, "visual");
      add("member-ip", settings.showMemberIpInfo === true, "visual");
      add("user-memo", settings.userMemoEnabled === true, "normal");
      add("notice-cleaner", isList && settings.noticeBlockEnabled !== false, "normal");
      add("user-block", settings.userBlockEnabled !== false, "normal");
      add("foreign-anonymous", settings.hideForeignIpEnabled === true || settings.hideAnonymousEnabled === true, "normal");
      add("gamemeca", settings.gamemecaBlockEnabled === true, "normal");
      add("dory", settings.doryBlockEnabled === true, "normal");
      add("dccon", settings.hideDccon === true || settings.hideTextCon === true, "normal");
      add("comment-cleaner", isView && settings.hideComment === true, "normal");
      add("img-comment-cleaner", isView && settings.hideImgComment === true, "normal");
      add("auto-refresh", isList && settings.autoRefreshEnabled === true, "idle");
      add("image-tools", imageFeatureEnabled(settings), "idle");
      add("text-detector", settings?.dcbTextDetection?.enabled === true && isView, "idle");
      add("preview", settings.previewEnabled !== false, "background");
    }

    if (isGall) {
      add("quick-block", settings.userBlockEnabled !== false, "idle");
      add("ctx-probe", settings.userBlockEnabled !== false || settings.userMemoEnabled === true, "idle");
      add("dcbest-source", settings.builtinDcbestBlockEnabled !== false && (isList || isView), "idle");
    }

    add("font", settings.dcbApplyFontToDc === true, "background");
    add("link-blocker", settings.linkWarnEnabled === true, "background");
    add("area-picker", isGall || isWww || isSearch, "background");
    add("theme-bridge", isGall || isWww, "background");
    add("compact-list", isList && settings.compactListEnabled === true, "background");
    return out;
  }

  function waitFrame() {
    return new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)));
  }

  function waitIdle(timeout = 200) {
    return new Promise((resolve) => {
      if (typeof requestIdleCallback === "function") requestIdleCallback(() => resolve(), { timeout });
      else setTimeout(resolve, 24);
    });
  }

  async function waitForBatch(batch) {
    if (batch === "visual") {
      await waitFrame();
      return;
    }
    if (batch === "normal") {
      await waitFrame();
      return;
    }
    if (batch === "idle") {
      await waitIdle(140);
      return;
    }
    if (batch === "background") {
      await waitIdle(240);
      return;
    }
    // preview is intentionally isolated because content_script.js is by far the
    // heaviest optional file. Keep it away from the author-badge/filter batches.
    await waitIdle(420);
  }

  function createBatches(items) {
    const batches = { visual: [], normal: [], idle: [], background: [], preview: [] };
    for (const item of items) {
      if (!item || loaded.has(item.id)) continue;
      if (item.id === "preview") batches.preview.push(item);
      else if (item.phase === "visual") batches.visual.push(item);
      else if (item.phase === "normal") batches.normal.push(item);
      else if (item.phase === "idle") batches.idle.push(item);
      else batches.background.push(item);
    }
    return batches;
  }

  async function injectBatch(items, batch) {
    const pending = items.filter((item) => !loaded.has(item.id));
    if (!pending.length) return;
    await waitForBatch(batch);

    const features = pending.map((item) => item.id);
    const started = performance.now();
    try {
      const response = await api.runtime.sendMessage({
        type: "dcb:lazy-inject-batch",
        features
      });
      if (!response?.ok) return;
      const injected = Array.isArray(response.features) && response.features.length
        ? response.features
        : features;
      for (const id of injected) loaded.add(id);
      const elapsed = performance.now() - started;
      if (elapsed > 30) {
        console.debug(`[DCB perf] ${batch} batch (${injected.length}): ${elapsed.toFixed(1)}ms`);
      }
    } catch (error) {
      console.warn("[DCB] lazy feature batch injection failed:", batch, features, error);
    }
  }

  async function run() {
    if (running) { rerun = true; return; }
    running = true;
    try {
      do {
        rerun = false;
        const settings = await cache.get(null);
        const batches = createBatches(desired(settings));
        await injectBatch(batches.visual, "visual");
        await injectBatch(batches.normal, "normal");
        await injectBatch(batches.idle, "idle");
        await injectBatch(batches.background, "background");
        await injectBatch(batches.preview, "preview");
      } while (rerun);
    } finally {
      running = false;
    }
  }

  run();

  try {
    api.storage.onChanged.addListener((changes, area) => {
      if (area !== "sync") return;
      // Enabling a previously disabled feature injects it on the current page.
      // Loaded scripts already listen to settings changes and disable themselves.
      if (Object.keys(changes || {}).length) {
        rerun = true;
        setTimeout(run, 40);
      }
    });
  } catch (_) {}
})();

/*****************************************************************
 * dcbest-source-filter.js
 *
 * 역할:
 * - DCInside 메인/실시간 베스트 목록에서 기존 차단 키워드를 적용한다.
 * - 실베 게시글의 원출처 갤러리를 한 건씩 천천히 확인하여,
 *   사용자가 차단한 갤러리에서 올라온 실베 글을 숨긴다.
 *
 * 서버 부하 방지 원칙:
 * - 원출처 확인은 동시에 1건만 처리한다.
 * - 실제 요청 간격은 background.js에서 전역으로 제한한다.
 * - 화면 근처에 들어온 글만 확인한다.
 * - 탭이 숨겨진 동안 신규 확인을 일시 정지한다.
 * - 확인 결과는 chrome.storage.local에 캐시한다.
 *****************************************************************/

(() => {
  "use strict";

  const STYLE_ID = "dcb-dcbest-source-filter-style";
  const KEYWORD_HIDDEN_ATTR = "data-dcb-dcbest-keyword-hidden";
  const SOURCE_HIDDEN_ATTR = "data-dcb-dcbest-source-hidden";
  const POST_NO_ATTR = "data-dcb-dcbest-no";
  const FADING_ATTR = "data-dcb-dcbest-fading";
  const VISUAL_HIDDEN_ATTR = "data-dcb-dcbest-hidden";
  const FADE_MS = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ? 0 : 180;
  const CACHE_KEY = "dcbDcbestSourceCacheV1";
  const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
  const MISS_TTL_MS = 30 * 60 * 1000;
  const CACHE_MAX_ENTRIES = 800;
  const OBSERVER_MARGIN = "700px 0px";

  const DEFAULTS = {
    galleryBlockEnabled: undefined,
    enabled: true,
    blockedIds: [],
    keywordBlockEnabled: false,
    blockedKeywords: [],
    keywordBlockTargets: {
      listTitle: true,
      viewTitle: true,
      viewBody: true,
      comments: true
    }
  };

  let galleryBlockEnabled = true;
  let blockedGalleryIds = new Set();
  let keywordBlockEnabled = false;
  let keywordList = [];
  let keywordTargets = { ...DEFAULTS.keywordBlockTargets };

  let cache = Object.create(null);
  let cacheLoaded = false;
  let cacheSaveTimer = null;

  let mutationObserver = null;
  let intersectionObserver = null;
  let scanTimer = null;
  let queueRunning = false;
  const queuedNos = new Set();
  const requestQueue = [];
  const itemsByNo = new Map();
  const hideTimers = new WeakMap();

  function normalizeText(value) {
    return String(value || "")
      .normalize("NFKC")
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim();
  }

  function normalizeGalleryId(value) {
    const raw = String(value || "").trim();
    if (!raw) return "";

    if (/^id\s*=/i.test(raw)) {
      return normalizeText(raw.replace(/^id\s*=\s*/i, "").split(/[&#?\s]/)[0]);
    }

    if (/^[a-z0-9_-]+$/i.test(raw)) return raw.toLowerCase();

    try {
      const url = new URL(raw, location.href);
      const id = url.searchParams.get("id");
      return id ? id.trim().toLowerCase() : "";
    } catch (_) {
      return "";
    }
  }

  function prepareKeywords(list) {
    if (!Array.isArray(list)) return [];
    const seen = new Set();
    const out = [];

    list.forEach((raw) => {
      const label = String(raw || "").normalize("NFKC").trim();
      const needle = normalizeText(label);
      if (!label || !needle || seen.has(needle)) return;
      seen.add(needle);
      out.push({ label, needle });
    });

    return out;
  }

  function findKeyword(text) {
    const haystack = normalizeText(text);
    if (!haystack) return null;
    return keywordList.find((entry) => haystack.includes(entry.needle)) || null;
  }

  function isSupportedPage() {
    const host = location.hostname.toLowerCase();
    if (host === "www.dcinside.com") return true;
    if (host !== "gall.dcinside.com") return false;

    try {
      const url = new URL(location.href);
      return /^\/board\/lists\/?$/i.test(url.pathname)
        && normalizeText(url.searchParams.get("id")) === "dcbest";
    } catch (_) {
      return false;
    }
  }

  if (!isSupportedPage()) return;

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      [${FADING_ATTR}="1"] {
        opacity: 0 !important;
        pointer-events: none !important;
        transition: opacity ${FADE_MS}ms ease-out !important;
      }
      [${VISUAL_HIDDEN_ATTR}="1"] {
        display: none !important;
      }
    `;
    (document.head || document.documentElement).appendChild(style);
  }

  function getArticleNo(link) {
    try {
      const url = new URL(link.href, location.href);
      if (normalizeText(url.searchParams.get("id")) !== "dcbest") return "";
      const no = String(url.searchParams.get("no") || "").trim();
      return /^\d{1,12}$/.test(no) ? no : "";
    } catch (_) {
      return "";
    }
  }

  function getCandidateLinks(base = document) {
    if (!base?.querySelectorAll) return [];

    const links = Array.from(base.querySelectorAll(
      'a[href*="id=dcbest"][href*="no="]'
    ));

    return links.filter((link) => {
      if (link.classList.contains("reply_numbox")) return false;
      if (link.closest(".reply_numbox")) return false;
      return !!getArticleNo(link);
    });
  }

  function getItemForLink(link) {
    if (!(link instanceof Element)) return null;

    if (location.hostname === "gall.dcinside.com") {
      return link.closest("tr.ub-content") || link.closest("tr") || link;
    }

    const listItem = link.closest("li");
    if (listItem) return listItem;

    if (link.querySelector?.(".besttxt") || link.querySelector?.(".best_info")) {
      return link;
    }

    const parent = link.parentElement;
    if (parent) {
      const bestLinks = parent.querySelectorAll?.('a[href*="id=dcbest"][href*="no="]') || [];
      if (
        bestLinks.length === 1
        && parent.querySelector?.(".besttxt")
        && parent.querySelector?.(".best_info")
      ) {
        return parent;
      }
    }

    return link;
  }

  function getTitleText(item, link) {
    if (!(item instanceof Element)) return link?.textContent || "";

    const mainTitle = item.querySelector(".besttxt p")
      || item.querySelector(".besttxt");
    if (mainTitle?.textContent) return mainTitle.textContent;

    const listTitle = item.querySelector(".gall_tit a[view-msg]")
      || item.querySelector(".gall_tit > a[href*='id=dcbest'][href*='no=']");
    if (listTitle?.textContent) return listTitle.textContent;

    return link?.textContent || item.textContent || "";
  }

  function shouldHideItem(item) {
    return item.getAttribute(KEYWORD_HIDDEN_ATTR) === "1"
      || item.getAttribute(SOURCE_HIDDEN_ATTR) === "1";
  }

  function clearHideTimer(item) {
    const timer = hideTimers.get(item);
    if (!timer) return;
    clearTimeout(timer);
    hideTimers.delete(item);
  }

  function syncItemVisibility(item) {
    if (!(item instanceof Element)) return;

    if (!shouldHideItem(item)) {
      clearHideTimer(item);
      item.removeAttribute(FADING_ATTR);
      item.removeAttribute(VISUAL_HIDDEN_ATTR);
      return;
    }

    if (item.getAttribute(VISUAL_HIDDEN_ATTR) === "1"
      || item.getAttribute(FADING_ATTR) === "1") {
      return;
    }

    if (FADE_MS <= 0) {
      item.setAttribute(VISUAL_HIDDEN_ATTR, "1");
      return;
    }

    item.setAttribute(FADING_ATTR, "1");
    const timer = setTimeout(() => {
      hideTimers.delete(item);
      item.removeAttribute(FADING_ATTR);
      if (shouldHideItem(item)) item.setAttribute(VISUAL_HIDDEN_ATTR, "1");
    }, FADE_MS);
    hideTimers.set(item, timer);
  }

  function setKeywordHidden(item, keyword) {
    if (!(item instanceof Element)) return;
    if (!keyword) {
      item.removeAttribute(KEYWORD_HIDDEN_ATTR);
      item.removeAttribute("data-dcb-dcbest-keyword-match");
    } else {
      item.setAttribute(KEYWORD_HIDDEN_ATTR, "1");
      item.setAttribute("data-dcb-dcbest-keyword-match", keyword.label);
    }
    syncItemVisibility(item);
  }

  function setSourceHidden(item, gid) {
    if (!(item instanceof Element)) return;
    if (!gid) {
      item.removeAttribute(SOURCE_HIDDEN_ATTR);
      item.removeAttribute("data-dcb-dcbest-source-gid");
    } else {
      item.setAttribute(SOURCE_HIDDEN_ATTR, "1");
      item.setAttribute("data-dcb-dcbest-source-gid", gid);
    }
    syncItemVisibility(item);
  }

  function cacheEntryFresh(entry) {
    if (!entry || typeof entry !== "object") return false;
    const stamp = Number(entry.at) || 0;
    const ttl = entry.gid ? CACHE_TTL_MS : MISS_TTL_MS;
    return stamp > 0 && Date.now() - stamp < ttl;
  }

  function getCachedSource(no) {
    const entry = cache[no];
    if (!cacheEntryFresh(entry)) {
      if (entry) delete cache[no];
      return null;
    }
    return entry;
  }

  function pruneCache() {
    const entries = Object.entries(cache)
      .filter(([, value]) => cacheEntryFresh(value))
      .sort((a, b) => (Number(b[1]?.at) || 0) - (Number(a[1]?.at) || 0))
      .slice(0, CACHE_MAX_ENTRIES);

    cache = Object.fromEntries(entries);
  }

  function scheduleCacheSave() {
    if (cacheSaveTimer) return;
    cacheSaveTimer = setTimeout(() => {
      cacheSaveTimer = null;
      pruneCache();
      chrome.storage.local.set({ [CACHE_KEY]: cache });
    }, 1200);
  }

  function putCachedSource(no, gid) {
    cache[no] = {
      gid: normalizeGalleryId(gid),
      at: Date.now()
    };
    scheduleCacheSave();
  }

  function applySourceResult(no, gid) {
    const normalized = normalizeGalleryId(gid);
    const shouldHide = !!normalized
      && galleryBlockEnabled
      && blockedGalleryIds.has(normalized);

    const items = itemsByNo.get(no);
    if (!items) return;

    items.forEach((item) => {
      if (!item?.isConnected) return;
      setSourceHidden(item, shouldHide ? normalized : "");
    });
  }

  function waitForVisibleTab() {
    if (document.visibilityState === "visible") return Promise.resolve();

    return new Promise((resolve) => {
      const onVisibility = () => {
        if (document.visibilityState !== "visible") return;
        document.removeEventListener("visibilitychange", onVisibility);
        resolve();
      };
      document.addEventListener("visibilitychange", onVisibility);
    });
  }

  function fetchSourceGallery(no) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(
        { type: "dcb.dcbestSource", no },
        (response) => {
          if (chrome.runtime.lastError) {
            resolve({ ok: false, gid: "" });
            return;
          }
          resolve(response && typeof response === "object"
            ? response
            : { ok: false, gid: "" });
        }
      );
    });
  }

  async function runQueue() {
    if (queueRunning) return;
    queueRunning = true;

    try {
      while (requestQueue.length) {
        const no = requestQueue.shift();
        queuedNos.delete(no);

        if (!galleryBlockEnabled || !blockedGalleryIds.size) continue;

        const cached = getCachedSource(no);
        if (cached) {
          applySourceResult(no, cached.gid);
          continue;
        }

        await waitForVisibleTab();
        if (!galleryBlockEnabled || !blockedGalleryIds.size) continue;

        const result = await fetchSourceGallery(no);
        if (result?.rateLimited) {
          if (!queuedNos.has(no)) {
            queuedNos.add(no);
            requestQueue.unshift(no);
          }
          const retryAfterMs = Math.max(1000, Number(result.retryAfterMs) || 120_000);
          await new Promise((resolve) => setTimeout(resolve, retryAfterMs));
          continue;
        }

        const gid = result?.ok ? normalizeGalleryId(result.gid) : "";
        putCachedSource(no, gid);
        applySourceResult(no, gid);
      }
    } finally {
      queueRunning = false;
      if (requestQueue.length && galleryBlockEnabled && blockedGalleryIds.size) {
        setTimeout(runQueue, 500);
      }
    }
  }

  function enqueueSourceCheck(no) {
    if (!no || queuedNos.has(no)) return;
    if (!galleryBlockEnabled || !blockedGalleryIds.size) return;

    const cached = getCachedSource(no);
    if (cached) {
      applySourceResult(no, cached.gid);
      return;
    }

    queuedNos.add(no);
    requestQueue.push(no);
    void runQueue();
  }

  function observeForSourceCheck(item, no) {
    if (!(item instanceof Element) || !no) return;

    const cached = getCachedSource(no);
    if (cached) {
      applySourceResult(no, cached.gid);
      return;
    }

    if (!intersectionObserver) {
      enqueueSourceCheck(no);
      return;
    }

    intersectionObserver.observe(item);
  }

  function registerItem(link) {
    const no = getArticleNo(link);
    if (!no) return;

    const item = getItemForLink(link);
    if (!(item instanceof Element)) return;

    item.setAttribute(POST_NO_ATTR, no);

    let items = itemsByNo.get(no);
    if (!items) {
      items = new Set();
      itemsByNo.set(no, items);
    }
    items.add(item);

    const keyword = keywordBlockEnabled && keywordTargets.listTitle
      ? findKeyword(getTitleText(item, link))
      : null;
    setKeywordHidden(item, keyword);

    if (!galleryBlockEnabled || !blockedGalleryIds.size) {
      setSourceHidden(item, "");
      return;
    }

    observeForSourceCheck(item, no);
  }

  function scan(base = document) {
    ensureStyle();
    getCandidateLinks(base).forEach(registerItem);
  }

  function scheduleScan(base = document) {
    if (scanTimer) return;
    scanTimer = setTimeout(() => {
      scanTimer = null;
      scan(base);
    }, 100);
  }

  function refreshExistingItems() {
    document.querySelectorAll(`[${POST_NO_ATTR}]`).forEach((item) => {
      const no = item.getAttribute(POST_NO_ATTR) || "";
      const link = item.matches?.("a[href]")
        ? item
        : item.querySelector?.('a[href*="id=dcbest"][href*="no="]:not(.reply_numbox)');

      const keyword = keywordBlockEnabled && keywordTargets.listTitle
        ? findKeyword(getTitleText(item, link))
        : null;
      setKeywordHidden(item, keyword);

      const cached = getCachedSource(no);
      if (cached) applySourceResult(no, cached.gid);
      else {
        setSourceHidden(item, "");
        if (galleryBlockEnabled && blockedGalleryIds.size) observeForSourceCheck(item, no);
      }
    });
  }

  function setupIntersectionObserver() {
    intersectionObserver?.disconnect();
    intersectionObserver = null;

    if (!("IntersectionObserver" in window)) return;

    intersectionObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        intersectionObserver.unobserve(entry.target);
        const no = entry.target.getAttribute(POST_NO_ATTR) || "";
        enqueueSourceCheck(no);
      });
    }, {
      root: null,
      rootMargin: OBSERVER_MARGIN,
      threshold: 0
    });
  }

  function setupMutationObserver() {
    mutationObserver?.disconnect();
    mutationObserver = new MutationObserver((records) => {
      for (const record of records) {
        if (!record.addedNodes?.length) continue;
        scheduleScan(document);
        break;
      }
    });

    const observe = () => {
      if (!document.body) return;
      mutationObserver.observe(document.body, { childList: true, subtree: true });
    };

    if (document.body) observe();
    else document.addEventListener("DOMContentLoaded", observe, { once: true });
  }

  function loadCache() {
    return new Promise((resolve) => {
      chrome.storage.local.get({ [CACHE_KEY]: {} }, (result) => {
        const raw = result?.[CACHE_KEY];
        cache = raw && typeof raw === "object" && !Array.isArray(raw)
          ? raw
          : Object.create(null);
        pruneCache();
        cacheLoaded = true;
        resolve();
      });
    });
  }

  function loadSettings() {
    return new Promise((resolve) => {
      chrome.storage.sync.get(DEFAULTS, (conf) => {
        galleryBlockEnabled = typeof conf.galleryBlockEnabled === "boolean"
          ? conf.galleryBlockEnabled
          : !!conf.enabled;

        blockedGalleryIds = new Set(
          (Array.isArray(conf.blockedIds) ? conf.blockedIds : [])
            .map(normalizeGalleryId)
            .filter(Boolean)
        );

        keywordBlockEnabled = !!conf.keywordBlockEnabled;
        keywordList = prepareKeywords(conf.blockedKeywords);
        keywordTargets = {
          ...DEFAULTS.keywordBlockTargets,
          ...(conf.keywordBlockTargets || {})
        };
        resolve();
      });
    });
  }

  async function initialize() {
    ensureStyle();
    setupIntersectionObserver();
    setupMutationObserver();
    await Promise.all([loadCache(), loadSettings()]);
    scan(document);
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "sync") return;

    if (
      !changes.galleryBlockEnabled
      && !changes.enabled
      && !changes.blockedIds
      && !changes.keywordBlockEnabled
      && !changes.blockedKeywords
      && !changes.keywordBlockTargets
    ) return;

    loadSettings().then(() => {
      requestQueue.length = 0;
      queuedNos.clear();
      setupIntersectionObserver();
      refreshExistingItems();
      scan(document);
    });
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initialize, { once: true });
  } else {
    void initialize();
  }
})();

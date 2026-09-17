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

  // gall.dcinside.com에서는 실베 목록/상세에서만 동작한다.
  // manifest는 query string으로 id=dcbest를 제한할 수 없으므로 일반 갤러리 페이지는 즉시 종료한다.
  if (location.hostname === "gall.dcinside.com") {
    try {
      const pageUrl = new URL(location.href);
      const isDcbestSurface = /^\/board\/(?:lists|view)\/?$/i.test(pageUrl.pathname)
        && String(pageUrl.searchParams.get("id") || "").trim().toLowerCase() === "dcbest";
      if (!isDcbestSurface) return;
    } catch (_) {
      return;
    }
  }

  const STYLE_ID = "dcb-dcbest-source-filter-style";
  const KEYWORD_HIDDEN_ATTR = "data-dcb-dcbest-keyword-hidden";
  const SOURCE_HIDDEN_ATTR = "data-dcb-dcbest-source-hidden";
  const POST_NO_ATTR = "data-dcb-dcbest-no";
  const FADING_ATTR = "data-dcb-dcbest-fading";
  const ANALYZING_ATTR = "data-dcb-dcbest-analyzing";
  const VISUAL_HIDDEN_ATTR = "data-dcb-dcbest-hidden";
  const FADE_MS = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ? 0 : 180;
  const CACHE_KEY = "dcbDcbestSourceCacheV1";
  const SOURCE_ALIAS_CACHE_KEY = "dcbDcbestSourceAliasCacheV1";
  const FILTER_HOT_CACHE_KEY = "dcbDcbestFilterSettingsHotCacheV1";
  const FILTER_HOT_CACHE_VERSION = 1;
  const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
  const SOURCE_ALIAS_TTL_MS = 30 * 24 * 60 * 60 * 1000;
  const SOURCE_RETRY_MS = 3 * 60 * 1000;
  const CACHE_MAX_ENTRIES = 800;
  const SOURCE_ALIAS_CACHE_MAX_ENTRIES = 300;
  const OBSERVER_MARGIN = "280px 0px";

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
    },
    keywordHideEnabled: false,
    hiddenKeywords: [],
    keywordHideTargets: {
      listTitle: true,
      viewTitle: true,
      viewBody: true,
      comments: true
    }
  };

  let galleryBlockEnabled = true;
  let blockedGalleryIds = new Set();
  let keywordBlockEnabled = false;
  let keywordHideEnabled = false;
  let keywordList = [];
  let keywordTargets = { ...DEFAULTS.keywordBlockTargets };
  let keywordHideTargets = { ...DEFAULTS.keywordHideTargets };
  let currentConfig = { ...DEFAULTS };

  let cache = Object.create(null);
  let sourceAliasCache = Object.create(null);
  let cacheLoaded = false;
  let syncSettingsApplied = false;
  let cacheSaveTimer = null;

  let mutationObserver = null;
  let rankMutationObserver = null;
  let intersectionObserver = null;
  let scanTimer = null;
  const pendingScanRoots = new Set();
  let queueRunning = false;
  let pageToken = createPageToken();
  const queuedNos = new Set();
  const activeNos = new Set();
  const requestQueue = [];
  const itemsByNo = new Map();
  const postUrlByNo = new Map();
  const sourceLabelByNo = new Map();
  const retryAfterByNo = new Map();
  const hideTimers = new WeakMap();
  const analysisTimers = new WeakMap();
  const mainAnalysisIndicators = new WeakMap();
  const mainAnalysisItemsByHost = new WeakMap();
  const activeMainAnalysisIndicators = new Set();
  let mainAnalysisPositionRaf = 0;

  function createPageToken() {
    try {
      if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
    } catch (_) {}
    return `dcb-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
  }

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

  function rebuildActiveKeywordList(conf = {}) {
    const active = [];

    const blockTargets = {
      ...DEFAULTS.keywordBlockTargets,
      ...(conf.keywordBlockTargets || {})
    };
    const hideTargets = {
      ...DEFAULTS.keywordHideTargets,
      ...(conf.keywordHideTargets || {})
    };

    keywordBlockEnabled = !!conf.keywordBlockEnabled;
    keywordHideEnabled = !!conf.keywordHideEnabled;
    keywordTargets = blockTargets;
    keywordHideTargets = hideTargets;

    if (keywordBlockEnabled && blockTargets.listTitle) {
      active.push(...(Array.isArray(conf.blockedKeywords) ? conf.blockedKeywords : []));
    }
    if (keywordHideEnabled && hideTargets.listTitle) {
      active.push(...(Array.isArray(conf.hiddenKeywords) ? conf.hiddenKeywords : []));
    }

    keywordList = prepareKeywords(active);
  }

  function keywordFilteringEnabled() {
    return keywordList.length > 0;
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
      @keyframes dcbDcbestSpin {
        to { transform: rotate(360deg); }
      }
      @keyframes dcbDcbestProgress {
        0% { transform: translateX(-115%); }
        100% { transform: translateX(315%); }
      }
      .dcb-dcbest-analysis-indicator {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        margin-left: 6px;
        padding: 2px 7px 2px 6px;
        border-radius: 999px;
        border: 1px solid rgba(70, 125, 220, 0.24);
        background: rgba(70, 125, 220, 0.07);
        color: #416fbd;
        font-size: 10px;
        font-weight: 700;
        line-height: 15px;
        letter-spacing: -0.15px;
        white-space: nowrap;
        vertical-align: middle;
        opacity: 0;
        transform: translateY(-1px) scale(0.96);
        transition: opacity 130ms ease, transform 130ms ease, background-color 130ms ease, color 130ms ease, border-color 130ms ease;
        pointer-events: none;
      }
      .dcb-dcbest-analysis-indicator.is-visible {
        opacity: 1;
        transform: translateY(-1px) scale(1);
      }
      .dcb-dcbest-analysis-indicator .dcb-dcbest-analysis-spinner {
        width: 9px;
        height: 9px;
        box-sizing: border-box;
        border-radius: 50%;
        border: 1.5px solid currentColor;
        border-right-color: transparent;
        animation: dcbDcbestSpin 0.62s linear infinite;
      }
      .dcb-dcbest-analysis-indicator .dcb-dcbest-analysis-icon {
        display: none;
        width: 10px;
        text-align: center;
        font-size: 10px;
        line-height: 10px;
      }
      .dcb-dcbest-analysis-indicator[data-state="allowed"] {
        color: #36784a;
        border-color: rgba(54, 120, 74, 0.22);
        background: rgba(54, 120, 74, 0.07);
      }
      .dcb-dcbest-analysis-indicator[data-state="blocked"] {
        color: #b34747;
        border-color: rgba(179, 71, 71, 0.24);
        background: rgba(179, 71, 71, 0.08);
      }
      .dcb-dcbest-analysis-indicator[data-state="analyzing"] {
        position: relative;
        overflow: hidden;
      }
      .dcb-dcbest-analysis-indicator[data-state="analyzing"]::after {
        content: "";
        position: absolute;
        left: 0;
        bottom: 0;
        width: 34%;
        height: 1px;
        border-radius: 2px;
        background: linear-gradient(90deg, transparent, currentColor, transparent);
        opacity: .55;
        animation: dcbDcbestProgress 1.05s ease-in-out infinite;
        pointer-events: none;
      }
      [${FADING_ATTR}="1"] {
        opacity: 0 !important;
        pointer-events: none !important;
        transition: opacity ${FADE_MS}ms ease-out !important;
      }
      [${VISUAL_HIDDEN_ATTR}="1"] {
        display: none !important;
      }
      @media (prefers-reduced-motion: reduce) {
        .dcb-dcbest-analysis-indicator,
        .dcb-dcbest-analysis-indicator .dcb-dcbest-analysis-spinner {
          transition: none !important;
          animation: none !important;
        }
      }
    `;
    (document.head || document.documentElement).appendChild(style);
  }

  function getDcbestPostUrl(link) {
    try {
      const url = new URL(link?.href || "", location.href);
      if (url.protocol !== "https:") return "";
      if (url.hostname !== "gall.dcinside.com") return "";
      if (!/^\/board\/view\/?$/i.test(url.pathname)) return "";
      if (normalizeText(url.searchParams.get("id")) !== "dcbest") return "";
      const no = String(url.searchParams.get("no") || "").trim();
      if (!/^\d{1,12}$/.test(no)) return "";
      return url.href;
    } catch (_) {
      return "";
    }
  }

  function getArticleNo(link) {
    const href = getDcbestPostUrl(link);
    if (!href) return "";
    try {
      return new URL(href).searchParams.get("no") || "";
    } catch (_) {
      return "";
    }
  }

  function getCandidateLinks(base = document) {
    if (!base?.querySelectorAll) return [];

    const selector = 'a[href*="id=dcbest"][href*="no="]';
    const links = [];
    if (base instanceof Element && base.matches?.(selector)) links.push(base);
    links.push(...base.querySelectorAll(selector));

    return Array.from(new Set(links)).filter((link) => {
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

  function getSourceLabel(item) {
    if (!(item instanceof Element)) return "";
    const label = item.querySelector(".best_info .name")?.textContent || "";
    return normalizeSourceLabel(label);
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
    const gid = normalizeGalleryId(entry.gid);
    const stamp = Number(entry.at) || 0;
    return !!gid && stamp > 0 && Date.now() - stamp < CACHE_TTL_MS;
  }

  function sourceAliasEntryFresh(entry) {
    if (!entry || typeof entry !== "object") return false;
    const stamp = Number(entry.at) || 0;
    return stamp > 0 && Date.now() - stamp < SOURCE_ALIAS_TTL_MS;
  }

  function normalizeSourceLabel(value) {
    return normalizeText(value).replace(/\s*갤러리$/, "").trim();
  }

  function getCachedSource(no) {
    const entry = cache[no];
    if (!cacheEntryFresh(entry)) {
      if (entry) delete cache[no];
      return null;
    }
    return entry;
  }

  function getCachedSourceAlias(label) {
    const key = normalizeSourceLabel(label);
    if (!key) return null;

    const entry = sourceAliasCache[key];
    if (!sourceAliasEntryFresh(entry)) {
      if (entry) delete sourceAliasCache[key];
      return null;
    }

    if (entry.ambiguous) return null;
    const gid = normalizeGalleryId(entry.gid);
    return gid ? { gid, at: Number(entry.at) || 0 } : null;
  }

  function pruneCache() {
    const entries = Object.entries(cache)
      .filter(([, value]) => cacheEntryFresh(value))
      .sort((a, b) => (Number(b[1]?.at) || 0) - (Number(a[1]?.at) || 0))
      .slice(0, CACHE_MAX_ENTRIES);

    cache = Object.fromEntries(entries);

    const aliases = Object.entries(sourceAliasCache)
      .filter(([, value]) => sourceAliasEntryFresh(value))
      .sort((a, b) => (Number(b[1]?.at) || 0) - (Number(a[1]?.at) || 0))
      .slice(0, SOURCE_ALIAS_CACHE_MAX_ENTRIES);

    sourceAliasCache = Object.fromEntries(aliases);
  }

  function scheduleCacheSave() {
    if (cacheSaveTimer) return;
    cacheSaveTimer = setTimeout(() => {
      cacheSaveTimer = null;
      pruneCache();
      chrome.storage.local.set({
        [CACHE_KEY]: cache,
        [SOURCE_ALIAS_CACHE_KEY]: sourceAliasCache
      });
    }, 650);
  }

  function putCachedSource(no, gid) {
    const normalized = normalizeGalleryId(gid);
    if (!normalized) return;

    cache[no] = {
      gid: normalized,
      at: Date.now()
    };
    scheduleCacheSave();
  }

  function putCachedSourceAlias(label, gid) {
    const key = normalizeSourceLabel(label);
    const normalized = normalizeGalleryId(gid);
    if (!key || !normalized) return;

    const previous = sourceAliasCache[key];
    if (sourceAliasEntryFresh(previous)) {
      const previousGid = normalizeGalleryId(previous.gid);
      if (previous.ambiguous || (previousGid && previousGid !== normalized)) {
        sourceAliasCache[key] = { ambiguous: true, gid: "", at: Date.now() };
        scheduleCacheSave();
        return;
      }
    }

    sourceAliasCache[key] = { gid: normalized, ambiguous: false, at: Date.now() };
    scheduleCacheSave();
  }

  function clearAnalysisTimer(item) {
    const timer = analysisTimers.get(item);
    if (!timer) return;
    clearTimeout(timer);
    analysisTimers.delete(item);
  }

  function getMainCardLink(item) {
    if (!(item instanceof Element)) return null;
    if (item.matches?.('a.main_log[href*="id=dcbest"][href*="no="]')) return item;
    return item.querySelector?.('a.main_log[href*="id=dcbest"][href*="no="]') || null;
  }

  function isMainCard(item) {
    return location.hostname === "www.dcinside.com"
      && item instanceof Element
      && !!item.querySelector?.(".best_info")
      && !!getMainCardLink(item);
  }

  function getAnalysisHost(item) {
    if (!(item instanceof Element)) return null;
    return item.querySelector(".gall_tit")
      || item.querySelector(".besttxt")
      || item;
  }

  function isElementVisible(element) {
    if (!(element instanceof Element) || !element.isConnected) return false;
    const style = getComputedStyle(element);
    if (style.display === "none" || style.visibility === "hidden") return false;
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function ensureAnalysisIndicator(item) {
    const host = getAnalysisHost(item);
    if (!(host instanceof Element)) return null;

    let indicator = host.querySelector(":scope > .dcb-dcbest-analysis-indicator");
    if (indicator) return indicator;

    indicator = document.createElement("span");
    indicator.className = "dcb-dcbest-analysis-indicator";
    indicator.setAttribute("data-dcb-dcbest-ui", "1");
    indicator.setAttribute("aria-live", "polite");

    const spinner = document.createElement("span");
    spinner.className = "dcb-dcbest-analysis-spinner";
    spinner.setAttribute("aria-hidden", "true");

    const icon = document.createElement("span");
    icon.className = "dcb-dcbest-analysis-icon";
    icon.setAttribute("aria-hidden", "true");

    const label = document.createElement("span");
    label.className = "dcb-dcbest-analysis-label";

    indicator.append(spinner, icon, label);
    host.appendChild(indicator);
    return indicator;
  }

  function positionMainAnalysisIndicator(item, host) {
    if (!(item instanceof Element) || !(host instanceof HTMLElement)) return;
    if (!item.isConnected || !isElementVisible(item)) {
      host.style.display = "none";
      return;
    }

    const card = getMainCardLink(item) || item;
    const cardRect = card.getBoundingClientRect();
    const image = item.querySelector?.(".bestimg");
    const imageRect = image && isElementVisible(image)
      ? image.getBoundingClientRect()
      : null;

    // 메인 카드에서는 텍스트/출처/시간 레이아웃에 전혀 손대지 않는다.
    // 가능하면 썸네일 위에 작게 띄우고, 이미지가 없을 때만 카드 우측 상단을 쓴다.
    const top = Math.max(8, (imageRect || cardRect).top + 5);
    const left = imageRect
      ? Math.max(8, imageRect.left + 5)
      : Math.max(8, Math.min(window.innerWidth - 92, cardRect.right - 92));

    host.style.display = "block";
    host.style.top = `${Math.round(top)}px`;
    host.style.left = `${Math.round(left)}px`;
  }

  function scheduleMainAnalysisReposition() {
    if (mainAnalysisPositionRaf) return;
    mainAnalysisPositionRaf = requestAnimationFrame(() => {
      mainAnalysisPositionRaf = 0;
      activeMainAnalysisIndicators.forEach((host) => {
        const item = mainAnalysisItemsByHost.get(host);
        if (!item?.isConnected) {
          activeMainAnalysisIndicators.delete(host);
          host.remove();
          return;
        }
        positionMainAnalysisIndicator(item, host);
      });
    });
  }

  function removeMainAnalysisIndicator(item) {
    const host = mainAnalysisIndicators.get(item);
    if (!host) return;
    activeMainAnalysisIndicators.delete(host);
    host.remove();
    mainAnalysisIndicators.delete(item);
  }

  function ensureMainAnalysisIndicator(item) {
    let host = mainAnalysisIndicators.get(item);
    if (host?.isConnected) {
      positionMainAnalysisIndicator(item, host);
      return host;
    }

    host = document.createElement("span");
    host.className = "dcb-dcbest-main-analysis-host";
    host.setAttribute("data-dcb-dcbest-ui", "1");
    host.setAttribute("aria-live", "polite");
    host.style.cssText = [
      "all:initial",
      "position:fixed",
      "z-index:2147483000",
      "pointer-events:none",
      "transform:none",
      "display:none"
    ].join(";");

    const root = host.attachShadow({ mode: "open" });
    root.innerHTML = `
      <style>
        :host { all: initial; }
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes sweep {
          0% { transform: translateX(-120%); opacity: .15; }
          45% { opacity: .8; }
          100% { transform: translateX(320%); opacity: .15; }
        }
        .pill {
          position: relative;
          display: inline-flex;
          align-items: center;
          gap: 6px;
          min-height: 24px;
          box-sizing: border-box;
          padding: 3px 9px 4px 8px;
          overflow: hidden;
          border: 1px solid rgba(255,255,255,.16);
          border-radius: 999px;
          background: rgba(24, 29, 39, .90);
          box-shadow: 0 5px 16px rgba(0,0,0,.18), inset 0 1px 0 rgba(255,255,255,.05);
          color: rgba(255,255,255,.94);
          backdrop-filter: blur(8px) saturate(130%);
          -webkit-backdrop-filter: blur(8px) saturate(130%);
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif;
          font-size: 10.5px;
          font-weight: 650;
          line-height: 1;
          letter-spacing: -.12px;
          white-space: nowrap;
          opacity: 0;
          transform: translateY(-3px) scale(.96);
          transition: opacity 140ms ease, transform 160ms cubic-bezier(.2,.8,.2,1), background-color 140ms ease, border-color 140ms ease;
        }
        .pill.visible { opacity: 1; transform: translateY(0) scale(1); }
        .glyph {
          display: grid;
          place-items: center;
          width: 11px;
          height: 11px;
          flex: 0 0 11px;
        }
        .spinner {
          width: 10px;
          height: 10px;
          box-sizing: border-box;
          border-radius: 50%;
          border: 1.5px solid rgba(255,255,255,.42);
          border-top-color: #78a9ff;
          animation: spin .72s linear infinite;
        }
        .icon { display: none; font-size: 11px; font-weight: 800; }
        .pill[data-state="analyzing"]::after {
          content: "";
          position: absolute;
          left: 0;
          bottom: 0;
          width: 34%;
          height: 2px;
          border-radius: 999px;
          background: linear-gradient(90deg, transparent, #78a9ff, transparent);
          animation: sweep 1.05s ease-in-out infinite;
        }
        .pill[data-state="allowed"] {
          background: rgba(28, 67, 45, .92);
          border-color: rgba(122, 221, 155, .28);
        }
        .pill[data-state="allowed"] .icon { color: #9be3b3; }
        .pill[data-state="blocked"] {
          background: rgba(82, 33, 37, .94);
          border-color: rgba(255, 133, 142, .30);
        }
        .pill[data-state="blocked"] .icon { color: #ff9aa2; }
        @media (prefers-reduced-motion: reduce) {
          .pill, .spinner, .pill::after { animation: none !important; transition: none !important; }
        }
      </style>
      <span class="pill" data-state="analyzing">
        <span class="glyph"><span class="spinner"></span><span class="icon"></span></span>
        <span class="label">출처 분석 중</span>
      </span>
    `;

    (document.body || document.documentElement).appendChild(host);
    mainAnalysisIndicators.set(item, host);
    mainAnalysisItemsByHost.set(host, item);
    activeMainAnalysisIndicators.add(host);
    positionMainAnalysisIndicator(item, host);
    return host;
  }

  function updateMainAnalysisIndicator(item, state) {
    const host = ensureMainAnalysisIndicator(item);
    const root = host.shadowRoot;
    const pill = root?.querySelector(".pill");
    const spinner = root?.querySelector(".spinner");
    const icon = root?.querySelector(".icon");
    const label = root?.querySelector(".label");
    if (!pill) return;

    pill.dataset.state = state;
    pill.classList.add("visible");
    if (state === "analyzing") {
      if (spinner) spinner.style.display = "block";
      if (icon) icon.style.display = "none";
      if (label) label.textContent = "출처 분석 중";
    } else {
      if (spinner) spinner.style.display = "none";
      if (icon) {
        icon.style.display = "block";
        icon.textContent = state === "blocked" ? "×" : "✓";
      }
      if (label) label.textContent = state === "blocked" ? "차단 출처" : "확인 완료";
    }
    positionMainAnalysisIndicator(item, host);
  }

  window.addEventListener("scroll", scheduleMainAnalysisReposition, { passive: true, capture: true });
  window.addEventListener("resize", scheduleMainAnalysisReposition, { passive: true });

  function setAnalysisState(no, state) {
    const items = itemsByNo.get(no);
    if (!items) return;

    items.forEach((item) => {
      if (!item?.isConnected) return;
      clearAnalysisTimer(item);

      // 같은 실베 글이 랭킹/추천 등 여러 숨은 목록에 중복될 수 있다.
      // 상태 UI는 현재 실제로 보이는 항목에만 표시한다.
      if (state && state !== "off" && !isElementVisible(item)) return;

      if (!state || state === "off") {
        item.removeAttribute(ANALYZING_ATTR);
        item.querySelectorAll?.(".dcb-dcbest-analysis-indicator").forEach((node) => node.remove());
        removeMainAnalysisIndicator(item);
        return;
      }

      const mainCard = isMainCard(item);
      if (mainCard) {
        if (state === "analyzing") item.setAttribute(ANALYZING_ATTR, "1");
        else item.removeAttribute(ANALYZING_ATTR);
        updateMainAnalysisIndicator(item, state);

        if (state === "analyzing") return;
        const holdMs = state === "blocked" ? 260 : 520;
        const timer = setTimeout(() => {
          analysisTimers.delete(item);
          const host = mainAnalysisIndicators.get(item);
          const pill = host?.shadowRoot?.querySelector(".pill");
          pill?.classList.remove("visible");
          setTimeout(() => removeMainAnalysisIndicator(item), 150);
        }, holdMs);
        analysisTimers.set(item, timer);
        return;
      }

      const indicator = ensureAnalysisIndicator(item);
      if (!indicator) return;
      const spinner = indicator.querySelector(".dcb-dcbest-analysis-spinner");
      const icon = indicator.querySelector(".dcb-dcbest-analysis-icon");
      const label = indicator.querySelector(".dcb-dcbest-analysis-label");

      indicator.dataset.state = state;
      indicator.classList.add("is-visible");

      if (state === "analyzing") {
        item.setAttribute(ANALYZING_ATTR, "1");
        if (spinner) spinner.style.display = "inline-block";
        if (icon) icon.style.display = "none";
        if (label) label.textContent = "원출처 분석 중";
        return;
      }

      item.removeAttribute(ANALYZING_ATTR);
      if (spinner) spinner.style.display = "none";
      if (icon) {
        icon.style.display = "inline-block";
        icon.textContent = state === "blocked" ? "⊘" : "✓";
      }
      if (label) {
        label.textContent = state === "blocked" ? "차단 출처" : "확인 완료";
      }

      const holdMs = state === "blocked" ? 240 : 420;
      const timer = setTimeout(() => {
        analysisTimers.delete(item);
        indicator.classList.remove("is-visible");
        setTimeout(() => indicator.remove(), 140);
      }, holdMs);
      analysisTimers.set(item, timer);
    });
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

  function registerSourcePageSession() {
    try {
      chrome.runtime.sendMessage(
        { type: "dcb.dcbestSourcePage", pageToken },
        () => void chrome.runtime.lastError
      );
    } catch (_) {}
  }

  function fetchSourceGallery(no, postUrl) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(
        { type: "dcb.dcbestSource", no, url: postUrl, pageToken },
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

        const sourceLabel = sourceLabelByNo.get(no) || "";
        const alias = getCachedSourceAlias(sourceLabel);
        if (alias) {
          putCachedSource(no, alias.gid);
          applySourceResult(no, alias.gid);
          continue;
        }

        await waitForVisibleTab();
        if (!galleryBlockEnabled || !blockedGalleryIds.size) continue;

        const postUrl = postUrlByNo.get(no) || "";
        if (!postUrl) continue;

        let result;
        activeNos.add(no);
        setAnalysisState(no, "analyzing");
        try {
          result = await fetchSourceGallery(no, postUrl);
        } catch (_) {
          result = { ok: false, gid: "" };
        } finally {
          activeNos.delete(no);
        }

        if (result?.stale) {
          setAnalysisState(no, "off");
          continue;
        }

        if (result?.rateLimited) {
          setAnalysisState(no, "off");
          if (!queuedNos.has(no)) {
            queuedNos.add(no);
            requestQueue.unshift(no);
          }
          const retryAfterMs = Math.max(1000, Number(result.retryAfterMs) || 120_000);
          await new Promise((resolve) => setTimeout(resolve, retryAfterMs));
          continue;
        }

        const gid = result?.ok ? normalizeGalleryId(result.gid) : "";
        if (gid) {
          retryAfterByNo.delete(no);
          putCachedSource(no, gid);
          if (sourceLabel) putCachedSourceAlias(sourceLabel, gid);

          const blocked = galleryBlockEnabled && blockedGalleryIds.has(gid);
          setAnalysisState(no, blocked ? "blocked" : "allowed");
          if (blocked) {
            await new Promise((resolve) => setTimeout(resolve, 120));
          }
          applySourceResult(no, gid);
        } else {
          setAnalysisState(no, "off");
          // 일시적인 HTML 차이/응답 실패는 짧게만 재시도 보류한다.
          retryAfterByNo.set(no, Date.now() + SOURCE_RETRY_MS);
        }
      }
    } finally {
      queueRunning = false;
      if (requestQueue.length && galleryBlockEnabled && blockedGalleryIds.size) {
        setTimeout(runQueue, 180);
      }
    }
  }

  function enqueueSourceCheck(no) {
    if (!no || queuedNos.has(no) || activeNos.has(no)) return;
    if (!galleryBlockEnabled || !blockedGalleryIds.size) return;

    const retryAfter = Number(retryAfterByNo.get(no)) || 0;
    if (retryAfter > Date.now()) return;
    if (retryAfter) retryAfterByNo.delete(no);

    const cached = getCachedSource(no);
    if (cached) {
      applySourceResult(no, cached.gid);
      return;
    }

    const alias = getCachedSourceAlias(sourceLabelByNo.get(no) || "");
    if (alias) {
      putCachedSource(no, alias.gid);
      applySourceResult(no, alias.gid);
      return;
    }

    const startsImmediately = !queueRunning && requestQueue.length === 0;
    queuedNos.add(no);
    requestQueue.push(no);
    if (startsImmediately) setAnalysisState(no, "analyzing");
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
    const postUrl = getDcbestPostUrl(link);
    if (!postUrl) return;

    let no = "";
    try { no = new URL(postUrl).searchParams.get("no") || ""; } catch (_) {}
    if (!no) return;
    postUrlByNo.set(no, postUrl);

    const item = getItemForLink(link);
    if (!(item instanceof Element)) return;

    item.setAttribute(POST_NO_ATTR, no);

    let items = itemsByNo.get(no);
    if (!items) {
      items = new Set();
      itemsByNo.set(no, items);
    }
    items.add(item);

    const sourceLabel = getSourceLabel(item);
    if (sourceLabel) sourceLabelByNo.set(no, sourceLabel);

    const keyword = keywordFilteringEnabled()
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
    if (!base?.querySelectorAll) return;

    if (base === document) {
      pendingScanRoots.clear();
      pendingScanRoots.add(document);
    } else if (!pendingScanRoots.has(document)) {
      // 이미 더 큰 subtree가 예약돼 있으면 중복 스캔하지 않는다.
      for (const existing of Array.from(pendingScanRoots)) {
        if (existing === base) return;
        if (existing instanceof Node && base instanceof Node && existing.contains?.(base)) return;
        if (existing instanceof Node && base instanceof Node && base.contains?.(existing)) {
          pendingScanRoots.delete(existing);
        }
      }
      pendingScanRoots.add(base);
    }

    if (scanTimer) return;
    scanTimer = 1;
    const flush = () => {
      scanTimer = null;
      const roots = Array.from(pendingScanRoots);
      pendingScanRoots.clear();
      roots.forEach((root) => scan(root));
    };
    if (typeof queueMicrotask === "function") queueMicrotask(flush);
    else Promise.resolve().then(flush);
  }

  function refreshExistingItems() {
    document.querySelectorAll(`[${POST_NO_ATTR}]`).forEach((item) => {
      const no = item.getAttribute(POST_NO_ATTR) || "";
      const link = item.matches?.("a[href]")
        ? item
        : item.querySelector?.('a[href*="id=dcbest"][href*="no="]:not(.reply_numbox)');

      const sourceLabel = getSourceLabel(item);
      if (sourceLabel) sourceLabelByNo.set(no, sourceLabel);

      const keyword = keywordFilteringEnabled()
        ? findKeyword(getTitleText(item, link))
        : null;
      setKeywordHidden(item, keyword);

      const cached = getCachedSource(no);
      const alias = cached ? null : getCachedSourceAlias(sourceLabelByNo.get(no) || "");
      if (cached) applySourceResult(no, cached.gid);
      else if (alias) {
        putCachedSource(no, alias.gid);
        applySourceResult(no, alias.gid);
      } else {
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

  function getVisibleRankLists() {
    if (location.hostname !== "www.dcinside.com") return [];
    return Array.from(document.querySelectorAll("#dcbest_list_rank ul.dcbest_rank_ul"))
      .filter(isElementVisible);
  }

  function refreshActiveRankTab() {
    const lists = getVisibleRankLists();
    if (!lists.length) return;

    lists.forEach((list) => {
      getCandidateLinks(list).forEach((link) => {
        registerItem(link);
        const item = getItemForLink(link);
        const no = getArticleNo(link);
        if (!(item instanceof Element) || !no) return;

        // 숨은 랭킹 목록에서 먼저 observe됐던 항목도 탭 활성화 시
        // 현재 viewport 기준으로 다시 관찰/큐잉한다.
        intersectionObserver?.unobserve(item);
        observeForSourceCheck(item, no);
      });
    });
  }

  function scheduleRankRefresh() {
    requestAnimationFrame(() => {
      refreshActiveRankTab();
      setTimeout(refreshActiveRankTab, 80);
    });
  }

  function setupRankTabWatchers() {
    if (location.hostname !== "www.dcinside.com") return;

    document.addEventListener("click", (event) => {
      const button = event.target?.closest?.(".btn_dcbest_rank_tab");
      if (!button) return;
      scheduleRankRefresh();
    }, true);

    rankMutationObserver?.disconnect();
    const rankPanel = document.querySelector("#dcbest_list_rank");
    if (!rankPanel) return;

    rankMutationObserver = new MutationObserver((records) => {
      const relevant = records.some((record) => {
        if (record.type === "attributes") {
          return record.target instanceof Element
            && (record.target.matches("#dcbest_list_rank")
              || record.target.matches("ul.dcbest_rank_ul"));
        }

        if (record.type !== "childList" || !record.addedNodes?.length) return false;
        return Array.from(record.addedNodes).some((node) => {
          if (!(node instanceof Element)) return false;
          return node.matches?.("ul.dcbest_rank_ul, a[href*='id=dcbest'][href*='no=']")
            || !!node.querySelector?.("ul.dcbest_rank_ul, a[href*='id=dcbest'][href*='no=']");
        });
      });

      if (relevant) scheduleRankRefresh();
    });

    rankMutationObserver.observe(rankPanel, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["class", "style"]
    });
  }

  function setupMutationObserver() {
    mutationObserver?.disconnect();
    mutationObserver = new MutationObserver((records) => {
      let rankPanelAdded = false;

      for (const record of records) {
        if (!record.addedNodes?.length) continue;

        for (const node of record.addedNodes) {
          if (!(node instanceof Element) && !(node instanceof DocumentFragment)) continue;

          // 확장 프로그램이 자체적으로 붙인 상태 UI 때문에 문서 전체를 다시 훑지 않는다.
          if (node instanceof Element && (
            node.getAttribute("data-dcb-dcbest-ui") === "1"
            || node.closest?.('[data-dcb-dcbest-ui="1"]')
          )) {
            continue;
          }

          if (node instanceof Element && (
            node.matches?.("#dcbest_list_rank")
            || !!node.querySelector?.("#dcbest_list_rank")
          )) {
            rankPanelAdded = true;
          }

          const hasCandidate = node instanceof Element
            ? (node.matches?.('a[href*="id=dcbest"][href*="no="]')
              || !!node.querySelector?.('a[href*="id=dcbest"][href*="no="]'))
            : !!node.querySelector?.('a[href*="id=dcbest"][href*="no="]');

          if (hasCandidate) scheduleScan(node);
        }
      }

      if (rankPanelAdded) {
        setupRankTabWatchers();
        scheduleRankRefresh();
      }
    });

    const root = document.body || document.documentElement;
    if (root) mutationObserver.observe(root, { childList: true, subtree: true });
  }


  function applyGallerySettings(conf = {}) {
    galleryBlockEnabled = typeof conf.galleryBlockEnabled === "boolean"
      ? conf.galleryBlockEnabled
      : !!conf.enabled;

    blockedGalleryIds = new Set(
      (Array.isArray(conf.blockedIds) ? conf.blockedIds : [])
        .map(normalizeGalleryId)
        .filter(Boolean)
    );
  }

  function loadCache() {
    return new Promise((resolve) => {
      chrome.storage.local.get({
        [CACHE_KEY]: {},
        [SOURCE_ALIAS_CACHE_KEY]: {},
        [FILTER_HOT_CACHE_KEY]: null
      }, (result) => {
        const raw = result?.[CACHE_KEY];
        const rawAliases = result?.[SOURCE_ALIAS_CACHE_KEY];
        const hot = result?.[FILTER_HOT_CACHE_KEY];

        cache = raw && typeof raw === "object" && !Array.isArray(raw)
          ? raw
          : Object.create(null);
        sourceAliasCache = rawAliases && typeof rawAliases === "object" && !Array.isArray(rawAliases)
          ? rawAliases
          : Object.create(null);

        if (!syncSettingsApplied
          && hot?.version === FILTER_HOT_CACHE_VERSION
          && hot.data && typeof hot.data === "object") {
          applyGallerySettings(hot.data);
        }

        pruneCache();
        cacheLoaded = true;
        resolve();
      });
    });
  }

  function loadSettings() {
    return new Promise((resolve) => {
      chrome.storage.sync.get(DEFAULTS, (conf) => {
        currentConfig = { ...DEFAULTS, ...(conf || {}) };
        syncSettingsApplied = true;
        applyGallerySettings(currentConfig);
        rebuildActiveKeywordList(currentConfig);
        resolve();
      });
    });
  }

  async function initialize() {
    ensureStyle();
    setupIntersectionObserver();
    setupMutationObserver();
    setupRankTabWatchers();
    registerSourcePageSession();

    // 메인/실베 제목 키워드는 원출처 캐시나 sync 저장소가 깨어날 때까지 기다리지 않는다.
    // local hot snapshot이 있으면 첫 paint 전에 가능한 한 빨리 목록을 정리한다.
    globalThis.DCBKeywordSettingsHotCache?.subscribe?.((conf) => {
      currentConfig = {
        ...currentConfig,
        keywordBlockEnabled: !!conf.keywordBlockEnabled,
        blockedKeywords: Array.isArray(conf.blockedKeywords) ? conf.blockedKeywords : [],
        keywordBlockTargets: conf.keywordBlockTargets || DEFAULTS.keywordBlockTargets,
        keywordHideEnabled: !!conf.keywordHideEnabled,
        hiddenKeywords: Array.isArray(conf.hiddenKeywords) ? conf.hiddenKeywords : [],
        keywordHideTargets: conf.keywordHideTargets || DEFAULTS.keywordHideTargets
      };
      rebuildActiveKeywordList(currentConfig);
      scan(document);
      scheduleRankRefresh();
    });

    // sync 읽기도 동시에 시작하되, local source/alias cache + gallery block hot snapshot이
    // 먼저 준비되면 기다리지 않고 즉시 분석을 시작한다. sync가 더 먼저 끝난 경우에는
    // 오래된 hot snapshot이 최신 설정을 되돌리지 않도록 syncSettingsApplied로 보호한다.
    const syncSettingsPromise = loadSettings();
    await loadCache();
    scan(document);
    scheduleRankRefresh();

    await syncSettingsPromise;
    refreshExistingItems();
    scheduleRankRefresh();
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
      && !changes.keywordHideEnabled
      && !changes.hiddenKeywords
      && !changes.keywordHideTargets
    ) return;

    // storage.onChanged가 이미 새 값을 주므로 sync를 다시 읽지 않는다.
    const patch = {};
    Object.entries(changes).forEach(([key, change]) => {
      if (change && Object.prototype.hasOwnProperty.call(change, "newValue")) patch[key] = change.newValue;
    });
    currentConfig = { ...currentConfig, ...patch };
    applyGallerySettings(currentConfig);
    rebuildActiveKeywordList(currentConfig);

    requestQueue.length = 0;
    queuedNos.clear();
    setupIntersectionObserver();
    refreshExistingItems();
    scheduleScan(document);
    scheduleRankRefresh();
  });

  function resetSourceWorkForNavigation() {
    const headNo = requestQueue[0] || "";
    pageToken = createPageToken();
    requestQueue.length = 0;
    queuedNos.clear();
    retryAfterByNo.clear();
    if (headNo) setAnalysisState(headNo, "off");
    activeNos.forEach((no) => setAnalysisState(no, "off"));
    registerSourcePageSession();
  }

  function isPaginationInteraction(target) {
    const control = target?.closest?.("a[href], button, [role='button']");
    if (!(control instanceof Element)) return false;

    const articleLink = control.closest?.('a[href*="id=dcbest"][href*="no="]');
    if (articleLink) return false;

    if (control.closest?.(".pagination, .paging, .page_num, .pageing, [class*='paging'], [class*='pagination'], [id*='paging']")) {
      return true;
    }

    if (control instanceof HTMLAnchorElement && control.href) {
      try {
        const url = new URL(control.href, location.href);
        return url.hostname === location.hostname
          && url.searchParams.has("page")
          && !url.searchParams.has("no");
      } catch (_) {}
    }

    return false;
  }

  document.addEventListener("pointerdown", (event) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    if (!isPaginationInteraction(event.target)) return;
    // 페이지네이션을 누르는 순간 이전 페이지의 분석 작업을 양보한다.
    // 실제 페이지 전환/AJAX 갱신은 DCInside 이벤트 핸들러가 그대로 처리한다.
    resetSourceWorkForNavigation();
  }, true);

  function applyLiveKeywordPatch(patch = {}) {
    currentConfig = { ...currentConfig, ...patch };
    rebuildActiveKeywordList(currentConfig);
    refreshExistingItems();
    scan(document);
    scheduleRankRefresh();
  }

  chrome.runtime?.onMessage?.addListener((message) => {
    if (message?.type === "DCB_KEYWORD_BLOCK_LIVE") {
      applyLiveKeywordPatch({
        keywordBlockEnabled: !!message.enabled,
        blockedKeywords: Array.isArray(message.blockedKeywords) ? message.blockedKeywords : [],
        keywordBlockTargets: message.targets || DEFAULTS.keywordBlockTargets
      });
      return;
    }

    if (message?.type === "DCB_KEYWORD_HIDE_LIVE") {
      applyLiveKeywordPatch({
        keywordHideEnabled: !!message.enabled,
        hiddenKeywords: Array.isArray(message.hiddenKeywords) ? message.hiddenKeywords : [],
        keywordHideTargets: message.targets || DEFAULTS.keywordHideTargets
      });
    }
  });

  // 메인/실베도 document_start부터 DOM을 따라가되 원출처 요청은 기존 단일 큐를 유지한다.
  void initialize();
})();

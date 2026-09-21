(() => {
  "use strict";
  if (globalThis.DCBListFilter) return;

  const matcher = globalThis.DCBKeywordMatcher;
  if (!matcher) return;
  const ROW_SELECTOR = "tr.ub-content,tr[data-no],tr.gall_tr,.gall_list tbody tr,tr:has(td.gall_tit),tr:has(td.gall_subject),.gall_list li.ub-content,li.gall_item,.gall_item";
  const POST_LINK_SELECTOR = "a[href*=\'/board/view\'][href*=\'no=\'],a[href*=\'/mgallery/board/view\'][href*=\'no=\'],a[href*=\'/mini/board/view\'][href*=\'no=\'],a[href*=\'/person/board/view\'][href*=\'no=\']";
  const MAIN_TITLE_SELECTOR = ".besttxt,.txt_box > strong.tit";
  const CANDIDATE_SELECTOR = `${ROW_SELECTOR},${MAIN_TITLE_SELECTOR}`;
  const HIDDEN_ATTR = "data-dcb-list-hidden";
  const SHADOW_ATTR = "data-dcb-list-placeholder-hidden";
  const DEFAULTS = {
    keywordBlockEnabled: false,
    blockedKeywords: [],
    keywordBlockTargets: { listTitle: true },
    galleryBlockEnabled: undefined,
    enabled: true,
    blockedIds: []
  };
  const pendingRoots = new Set();
  let settings = DEFAULTS;
  let keywords = [];
  let blockedIds = new Set();
  let timer = 0;
  let observer = null;

  function galleryLink(raw) {
    try {
      const url = new URL(raw, location.href);
      if (!/^https?:$/.test(url.protocol) || url.hostname !== "gall.dcinside.com") return null;
      if (!/^\/(?:mgallery\/|mini\/|person\/)?board\/(?:view|lists)\/?$/.test(url.pathname)) return null;
      const id = String(url.searchParams.get("id") || "").trim().toLowerCase();
      if (!/^[a-z0-9_-]{1,80}$/.test(id) || url.username || url.password || url.port) return null;
      const no = url.searchParams.get("no") || "";
      return { id, no: /^\d+$/.test(no) ? no : "", url: url.href };
    } catch (_) {
      return null;
    }
  }

  function titleText(node) {
    if (!node) return "";
    const copy = node.cloneNode(true);
    copy.querySelectorAll(".reply_numbox,.reply_num,.num,script,style,[data-dcb-keyword-soft-placeholder]").forEach((child) => child.remove());
    return copy.textContent.replace(/\s+/g, " ").trim();
  }

  function mainCard(candidate) {
    const box = candidate.matches?.(".besttxt,.txt_box")
      ? candidate
      : candidate.closest?.(".besttxt,.txt_box") || candidate.querySelector?.(".besttxt,.txt_box");
    const titleNode = box?.matches(".besttxt") ? box.querySelector("p,strong.tit") : box?.querySelector("strong.tit");
    const anchor = box?.closest("a[href]");
    const link = anchor && galleryLink(anchor.getAttribute("href"));
    const card = anchor?.parentElement;
    if (!box || !titleNode || !anchor || !link || link.id !== "dcbest" || !link.no || card?.tagName !== "LI") return null;
    return { element: card, titleNode, linkScope: anchor, surface: "main-best" };
  }

  function read(element) {
    if (!(element instanceof Element) || element.closest("[data-dcb-keyword-soft-placeholder],#dcb-preview-overlay")) return null;
    let titleNode;
    let linkScope;
    let surface;
    if (element.matches(ROW_SELECTOR)) {
      const postAnchor = element.querySelector(POST_LINK_SELECTOR);
      titleNode = element.querySelector(".gall_tit")
        || postAnchor?.closest("td,th,.subject,.title,.ub-word")
        || (element.matches("li.ub-content,li.gall_item,.gall_item")
          ? element.querySelector(".subject,.title,a[href*='/view']") : null)
        || postAnchor;
      if (!titleNode || (!postAnchor && element.matches(".gall_list tbody tr"))) return null;
      linkScope = titleNode;
      surface = "gallery";
    } else {
      const card = mainCard(element);
      if (!card) return null;
      ({ element, titleNode, linkScope, surface } = card);
    }

    const anchors = linkScope.matches("a[href]")
      ? [linkScope, ...linkScope.querySelectorAll("a[href]")]
      : [...linkScope.querySelectorAll("a[href]")];
    const links = anchors
      .map((anchor) => ({ ...(galleryLink(anchor.getAttribute("href")) || {}), name: anchor.textContent.trim() }))
      .filter((link) => link.id);
    const aggregationLink = links.find((link) => link.id === "dcbest" && link.no);
    if (aggregationLink && surface === "gallery") surface = "dcbest";
    const sources = links.filter((link) => link.id !== "dcbest");
    const sourceIds = new Set(sources.map((link) => link.id));
    const source = sourceIds.size === 1 ? sources[0] : null;
    const subject = surface === "gallery" || surface === "dcbest" ? titleText(element.querySelector(".gall_subject")) : "";
    return {
      element,
      title: `${subject} ${titleText(titleNode)}`.trim(),
      surface,
      sourceGalleryId: source?.id || null,
      sourceGalleryName: source?.name || null,
      sourceAmbiguous: sourceIds.size > 1,
      detailUrl: aggregationLink?.url || null,
      postNo: aggregationLink?.no || null
    };
  }

  function collect(root = document) {
    const elements = new Set();
    const scope = root?.nodeType === Node.TEXT_NODE ? root.parentElement : root;
    if (!scope?.querySelectorAll) return [];
    const add = (candidate) => {
      const entry = read(candidate);
      if (entry) elements.add(entry.element);
    };
    if (scope instanceof Element) {
      const enclosing = scope.closest(ROW_SELECTOR)
        || scope.closest(".besttxt,.txt_box")
        || scope.closest("li")?.querySelector(MAIN_TITLE_SELECTOR);
      if (enclosing) add(enclosing);
      if (scope.matches(CANDIDATE_SELECTOR)) add(scope);
    }
    scope.querySelectorAll(CANDIDATE_SELECTOR).forEach(add);
    return [...elements];
  }

  function galleryEnabled() {
    return typeof settings.galleryBlockEnabled === "boolean" ? settings.galleryBlockEnabled : !!settings.enabled;
  }

  function blockedGalleryId(value) {
    const text = String(value || "").trim().toLowerCase();
    if (/^[a-z0-9_-]{1,80}$/.test(text)) return text;
    if (/^id=[a-z0-9_-]{1,80}$/.test(text)) return text.slice(3);
    return galleryLink(text)?.id || "";
  }

  function setHidden(element, category, keyword = null) {
    const previous = element.getAttribute(HIDDEN_ATTR);
    if (category) {
      if (previous !== category) element.setAttribute(HIDDEN_ATTR, category);
      if (keyword) element.setAttribute("data-dcb-list-keyword", keyword.label);
      else element.removeAttribute("data-dcb-list-keyword");
      globalThis.DCBBlockStats?.report?.(element, category);
    } else {
      element.removeAttribute(HIDDEN_ATTR);
      element.removeAttribute("data-dcb-list-keyword");
    }
    const id = element.getAttribute("data-dcb-keyword-soft-id");
    const placeholder = element.previousElementSibling;
    if (id && placeholder?.getAttribute("data-dcb-soft-for") === id) {
      if (category) placeholder.setAttribute(SHADOW_ATTR, "1");
      else placeholder.removeAttribute(SHADOW_ATTR);
    }
    if (previous !== element.getAttribute(HIDDEN_ATTR)) {
      element.dispatchEvent(new CustomEvent("dcb:list-filter-change", { bubbles: true }));
    }
  }

  function evaluate(element) {
    const entry = read(element);
    if (!entry || !entry.element.isConnected) {
      if (element?.hasAttribute?.(HIDDEN_ATTR)) setHidden(element, null);
      return;
    }
    element = entry.element;
    const keyword = settings.keywordBlockEnabled && settings.keywordBlockTargets?.listTitle !== false
      ? matcher.findKeyword(entry.title, keywords) : null;
    if (keyword) {
      setHidden(element, "keywords", keyword);
      return;
    }
    // Do not fetch detail pages to infer an unknown source. This prevents the
    // list filter from adding server load or triggering DCinside soft bans.
    const sourceId = !entry.sourceAmbiguous ? entry.sourceGalleryId : null;
    setHidden(element, galleryEnabled() && blockedIds.size && sourceId && blockedIds.has(sourceId) ? "galleries" : null);
  }

  function processPending() {
    timer = 0;
    const roots = [...pendingRoots];
    pendingRoots.clear();
    const entries = new Set();
    for (const root of roots) {
      if (root !== document && !root.isConnected) continue;
      if (roots.some((other) => other !== root && other.contains?.(root))) continue;
      collect(root).forEach((entry) => entries.add(entry));
    }
    entries.forEach(evaluate);
  }

  function schedule(root) {
    if (root) pendingRoots.add(root);
    if (timer || !pendingRoots.size) return;

    // DCinside builds list rows in several small DOM mutations. Running a full
    // filter pass in a microtask for every burst competes with the site's own
    // first paint. Yield one frame so those mutations can be coalesced.
    if (typeof requestAnimationFrame === "function") {
      timer = requestAnimationFrame(processPending);
    } else {
      timer = setTimeout(processPending, 32);
    }
  }

  function filterActive() {
    const keywordActive = settings.keywordBlockEnabled
      && settings.keywordBlockTargets?.listTitle !== false
      && keywords.length > 0;
    const galleryActive = galleryEnabled() && blockedIds.size > 0;
    return keywordActive || galleryActive;
  }

  function clearOwnHides() {
    document.querySelectorAll(`[${HIDDEN_ATTR}]`).forEach((element) => setHidden(element, null));
    document.querySelectorAll(`[${SHADOW_ATTR}]`).forEach((element) => element.removeAttribute(SHADOW_ATTR));
    pendingRoots.clear();
  }

  function startObserver() {
    if (observer || !filterActive()) return;
    const root = document.documentElement || document;
    if (!root) return;

    observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        const target = mutation.target.nodeType === Node.TEXT_NODE ? mutation.target.parentElement : mutation.target;
        if (target?.closest?.("[data-dcb-keyword-soft-placeholder],#dcb-list-filter-style")) continue;
        if (mutation.type === "childList") {
          mutation.addedNodes.forEach((node) => schedule(node));
          const entry = target?.closest?.(ROW_SELECTOR)
            || target?.closest?.(".besttxt,.txt_box")
            || target?.closest?.("li")?.querySelector(MAIN_TITLE_SELECTOR);
          if (entry) schedule(entry);
        } else schedule(target);
      }
    });

    observer.observe(root, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["href", "data-no"]
    });
  }

  function stopObserver() {
    if (!observer) return;
    observer.disconnect();
    observer = null;
  }

  function syncObserver() {
    if (filterActive()) {
      startObserver();
      schedule(document);
    } else {
      stopObserver();
      clearOwnHides();
    }
  }

  function applyKeywordHotSettings(config = {}) {
    settings = {
      ...settings,
      keywordBlockEnabled: !!config.keywordBlockEnabled,
      blockedKeywords: Array.isArray(config.blockedKeywords) ? config.blockedKeywords : [],
      keywordBlockTargets: {
        ...(settings.keywordBlockTargets || DEFAULTS.keywordBlockTargets),
        ...(config.keywordBlockTargets || {})
      }
    };
    keywords = matcher.prepareKeywords(settings.blockedKeywords);
    syncObserver();
  }

  function loadSettings() {
    chrome.storage.sync.get(DEFAULTS, (config) => {
      settings = config;
      keywords = matcher.prepareKeywords(config.blockedKeywords);
      blockedIds = new Set((Array.isArray(config.blockedIds) ? config.blockedIds : []).map(blockedGalleryId).filter(Boolean));
      syncObserver();
    });
  }

  function start() {
    if (!document.getElementById("dcb-list-filter-style")) {
      const style = document.createElement("style");
      style.id = "dcb-list-filter-style";
      style.textContent = `[${HIDDEN_ATTR}],[${SHADOW_ATTR}="1"]{display:none!important}`;
      (document.head || document.documentElement).appendChild(style);
    }
    globalThis.DCBBlockStats?.registerSelector?.("list-filter-keywords", `[${HIDDEN_ATTR}="keywords"]`, "keywords");
    globalThis.DCBBlockStats?.registerSelector?.("list-filter-galleries", `[${HIDDEN_ATTR}="galleries"]`, "galleries");
    const hotCache = globalThis.DCBKeywordSettingsHotCache;
    hotCache?.subscribe?.((config) => applyKeywordHotSettings(config));
    loadSettings();
  }

  globalThis.DCBListFilter = Object.freeze({ collect, read, evaluate, selector: CANDIDATE_SELECTOR });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "sync" && Object.keys(DEFAULTS).some((key) => key in changes)) loadSettings();
  });

  chrome.runtime?.onMessage?.addListener((message) => {
    if (message?.type !== "DCB_KEYWORD_BLOCK_LIVE") return;

    settings = {
      ...settings,
      keywordBlockEnabled: !!message.enabled,
      blockedKeywords: Array.isArray(message.blockedKeywords) ? message.blockedKeywords : [],
      keywordBlockTargets: {
        ...(settings.keywordBlockTargets || DEFAULTS.keywordBlockTargets),
        ...(message.targets || {})
      }
    };
    keywords = matcher.prepareKeywords(settings.blockedKeywords);
    syncObserver();
  });

  // Register immediately, then enable DOM observation only after settings show
  // that list filtering is actually active.
  start();
})();

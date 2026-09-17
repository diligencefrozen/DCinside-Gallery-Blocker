// keywordHider.js

(() => {
  if (window.__DCB_KEYWORD_HIDER_LOADED__) return;
  window.__DCB_KEYWORD_HIDER_LOADED__ = true;

  const STYLE_ID = "dcb-keyword-hide-style";
  const HIDDEN_ATTR = "data-dcb-keyword-soft-hidden";
  const PLACEHOLDER_ATTR = "data-dcb-keyword-soft-placeholder";
  const ITEM_ID_ATTR = "data-dcb-keyword-soft-id";
  const MATCH_ATTR = "data-dcb-keyword-soft-match";
  const EXTRA_FOR_ATTR = "data-dcb-keyword-soft-extra-for";
  const ANONYMOUS_HIDDEN_CLASS = "dcb-anonymous-hidden";
  const ALLOW_SESSION_KEY = `dcb-keyword-soft-allow:${location.pathname}${location.search}`;
  const listFilter = globalThis.DCBListFilter;

  const COMMENT_ITEM_SELECTOR = [
    "#focus_cmt li.ub-content",
    ".cmt_list li.ub-content",
    ".comment_wrap li.ub-content",
    "li[id^='comment_li_']",
    "li[id^='reply_li_']",
    ".comment_box li.ub-content",
    ".reply_box li.ub-content",
    ".dccon_comment_box li.ub-content"
  ].join(",");

  const DEFAULTS = {
    keywordHideEnabled: false,
    hiddenKeywords: [],
    keywordHideTargets: {
      listTitle: true,
      viewTitle: true,
      viewBody: true,
      comments: true
    }
  };

  let enabled = false;
  let keywords = [];
  let targets = { ...DEFAULTS.keywordHideTargets };
  let observer = null;
  let scheduled = false;
  let suppressObserver = false;
  const pendingRoots = new Set();
  let nextSoftId = 1;
  let allowedKeys = loadAllowedKeys();

  const { normalizeText, prepareKeywords } = globalThis.DCBKeywordMatcher;

  function escapeHtml(value) {
    return String(value || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function cssEscape(value) {
    if (window.CSS && typeof window.CSS.escape === "function") {
      return window.CSS.escape(String(value));
    }

    return String(value).replace(/[^a-zA-Z0-9_-]/g, "\\$&");
  }

  function loadAllowedKeys() {
    try {
      const raw = sessionStorage.getItem(ALLOW_SESSION_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return new Set(Array.isArray(parsed) ? parsed : []);
    } catch {
      return new Set();
    }
  }

  function saveAllowedKeys() {
    try {
      sessionStorage.setItem(ALLOW_SESSION_KEY, JSON.stringify(Array.from(allowedKeys)));
    } catch {}
  }

  function runWithoutObserver(fn) {
    suppressObserver = true;

    try {
      return fn();
    } finally {
      setTimeout(() => {
        suppressObserver = false;
      }, 0);
    }
  }

  function findKeyword(text) {
    return globalThis.DCBKeywordMatcher.findKeyword(text, keywords);
  }

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;

    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      [${HIDDEN_ATTR}="1"] {
        display: none !important;
      }

      .dcb-keyword-soft-box,
      tr.dcb-keyword-soft-row > td {
        box-sizing: border-box !important;
        margin: 8px 0 !important;
        padding: 10px 12px !important;
        border: 1px solid rgba(79, 124, 255, .34) !important;
        border-radius: 10px !important;
        background: rgba(79, 124, 255, .08) !important;
        color: #dbeafe !important;
        font-size: 13px !important;
        line-height: 1.45 !important;
      }

      tr.dcb-keyword-soft-row > td {
        border-radius: 0 !important;
      }

      .dcb-keyword-soft-title {
        display: inline-block !important;
        margin-right: 8px !important;
        color: #93c5fd !important;
        font-weight: 800 !important;
      }

      .dcb-keyword-soft-chip {
        display: inline-flex !important;
        max-width: 220px !important;
        vertical-align: middle !important;
        margin-left: 4px !important;
        padding: 2px 7px !important;
        border-radius: 999px !important;
        background: rgba(147, 197, 253, .14) !important;
        border: 1px solid rgba(147, 197, 253, .28) !important;
        color: #bfdbfe !important;
        font-size: 11px !important;
        white-space: nowrap !important;
        overflow: hidden !important;
        text-overflow: ellipsis !important;
      }

      .dcb-keyword-soft-btn {
        appearance: none !important;
        margin-left: 8px !important;
        padding: 4px 9px !important;
        border: 1px solid rgba(147, 197, 253, .46) !important;
        border-radius: 8px !important;
        background: rgba(37, 99, 235, .26) !important;
        color: #eff6ff !important;
        font-size: 12px !important;
        font-weight: 800 !important;
        cursor: pointer !important;
      }

      .dcb-keyword-soft-btn:hover {
        background: rgba(37, 99, 235, .44) !important;
      }
    `;

    (document.head || document.documentElement).appendChild(style);
  }

  function clearSoftHides() {
    runWithoutObserver(() => {
      document.querySelectorAll(`[${HIDDEN_ATTR}="1"]`).forEach((element) => {
        element.removeAttribute(HIDDEN_ATTR);
        element.removeAttribute(MATCH_ATTR);
        element.removeAttribute(EXTRA_FOR_ATTR);
      });

      document.querySelectorAll(`[${EXTRA_FOR_ATTR}]`).forEach((element) => {
        element.removeAttribute(HIDDEN_ATTR);
        element.removeAttribute(EXTRA_FOR_ATTR);
      });

      document.querySelectorAll(`[${PLACEHOLDER_ATTR}="1"]`).forEach((element) => element.remove());
    });
  }

  function getSoftId(element) {
    if (!element || element.nodeType !== 1) return "";

    let id = element.getAttribute(ITEM_ID_ATTR);
    if (!id) {
      id = `soft-${Date.now().toString(36)}-${nextSoftId++}`;
      element.setAttribute(ITEM_ID_ATTR, id);
    }

    return id;
  }

  function isBlockedByAnonymousFilter(element) {
    return !!element?.closest?.(`.${ANONYMOUS_HIDDEN_CLASS}`);
  }

  function getPostNoFromUrl() {
    try {
      return new URLSearchParams(location.search).get("no") || "";
    } catch {
      return "";
    }
  }

  function isDcbestPage() {
    try {
      const url = new URL(location.href);
      return /^\/board\/(?:lists|view)\/?$/i.test(url.pathname)
        && String(url.searchParams.get("id") || "").toLowerCase() === "dcbest";
    } catch {
      return false;
    }
  }

  function isDcbestPostListRow(row) {
    if (!isDcbestPage() || !(row instanceof Element) || row.tagName !== "TR") return false;

    const link = row.querySelector('a[href*="id=dcbest"][href*="no="]:not(.reply_numbox)');
    if (!link) return false;

    try {
      const url = new URL(link.getAttribute("href") || link.href || "", location.href);
      return url.hostname === "gall.dcinside.com"
        && /^\/board\/view\/?$/i.test(url.pathname)
        && String(url.searchParams.get("id") || "").toLowerCase() === "dcbest"
        && /^\d{1,12}$/.test(String(url.searchParams.get("no") || ""));
    } catch {
      return false;
    }
  }

  function clearListSoftHideArtifacts(row) {
    if (!(row instanceof Element)) return;

    const id = row.getAttribute(ITEM_ID_ATTR) || "";
    if (id) {
      const previous = row.previousElementSibling;
      if (previous?.getAttribute(PLACEHOLDER_ATTR) === "1"
        && previous.getAttribute("data-dcb-soft-for") === id) {
        previous.remove();
      }
      document.querySelectorAll(`[${PLACEHOLDER_ATTR}="1"][data-dcb-soft-for="${cssEscape(id)}"]`)
        .forEach((placeholder) => placeholder.remove());
    }

    row.removeAttribute(HIDDEN_ATTR);
    row.removeAttribute(MATCH_ATTR);
    row.removeAttribute(ITEM_ID_ATTR);
  }

  function getListRows() {
    return listFilter.collect(document);
  }

  function getListRowText(row) {
    return listFilter.read(row)?.title || "";
  }

  function getListKey(row, keyword) {
    const no = row.getAttribute("data-no") || row.querySelector(".gall_num")?.textContent?.trim() || "";
    const href = listFilter.read(row)?.detailUrl || row.querySelector(".gall_tit a[href]")?.getAttribute("href") || "";
    const fallback = normalizeText(getListRowText(row)).slice(0, 120);

    return `list:${keyword.needle}:${no || href || fallback}`;
  }

  function insertListPlaceholder(row, keyword, key) {
    if (!row) return;

    const id = getSoftId(row);
    if (document.querySelector(`[${PLACEHOLDER_ATTR}="1"][data-dcb-soft-for="${cssEscape(id)}"]`)) return;

    const tableRow = row.tagName === "TR";
    const colSpan = Math.max(row.children.length || 1, 1);
    const placeholder = document.createElement(tableRow ? "tr" : row.tagName === "LI" ? "li" : "div");
    placeholder.className = tableRow
      ? "dcb-keyword-soft-row"
      : "dcb-keyword-soft-box dcb-keyword-soft-list-item";
    placeholder.setAttribute(PLACEHOLDER_ATTR, "1");
    placeholder.dataset.dcbSoftFor = id;
    placeholder.dataset.dcbSoftKey = key;
    const content = `
        <span class="dcb-keyword-soft-title">차단 키워드가 포함된 게시글</span>
        <span class="dcb-keyword-soft-chip" title="${escapeHtml(keyword.label)}">${escapeHtml(keyword.label)}</span>
        <button type="button" class="dcb-keyword-soft-btn" data-dcb-soft-action="show">계속 보기</button>
    `;
    placeholder.innerHTML = tableRow ? `<td colspan="${colSpan}">${content}</td>` : content;

    row.parentNode?.insertBefore(placeholder, row);
  }

  function hideElementWithBox(element, keyword, key, label, extraElements = []) {
    if (!element || allowedKeys.has(key) || isBlockedByAnonymousFilter(element)) return;

    const id = getSoftId(element);
    if (document.querySelector(`[${PLACEHOLDER_ATTR}="1"][data-dcb-soft-for="${cssEscape(id)}"]`)) {
      element.setAttribute(HIDDEN_ATTR, "1");
      element.setAttribute(MATCH_ATTR, keyword.label);
      globalThis.DCBBlockStats?.report?.(element, "keywords");

      extraElements.forEach((extra) => {
        if (!extra) return;
        extra.setAttribute(HIDDEN_ATTR, "1");
        extra.setAttribute(EXTRA_FOR_ATTR, id);
      });

      return;
    }

    const placeholder = document.createElement(element.tagName === "LI" ? "li" : "div");
    placeholder.className = "dcb-keyword-soft-box";
    placeholder.setAttribute(PLACEHOLDER_ATTR, "1");
    placeholder.dataset.dcbSoftFor = id;
    placeholder.dataset.dcbSoftKey = key;
    placeholder.innerHTML = `
      <span class="dcb-keyword-soft-title">${escapeHtml(label)}</span>
      <span class="dcb-keyword-soft-chip" title="${escapeHtml(keyword.label)}">${escapeHtml(keyword.label)}</span>
      <button type="button" class="dcb-keyword-soft-btn" data-dcb-soft-action="show">계속 보기</button>
    `;

    element.parentNode?.insertBefore(placeholder, element);
    element.setAttribute(HIDDEN_ATTR, "1");
    element.setAttribute(MATCH_ATTR, keyword.label);
    globalThis.DCBBlockStats?.report?.(element, "keywords");

    extraElements.forEach((extra) => {
      if (!extra) return;
      extra.setAttribute(HIDDEN_ATTR, "1");
      extra.setAttribute(EXTRA_FOR_ATTR, id);
    });
  }

  function hideListRows() {
    if (!targets.listTitle) return;

    getListRows().forEach(hideListRow);
  }

  function getArticleTitleText() {
    const selectors = [
      ".title_subject",
      "h3.title",
      ".gallview_head .title",
      ".view_head .title"
    ];

    return selectors
      .map((selector) => document.querySelector(selector)?.innerText || "")
      .filter(Boolean)
      .join(" ");
  }

  function getArticleBodyNode() {
    return document.querySelector(".write_div") ||
      document.querySelector(".writing_view_box") ||
      document.querySelector(".write_view") ||
      document.querySelector("#dgn_content_de");
  }

  function getArticleBodyText() {
    const body = getArticleBodyNode();
    return body?.innerText || "";
  }

  function hideArticleIfNeeded() {
    const bodyNode = getArticleBodyNode();
    if (!bodyNode) return;

    let matched = null;
    let source = "";

    if (targets.viewTitle) {
      matched = findKeyword(getArticleTitleText());
      source = "title";
    }

    if (!matched && targets.viewBody) {
      matched = findKeyword(getArticleBodyText());
      source = "body";
    }

    if (!matched) return;

    const postNo = getPostNoFromUrl();
    const key = `article:${postNo || location.href}:${source}:${matched.needle}`;
    hideElementWithBox(bodyNode, matched, key, "차단 키워드가 포함된 게시글 본문");
  }

  function getCommentCandidates() {
    return Array.from(document.querySelectorAll(COMMENT_ITEM_SELECTOR))
      .filter((element, index, array) => array.indexOf(element) === index)
      .filter((element) => !element.closest(".write_div"))
      .filter((element) => !element.closest(`[${PLACEHOLDER_ATTR}="1"]`))
      .filter((element) => !element.hasAttribute(PLACEHOLDER_ATTR))
      .filter((element) => element.id !== "comment_li_0")
      .filter((element) => !element.classList.contains("dory"));
  }

  function getCommentText(element) {
    const selectors = [
      ".usertxt",
      ".comment",
      ".cmt_txt",
      ".cmt_txtbox",
      ".reply_txt",
      ".txt",
      ".nickname",
      ".ip"
    ];

    const text = selectors
      .map((selector) => element.querySelector(selector)?.innerText || "")
      .filter(Boolean)
      .join(" ");

    return text || element.innerText || "";
  }

  function getCommentKey(element, keyword) {
    const id = element.id || "";
    const no = element.querySelector(".cmt_info, .reply_info")?.getAttribute("data-no") ||
      element.getAttribute("data-no") ||
      "";
    const fallback = normalizeText(getCommentText(element)).slice(0, 120);

    return `comment:${keyword.needle}:${id || no || fallback}`;
  }

  function getReplyContainerForParentComment(element) {
    if (!element || !/^comment_li_\d+$/.test(element.id || "")) return null;

    const commentNo = element.id.replace("comment_li_", "");
    const next = element.nextElementSibling;
    if (!next) return null;

    if (next.querySelector(`#reply_list_${cssEscape(commentNo)}`)) return next;
    if (next.querySelector(`.reply_list[p-no="${cssEscape(commentNo)}"]`)) return next;

    return null;
  }

  function hideComments() {
    if (!targets.comments) return;

    getCommentCandidates().forEach((element) => {
      const keyword = findKeyword(getCommentText(element));
      if (!keyword) return;

      const key = getCommentKey(element, keyword);
      const replyContainer = getReplyContainerForParentComment(element);
      const extras = replyContainer ? [replyContainer] : [];

      hideElementWithBox(element, keyword, key, "차단 키워드가 포함된 댓글", extras);
    });
  }

  function applyKeywordHide({ reset = false } = {}) {
    scheduled = false;

    if (!enabled || !keywords.length) {
      clearSoftHides();
      pendingRoots.clear();
      return;
    }

    ensureStyle();
    if (reset) clearSoftHides();
    hideListRows();
    hideArticleIfNeeded();
    hideComments();
    pendingRoots.clear();
  }

  function collectScoped(scope, selector) {
    const out = [];
    if (!scope) return out;
    const element = scope.nodeType === Node.ELEMENT_NODE ? scope : scope.parentElement;
    if (!element) return out;
    const closest = element.closest?.(selector);
    if (closest) out.push(closest);
    if (element.matches?.(selector)) out.push(element);
    element.querySelectorAll?.(selector).forEach((node) => out.push(node));
    return out.filter((node, index, list) => list.indexOf(node) === index);
  }

  function hideListRow(row) {
    if (!targets.listTitle || !row || row.hasAttribute(PLACEHOLDER_ATTR) || isBlockedByAnonymousFilter(row)) return;

    // 실베의 게시글 <tr>은 목록 페이지와 상세 하단 목록 모두 dcbest-source-filter가 담당한다.
    // keyword-hider가 먼저 soft-hide하면 행이 display:none이 되어 원출처 IntersectionObserver가
    // 분석을 시작하지 못하므로, 이 경로에서는 placeholder를 만들지 않고 전권을 넘긴다.
    // 댓글은 <tr>이 아니므로 기존 "이번만 보기" soft-hide UI를 그대로 유지한다.
    if (isDcbestPostListRow(row)) {
      clearListSoftHideArtifacts(row);
      return;
    }

    const keyword = findKeyword(getListRowText(row));
    const key = keyword ? getListKey(row, keyword) : "";
    const id = row.getAttribute(ITEM_ID_ATTR);
    const placeholder = row.previousElementSibling;
    const ownPlaceholder = id && placeholder?.getAttribute("data-dcb-soft-for") === id ? placeholder : null;
    if (!keyword || allowedKeys.has(key) || row.hasAttribute("data-dcb-list-hidden")) {
      row.removeAttribute(HIDDEN_ATTR);
      row.removeAttribute(MATCH_ATTR);
      ownPlaceholder?.remove();
      return;
    }
    if (ownPlaceholder && ownPlaceholder.dataset.dcbSoftKey !== key) ownPlaceholder.remove();
    row.setAttribute(HIDDEN_ATTR, "1");
    row.setAttribute(MATCH_ATTR, keyword.label);
    globalThis.DCBBlockStats?.report?.(row, "keywords");
    insertListPlaceholder(row, keyword, key);
  }

  function hideComment(element) {
    if (!targets.comments || !element || element.hasAttribute(PLACEHOLDER_ATTR) || element.closest(`[${PLACEHOLDER_ATTR}="1"]`)) return;
    if (element.id === "comment_li_0" || element.classList.contains("dory")) return;
    const keyword = findKeyword(getCommentText(element));
    if (!keyword) return;
    const key = getCommentKey(element, keyword);
    const replyContainer = getReplyContainerForParentComment(element);
    hideElementWithBox(element, keyword, key, "차단 키워드가 포함된 댓글", replyContainer ? [replyContainer] : []);
  }

  function processPendingRoots() {
    scheduled = false;
    if (!enabled || !keywords.length) {
      pendingRoots.clear();
      return;
    }

    const roots = [...new Set(Array.from(pendingRoots, root => root?.nodeType === Node.TEXT_NODE ? root.parentElement : root))]
      .filter((root) => root && root.isConnected !== false);
    pendingRoots.clear();
    const minimal = roots.filter(root => !roots.some(other => other !== root && other.contains?.(root)));

    const rows = new Set();
    const comments = new Set();
    let articleTouched = false;
    for (const root of minimal) {
      listFilter.collect(root).forEach((node) => rows.add(node));
      collectScoped(root, COMMENT_ITEM_SELECTOR).forEach((node) => comments.add(node));
      const element = root?.nodeType === Node.ELEMENT_NODE ? root : root?.parentElement;
      if (element?.closest?.(".write_div,.writing_view_box,.write_view,#dgn_content_de,.gallview_head,.view_head") ||
          element?.querySelector?.(".write_div,.writing_view_box,.write_view,#dgn_content_de,.gallview_head,.view_head")) {
        articleTouched = true;
      }
    }

    rows.forEach(hideListRow);
    comments.forEach(hideComment);
    if (articleTouched) hideArticleIfNeeded();
  }

  function scheduleApply(root = document) {
    const validRoot = root === document || root?.nodeType === Node.ELEMENT_NODE || root?.nodeType === Node.TEXT_NODE || root?.nodeType === Node.DOCUMENT_FRAGMENT_NODE;
    if (validRoot) pendingRoots.add(root);
    if (scheduled) return;
    scheduled = true;
    const flush = () => {
      if (pendingRoots.has(document)) applyKeywordHide();
      else processPendingRoots();
    };
    if (typeof queueMicrotask === "function") queueMicrotask(flush);
    else Promise.resolve().then(flush);
  }

  function handleShowClick(event) {
    const button = event.target.closest("[data-dcb-soft-action='show']");
    if (!button) return;

    const placeholder = button.closest(`[${PLACEHOLDER_ATTR}="1"]`);
    if (!placeholder) return;

    event.preventDefault();
    event.stopPropagation();

    const key = placeholder.dataset.dcbSoftKey || "";
    const id = placeholder.dataset.dcbSoftFor || "";
    const target = id
      ? document.querySelector(`[${ITEM_ID_ATTR}="${cssEscape(id)}"]`)
      : null;

    if (key && target && !isBlockedByAnonymousFilter(target)) {
      allowedKeys.add(key);
      saveAllowedKeys();
    }

    runWithoutObserver(() => {
      if (id) {
        if (target) {
          target.removeAttribute(HIDDEN_ATTR);
          target.removeAttribute(MATCH_ATTR);
        }

        document.querySelectorAll(`[${EXTRA_FOR_ATTR}="${cssEscape(id)}"]`).forEach((extra) => {
          extra.removeAttribute(HIDDEN_ATTR);
          extra.removeAttribute(EXTRA_FOR_ATTR);
        });
      }

      placeholder.remove();
    });
  }

  function mutationBelongsToSoftUi(mutations) {
    return mutations.every((mutation) => {
      const target =
        mutation.target && mutation.target.nodeType === 1
          ? mutation.target
          : mutation.target?.parentElement;

      if (!target || !target.closest) return false;
      if (target.closest(`[${PLACEHOLDER_ATTR}="1"]`)) return true;

      return mutation.type === "childList" && mutation.addedNodes.length > 0 && mutation.removedNodes.length === 0 && Array.from(mutation.addedNodes).every((node) => {
        if (!node || node.nodeType !== 1 || !node.closest) return !node?.textContent?.trim();
        return !!node.closest(`[${PLACEHOLDER_ATTR}="1"]`);
      });
    });
  }

  function startObserver() {
    if (observer) return;

    const root = document.documentElement || document;
    if (!root) return;

    observer = new MutationObserver((mutations) => {
      const anonymousVisibilityChanged = mutations.some((mutation) => {
        if (mutation.type !== "attributes" || mutation.attributeName !== "class") return false;
        const current = mutation.target?.classList?.contains(ANONYMOUS_HIDDEN_CLASS);
        const previous = String(mutation.oldValue || "").split(/\s+/).includes(ANONYMOUS_HIDDEN_CLASS);
        return current !== previous;
      });
      if (suppressObserver && !anonymousVisibilityChanged) return;

      const contentMutations = mutations.filter((mutation) => mutation.type !== "attributes");
      if (!anonymousVisibilityChanged) {
        if (!contentMutations.length || mutationBelongsToSoftUi(contentMutations)) return;
      }

      if (anonymousVisibilityChanged) {
        // 익명 차단과의 우선순위가 바뀌는 경우는 드물므로 전체 상태를 한 번 맞춘다.
        scheduleApply(document);
        return;
      }

      for (const mutation of contentMutations) {
        if (mutation.type === "childList") {
          mutation.addedNodes.forEach((node) => {
            if (node?.nodeType === Node.ELEMENT_NODE || node?.nodeType === Node.TEXT_NODE) pendingRoots.add(node);
          });
          const target = mutation.target;
          if (target?.closest?.(`${listFilter.selector},${COMMENT_ITEM_SELECTOR}`)) pendingRoots.add(target);
        } else if (mutation.type === "characterData") {
          pendingRoots.add(mutation.target);
        }
      }
      if (pendingRoots.size) scheduleApply(null);
    });

    observer.observe(root, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeOldValue: true,
      attributeFilter: ["class"]
    });
  }

  function stopObserver() {
    if (!observer) return;

    observer.disconnect();
    observer = null;
  }

  function applySettings(config = {}) {
    enabled = !!config.keywordHideEnabled;
    keywords = prepareKeywords(config.hiddenKeywords);
    targets = {
      ...DEFAULTS.keywordHideTargets,
      ...(config.keywordHideTargets || {})
    };

    if (enabled && keywords.length) startObserver();
    else stopObserver();

    applyKeywordHide({ reset: true });
  }

  function loadSettingsAndApply() {
    const hotCache = globalThis.DCBKeywordSettingsHotCache;
    if (hotCache?.subscribe) {
      hotCache.subscribe((config) => applySettings({ ...DEFAULTS, ...(config || {}) }));
      return;
    }
    if (!chrome?.storage?.sync) return;
    chrome.storage.sync.get(DEFAULTS, (config) => applySettings(config));
  }

  if (chrome?.storage?.onChanged) {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "sync") return;
      if (!changes.keywordHideEnabled && !changes.hiddenKeywords && !changes.keywordHideTargets) return;

      if (changes.keywordHideEnabled) enabled = !!changes.keywordHideEnabled.newValue;
      if (changes.hiddenKeywords) keywords = prepareKeywords(changes.hiddenKeywords.newValue);
      if (changes.keywordHideTargets) {
        targets = {
          ...DEFAULTS.keywordHideTargets,
          ...(changes.keywordHideTargets.newValue || {})
        };
      }

      if (enabled && keywords.length) startObserver();
      else stopObserver();
      applyKeywordHide({ reset: true });
    });
  }

  chrome.runtime?.onMessage?.addListener((message) => {
    if (message?.type !== "DCB_KEYWORD_HIDE_LIVE") return;

    applySettings({
      keywordHideEnabled: message.enabled,
      hiddenKeywords: message.hiddenKeywords,
      keywordHideTargets: message.targets
    });
  });

  document.addEventListener("click", handleShowClick, true);
  document.addEventListener("dcb:list-filter-change", event => {
    if (enabled && targets.listTitle) scheduleApply(event.target);
  });

  startObserver();
  loadSettingsAndApply();

  window.addEventListener("load", () => scheduleApply(document), { once: true });
})();

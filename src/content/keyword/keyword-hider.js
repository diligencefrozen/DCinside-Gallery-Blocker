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
  const ALLOW_SESSION_KEY = `dcb-keyword-soft-allow:${location.pathname}${location.search}`;

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
  let nextSoftId = 1;
  let allowedKeys = loadAllowedKeys();

  function normalizeText(value) {
    return String(value || "")
      .normalize("NFKC")
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim();
  }

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

  function prepareKeywords(list) {
    if (!Array.isArray(list)) return [];

    const seen = new Set();
    const prepared = [];

    list.forEach((raw) => {
      const label = String(raw || "").normalize("NFKC").trim();
      const needle = normalizeText(label);

      if (!label || !needle || seen.has(needle)) return;

      seen.add(needle);
      prepared.push({ label, needle });
    });

    return prepared;
  }

  function findKeyword(text) {
    const haystack = normalizeText(text);
    if (!haystack) return null;

    return keywords.find((keyword) => haystack.includes(keyword.needle)) || null;
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

  function getPostNoFromUrl() {
    try {
      return new URLSearchParams(location.search).get("no") || "";
    } catch {
      return "";
    }
  }

  function getListRows() {
    return Array.from(document.querySelectorAll("tr.ub-content"))
      .filter((row) => !row.hasAttribute(PLACEHOLDER_ATTR));
  }

  function getListRowText(row) {
    const title = row.querySelector(".gall_tit")?.innerText || "";
    const subject = row.querySelector(".gall_subject")?.innerText || "";
    return `${subject} ${title}`;
  }

  function getListKey(row, keyword) {
    const no = row.getAttribute("data-no") || row.querySelector(".gall_num")?.textContent?.trim() || "";
    const href = row.querySelector(".gall_tit a[href]")?.getAttribute("href") || "";
    const fallback = normalizeText(getListRowText(row)).slice(0, 120);

    return `list:${keyword.needle}:${no || href || fallback}`;
  }

  function insertListPlaceholder(row, keyword, key) {
    if (!row) return;

    const id = getSoftId(row);
    if (document.querySelector(`[${PLACEHOLDER_ATTR}="1"][data-dcb-soft-for="${cssEscape(id)}"]`)) return;

    const colSpan = Math.max(row.children.length || 1, 1);
    const placeholder = document.createElement("tr");
    placeholder.className = "dcb-keyword-soft-row";
    placeholder.setAttribute(PLACEHOLDER_ATTR, "1");
    placeholder.dataset.dcbSoftFor = id;
    placeholder.dataset.dcbSoftKey = key;
    placeholder.innerHTML = `
      <td colspan="${colSpan}">
        <span class="dcb-keyword-soft-title">차단 키워드가 포함된 게시글</span>
        <span class="dcb-keyword-soft-chip" title="${escapeHtml(keyword.label)}">${escapeHtml(keyword.label)}</span>
        <button type="button" class="dcb-keyword-soft-btn" data-dcb-soft-action="show">계속 보기</button>
      </td>
    `;

    row.parentNode?.insertBefore(placeholder, row);
  }

  function hideElementWithBox(element, keyword, key, label, extraElements = []) {
    if (!element || allowedKeys.has(key)) return;

    const id = getSoftId(element);
    if (document.querySelector(`[${PLACEHOLDER_ATTR}="1"][data-dcb-soft-for="${cssEscape(id)}"]`)) {
      element.setAttribute(HIDDEN_ATTR, "1");
      element.setAttribute(MATCH_ATTR, keyword.label);

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

    extraElements.forEach((extra) => {
      if (!extra) return;
      extra.setAttribute(HIDDEN_ATTR, "1");
      extra.setAttribute(EXTRA_FOR_ATTR, id);
    });
  }

  function hideListRows() {
    if (!targets.listTitle) return;

    getListRows().forEach((row) => {
      const keyword = findKeyword(getListRowText(row));
      if (!keyword) return;

      const key = getListKey(row, keyword);
      if (allowedKeys.has(key)) return;

      row.setAttribute(HIDDEN_ATTR, "1");
      row.setAttribute(MATCH_ATTR, keyword.label);
      insertListPlaceholder(row, keyword, key);
    });
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
    const selectors = [
      "#focus_cmt li.ub-content",
      ".cmt_list li.ub-content",
      ".comment_wrap li.ub-content",
      "li[id^='comment_li_']",
      "li[id^='reply_li_']",
      ".comment_box li.ub-content",
      ".reply_box li.ub-content",
      ".dccon_comment_box li.ub-content"
    ];

    return Array.from(document.querySelectorAll(selectors.join(",")))
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

  function applyKeywordHide() {
    scheduled = false;

    if (!enabled || !keywords.length) {
      clearSoftHides();
      return;
    }

    ensureStyle();
    clearSoftHides();
    hideListRows();
    hideArticleIfNeeded();
    hideComments();
  }

  function scheduleApply() {
    if (scheduled) return;

    scheduled = true;
    setTimeout(applyKeywordHide, 120);
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

    if (key) {
      allowedKeys.add(key);
      saveAllowedKeys();
    }

    runWithoutObserver(() => {
      if (id) {
        const target = document.querySelector(`[${ITEM_ID_ATTR}="${cssEscape(id)}"]`);
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

      return Array.from(mutation.addedNodes || []).every((node) => {
        if (!node || node.nodeType !== 1 || !node.closest) return true;
        return !!node.closest(`[${PLACEHOLDER_ATTR}="1"]`);
      });
    });
  }

  function startObserver() {
    if (observer) return;

    observer = new MutationObserver((mutations) => {
      if (suppressObserver) return;
      if (mutationBelongsToSoftUi(mutations)) return;

      scheduleApply();
    });

    const start = () => {
      if (!document.body) return;

      observer.observe(document.body, {
        childList: true,
        subtree: true,
        characterData: true
      });
    };

    if (document.body) start();
    else document.addEventListener("DOMContentLoaded", start, { once: true });
  }

  function stopObserver() {
    if (!observer) return;

    observer.disconnect();
    observer = null;
  }

  function loadSettingsAndApply() {
    if (!chrome?.storage?.sync) return;

    chrome.storage.sync.get(DEFAULTS, (config) => {
      enabled = !!config.keywordHideEnabled;
      keywords = prepareKeywords(config.hiddenKeywords);
      targets = {
        ...DEFAULTS.keywordHideTargets,
        ...(config.keywordHideTargets || {})
      };

      if (enabled && keywords.length) startObserver();
      else stopObserver();

      applyKeywordHide();
    });
  }

  if (chrome?.storage?.onChanged) {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "sync") return;

      const touched =
        changes.keywordHideEnabled ||
        changes.hiddenKeywords ||
        changes.keywordHideTargets;

      if (touched) loadSettingsAndApply();
    });
  }

  document.addEventListener("click", handleShowClick, true);

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", loadSettingsAndApply, { once: true });
  } else {
    loadSettingsAndApply();
  }

  window.addEventListener("load", scheduleApply, { once: true });
})();

// keyword-blocker.js
(() => {
  const STYLE_ID = "dcb-keyword-block-style";
  const ARTICLE_OVERLAY_ID = "dcb-keyword-article-overlay";
  const BLOCKED_ATTR = "data-dcb-keyword-hidden";
  const BLOCKED_CLASS = "dcb-keyword-article-blocked";

  const DEFAULTS = {
    keywordBlockEnabled: false,
    blockedKeywords: [],
    keywordBlockTargets: {
      listTitle: true,
      viewTitle: true,
      viewBody: true,
      comments: true
    }
  };

  let enabled = false;
  let keywords = [];
  let targets = { ...DEFAULTS.keywordBlockTargets };
  let observer = null;
  let scheduled = false;
  let suppressObserver = false;
  let navigating = false;

  function normalizeText(v) {
    return String(v || "")
      .normalize("NFKC")
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim();
  }

  function escapeHtml(v) {
    return String(v || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
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

    return keywords.find((kw) => haystack.includes(kw.needle)) || null;
  }

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;

    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      [${BLOCKED_ATTR}="1"] {
        display: none !important;
      }

      html.${BLOCKED_CLASS},
      html.${BLOCKED_CLASS} body {
        overflow: hidden !important;
      }

      #${ARTICLE_OVERLAY_ID} {
        position: fixed !important;
        inset: 0 !important;
        z-index: 2147483647 !important;
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
        padding: 24px !important;
        box-sizing: border-box !important;
        background:
          radial-gradient(circle at top, rgba(239,68,68,.18), transparent 36%),
          rgba(15,23,42,.96) !important;
        color: #f8fafc !important;
        font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif !important;
      }

      #${ARTICLE_OVERLAY_ID} .dcb-keyword-card {
        width: min(500px, calc(100vw - 32px)) !important;
        padding: 30px !important;
        border: 1px solid rgba(248,113,113,.35) !important;
        border-radius: 22px !important;
        background: rgba(15,23,42,.92) !important;
        box-shadow: 0 28px 80px rgba(0,0,0,.42) !important;
        text-align: center !important;
      }

      #${ARTICLE_OVERLAY_ID} .dcb-keyword-icon {
        width: 46px !important;
        height: 46px !important;
        margin: 0 auto 14px !important;
        border-radius: 999px !important;
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
        background: rgba(239,68,68,.15) !important;
        border: 1px solid rgba(248,113,113,.38) !important;
        color: #fecaca !important;
        font-size: 24px !important;
        font-weight: 900 !important;
      }

      #${ARTICLE_OVERLAY_ID} .dcb-keyword-title {
        margin: 0 0 10px !important;
        font-size: 21px !important;
        font-weight: 800 !important;
        letter-spacing: -0.02em !important;
        line-height: 1.35 !important;
      }

      #${ARTICLE_OVERLAY_ID} .dcb-keyword-desc {
        margin: 0 0 18px !important;
        color: #cbd5e1 !important;
        font-size: 14px !important;
        line-height: 1.65 !important;
      }

      #${ARTICLE_OVERLAY_ID} .dcb-keyword-chip {
        display: inline-flex !important;
        max-width: 100% !important;
        margin-bottom: 18px !important;
        padding: 5px 11px !important;
        border-radius: 999px !important;
        background: rgba(248,113,113,.12) !important;
        border: 1px solid rgba(248,113,113,.28) !important;
        color: #fecaca !important;
        font-size: 12px !important;
        white-space: nowrap !important;
        overflow: hidden !important;
        text-overflow: ellipsis !important;
      }

      #${ARTICLE_OVERLAY_ID} .dcb-keyword-actions {
        display: flex !important;
        justify-content: center !important;
        gap: 8px !important;
        flex-wrap: wrap !important;
      }

      #${ARTICLE_OVERLAY_ID} .dcb-keyword-btn {
        appearance: none !important;
        border: 1px solid rgba(148,163,184,.28) !important;
        border-radius: 12px !important;
        padding: 9px 14px !important;
        background: rgba(255,255,255,.07) !important;
        color: #f8fafc !important;
        font-size: 13px !important;
        font-weight: 700 !important;
        cursor: pointer !important;
      }

      #${ARTICLE_OVERLAY_ID} .dcb-keyword-btn.primary {
        background: #ef4444 !important;
        border-color: #ef4444 !important;
        color: #fff !important;
      }
    `;

    (document.head || document.documentElement).appendChild(style);
  }

  function clearHiddenMarks() {
    document.querySelectorAll(`[${BLOCKED_ATTR}="1"]`).forEach((el) => {
      el.removeAttribute(BLOCKED_ATTR);
      el.removeAttribute("data-dcb-keyword-match");
    });
  }

  function clearArticleOverlay() {
    runWithoutObserver(() => {
      const overlay = document.getElementById(ARTICLE_OVERLAY_ID);
      if (overlay) overlay.remove();

      document.documentElement.classList.remove(BLOCKED_CLASS);
    });
  }

  function clearAllKeywordBlocks() {
    clearHiddenMarks();
    clearArticleOverlay();
  }

  function markHidden(el, kw) {
    if (!el || el.nodeType !== 1) return;

    el.setAttribute(BLOCKED_ATTR, "1");
    el.setAttribute("data-dcb-keyword-match", kw.label);
  }

  function getPostNoFromUrl() {
    try {
      return new URLSearchParams(location.search).get("no") || "";
    } catch {
      return "";
    }
  }

  function getListRows() {
    return Array.from(document.querySelectorAll("tr.ub-content"));
  }

  function getListRowText(row) {
    const title = row.querySelector(".gall_tit")?.innerText || "";
    const subject = row.querySelector(".gall_subject")?.innerText || "";
    return `${subject} ${title}`;
  }

  function blockListRows() {
    if (!targets.listTitle) return;

    getListRows().forEach((row) => {
      const kw = findKeyword(getListRowText(row));
      if (kw) markHidden(row, kw);
    });
  }

  function getArticleTitleText() {
    const nodes = [
      ".title_subject",
      "h3.title",
      ".gallview_head .title",
      ".view_head .title"
    ];

    return nodes
      .map((sel) => document.querySelector(sel)?.innerText || "")
      .filter(Boolean)
      .join(" ");
  }

  function getArticleBodyText() {
    const nodes = [
      ".write_div",
      ".writing_view_box",
      ".write_view",
      "#dgn_content_de"
    ];

    return nodes
      .map((sel) => document.querySelector(sel)?.innerText || "")
      .filter(Boolean)
      .join(" ");
  }

  function getListUrl() {
    try {
      const url = new URL(location.href);

      url.pathname = url.pathname.replace(/\/board\/view\/?$/i, "/board/lists");
      url.searchParams.delete("no");
      url.searchParams.delete("t");

      return url.toString();
    } catch {
      return "https://gall.dcinside.com/";
    }
  }

  function goList() {
    if (navigating) return;

    navigating = true;
    location.replace(getListUrl());
  }

  function goBackOrList() {
    if (navigating) return;

    navigating = true;

    const currentUrl = location.href;

    try {
      const ref = document.referrer ? new URL(document.referrer) : null;

      if (
        ref &&
        ref.hostname.endsWith("dcinside.com") &&
        ref.href !== currentUrl
      ) {
        location.replace(ref.href);
        return;
      }
    } catch {}

    if (history.length > 1) {
      history.back();

      setTimeout(() => {
        if (location.href === currentUrl) {
          location.replace(getListUrl());
        }
      }, 600);

      return;
    }

    location.replace(getListUrl());
  }

  function handleOverlayClick(e) {
    const btn = e.target.closest("[data-act]");
    if (!btn) return;

    e.preventDefault();
    e.stopPropagation();

    const act = btn.getAttribute("data-act");

    if (act === "back") {
      goBackOrList();
      return;
    }

    if (act === "list") {
      goList();
    }
  }

  function showArticleOverlay(kw, source) {
    ensureStyle();

    const postNo = getPostNoFromUrl();
    const sourceLabel = source === "title" ? "제목" : "본문";
    const blockKey = `${source}:${kw.needle}:${postNo}`;

    let overlay = document.getElementById(ARTICLE_OVERLAY_ID);

    if (overlay && overlay.dataset.blockKey === blockKey) {
      document.documentElement.classList.add(BLOCKED_CLASS);
      return;
    }

    runWithoutObserver(() => {
      document.documentElement.classList.add(BLOCKED_CLASS);

      overlay = document.getElementById(ARTICLE_OVERLAY_ID);

      if (!overlay) {
        overlay = document.createElement("div");
        overlay.id = ARTICLE_OVERLAY_ID;
        (document.body || document.documentElement).appendChild(overlay);
      }

      overlay.dataset.blockKey = blockKey;

      overlay.innerHTML = `
        <div class="dcb-keyword-card" role="dialog" aria-modal="true" aria-labelledby="dcb-keyword-title">
          <div class="dcb-keyword-icon">!</div>
          <h1 id="dcb-keyword-title" class="dcb-keyword-title">키워드가 포함된 게시물입니다</h1>
          <p class="dcb-keyword-desc">
            이 게시물의 ${sourceLabel}에서 차단 키워드가 감지되어 내용을 가렸습니다.
            목록, 본문, 댓글 차단은 키워드 차단 모드에서 관리됩니다.
          </p>
          <div class="dcb-keyword-chip" title="${escapeHtml(kw.label)}">
            키워드: ${escapeHtml(kw.label)}${postNo ? ` · 글번호: ${escapeHtml(postNo)}` : ""}
          </div>
          <div class="dcb-keyword-actions">
            <button type="button" class="dcb-keyword-btn primary" data-act="back">뒤로 가기</button>
            <button type="button" class="dcb-keyword-btn" data-act="list">목록으로</button>
          </div>
        </div>
      `;

      overlay.onclick = handleOverlayClick;
    });
  }

  function blockArticleIfNeeded() {
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

    if (matched) {
      showArticleOverlay(matched, source);
      return;
    }

    clearArticleOverlay();
  }

  function getCommentCandidates() {
    const selectors = [
      "#focus_cmt li.ub-content",
      ".cmt_list li.ub-content",
      ".comment_wrap li.ub-content",
      "li[id^='comment_li_']",
      ".comment_box li",
      ".reply_box li",
      ".dccon_comment_box li"
    ];

    return Array.from(document.querySelectorAll(selectors.join(",")))
      .filter((el, idx, arr) => arr.indexOf(el) === idx)
      .filter((el) => !el.closest(".write_div"))
      .filter((el) => !el.closest(`#${ARTICLE_OVERLAY_ID}`));
  }

  function getCommentText(el) {
    const textNodes = [
      ".usertxt",
      ".comment",
      ".cmt_txt",
      ".reply_txt",
      ".txt",
      ".nickname",
      ".ip"
    ];

    const text = textNodes
      .map((sel) => el.querySelector(sel)?.innerText || "")
      .filter(Boolean)
      .join(" ");

    return text || el.innerText || "";
  }

  function blockComments() {
    if (!targets.comments) return;

    getCommentCandidates().forEach((el) => {
      const kw = findKeyword(getCommentText(el));
      if (kw) markHidden(el, kw);
    });
  }

  function applyKeywordBlock() {
    scheduled = false;

    if (!enabled || !keywords.length) {
      clearAllKeywordBlocks();
      return;
    }

    ensureStyle();

    clearHiddenMarks();
    blockListRows();
    blockComments();
    blockArticleIfNeeded();
  }

  function scheduleApply() {
    if (scheduled) return;

    scheduled = true;
    setTimeout(applyKeywordBlock, 120);
  }

  function mutationBelongsToOverlay(mutations) {
    return mutations.every((m) => {
      const target =
        m.target && m.target.nodeType === 1
          ? m.target
          : m.target?.parentElement;

      if (!target || !target.closest) return false;

      if (target.closest(`#${ARTICLE_OVERLAY_ID}`)) return true;

      return Array.from(m.addedNodes || []).every((node) => {
        if (!node || node.nodeType !== 1 || !node.closest) return true;
        return node.id === ARTICLE_OVERLAY_ID || !!node.closest(`#${ARTICLE_OVERLAY_ID}`);
      });
    });
  }

  function startObserver() {
    if (observer) return;

    observer = new MutationObserver((mutations) => {
      if (suppressObserver) return;
      if (mutationBelongsToOverlay(mutations)) return;

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
    chrome.storage.sync.get(DEFAULTS, (conf) => {
      enabled = !!conf.keywordBlockEnabled;
      keywords = prepareKeywords(conf.blockedKeywords);
      targets = {
        ...DEFAULTS.keywordBlockTargets,
        ...(conf.keywordBlockTargets || {})
      };

      if (enabled && keywords.length) startObserver();
      else stopObserver();

      applyKeywordBlock();
    });
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "sync") return;

    const touched =
      changes.keywordBlockEnabled ||
      changes.blockedKeywords ||
      changes.keywordBlockTargets;

    if (touched) loadSettingsAndApply();
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", loadSettingsAndApply, { once: true });
  } else {
    loadSettingsAndApply();
  }

  window.addEventListener("load", scheduleApply, { once: true });
})();
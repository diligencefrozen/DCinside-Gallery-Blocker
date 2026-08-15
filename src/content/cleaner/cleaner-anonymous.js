/*****************************************************************
 * cleaner-anonymous.js — 비회원(갤로그 링크 없음) 글/댓글 숨김
 *****************************************************************/
(() => {
  const STYLE_ID = "dcb-anonymous-clean-style";
  const HIDDEN_CLASS = "dcb-anonymous-hidden";
  const WRITER_SELECTOR = ".gall_writer";

  let hideEnabled = false;
  let observer = null;
  let scheduled = false;
  const pendingRoots = new Set();

  function ensureStyle() {
    let style = document.getElementById(STYLE_ID);
    if (!style) {
      style = document.createElement("style");
      style.id = STYLE_ID;
      (document.head || document.documentElement).appendChild(style);
    }
    style.textContent = `.${HIDDEN_CLASS}{display:none!important}`;
    return style;
  }

  function isAnonymous(writer) {
    if (!(writer instanceof Element)) return false;

    if (writer.querySelector('.writer_nikcon')) return false;
    if (writer.querySelector('[onclick*="gallog"], [href*="gallog"]')) return false;
    return !!writer.querySelector('span.ip');
  }

  function findContainer(writer) {
    const replyInfo = writer.closest('.reply_info');
    if (replyInfo?.parentElement?.tagName === 'LI') return replyInfo.parentElement;

    const commentInfo = writer.closest('.cmt_info');
    if (commentInfo?.parentElement?.tagName === 'LI') return commentInfo.parentElement;

    return writer.closest('.gall_tr, .gall_item, tr[data-no]');
  }

  function markWriter(writer) {
    if (!isAnonymous(writer)) return;
    findContainer(writer)?.classList.add(HIDDEN_CLASS);
  }

  function scanRoot(root) {
    if (!hideEnabled || !root) return;

    if (root instanceof Element) {
      if (root.matches(WRITER_SELECTOR)) markWriter(root);
      root.closest?.(WRITER_SELECTOR) && markWriter(root.closest(WRITER_SELECTOR));
    }

    root.querySelectorAll?.(WRITER_SELECTOR).forEach(markWriter);
  }

  function flushPendingRoots() {
    scheduled = false;
    if (!hideEnabled || !pendingRoots.size) {
      pendingRoots.clear();
      return;
    }

    const roots = Array.from(pendingRoots).filter((root) => root?.isConnected !== false);
    pendingRoots.clear();

    for (const root of roots) scanRoot(root);
  }

  function queueRoot(root) {
    if (!root || (root.nodeType !== 1 && root.nodeType !== 11)) return;
    pendingRoots.add(root);
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(flushPendingRoots);
  }

  function clearMarks() {
    document.querySelectorAll(`.${HIDDEN_CLASS}`).forEach((el) => el.classList.remove(HIDDEN_CLASS));
  }

  function startObserver() {
    if (observer) return;

    observer = new MutationObserver((mutations) => {
      if (!hideEnabled) return;
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes || []) queueRoot(node);
      }
    });

    const observe = () => {
      if (document.body) observer?.observe(document.body, { childList: true, subtree: true });
    };

    if (document.body) observe();
    else window.addEventListener("DOMContentLoaded", observe, { once: true });
  }

  function stopObserver() {
    observer?.disconnect();
    observer = null;
    pendingRoots.clear();
    scheduled = false;
    clearMarks();

    const style = document.getElementById(STYLE_ID);
    if (style) style.textContent = "";
  }

  function enable() {
    ensureStyle();
    scanRoot(document);
    startObserver();
  }

  function apply() {
    chrome.storage.sync.get(
      { hideAnonymousEnabled: false },
      ({ hideAnonymousEnabled }) => {
        hideEnabled = !!hideAnonymousEnabled;
        if (hideEnabled) enable();
        else stopObserver();
      }
    );
  }

  try {
    if (chrome?.storage?.sync) {
      apply();

      chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== "sync" || !changes.hideAnonymousEnabled) return;
        hideEnabled = !!changes.hideAnonymousEnabled.newValue;
        if (hideEnabled) enable();
        else stopObserver();
      });
    }
  } catch (_) {
    // storage가 없는 환경에서는 기본값(false) 유지
  }
})();

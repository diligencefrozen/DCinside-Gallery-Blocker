/*****************************************************************
 * cleaner-dory.js — 댓글돌이 광고/이슈피드 댓글 숨김
 *****************************************************************/
(() => {
  const STYLE_ID = "dcb-dory-block-style";
  const BLOCKED_CLASS = "dcb-dory-blocked";
  const BLOCKED_NICK = "댓글돌이";

  const DEFAULTS = {
    doryBlockEnabled: true
  };

  let enabled = true;
  let observer = null;
  let scheduled = false;

  function normalizeNick(value) {
    return String(value || "")
      .normalize("NFKC")
      .replace(/\s+/g, "")
      .trim();
  }

  function ensureStyle() {
    let style = document.getElementById(STYLE_ID);
    if (!style) {
      style = document.createElement("style");
      style.id = STYLE_ID;
      (document.head || document.documentElement).appendChild(style);
    }

    style.textContent = `
      .${BLOCKED_CLASS} { display: none !important; }

      #focus_cmt li.ub-content.dory,
      .comment_wrap li.ub-content.dory,
      .cmt_list li.ub-content.dory,
      #focus_cmt li.ub-content:has(.gall_writer[data-nick="${BLOCKED_NICK}"]),
      .comment_wrap li.ub-content:has(.gall_writer[data-nick="${BLOCKED_NICK}"]),
      .cmt_list li.ub-content:has(.gall_writer[data-nick="${BLOCKED_NICK}"]),
      #focus_cmt li.ub-content:has(.nickname.cmtboy),
      .comment_wrap li.ub-content:has(.nickname.cmtboy),
      .cmt_list li.ub-content:has(.nickname.cmtboy),
      #focus_cmt li.ub-content:has(.comment_dory),
      .comment_wrap li.ub-content:has(.comment_dory),
      .cmt_list li.ub-content:has(.comment_dory),
      #focus_cmt li.ub-content:has(.dory_txt),
      .comment_wrap li.ub-content:has(.dory_txt),
      .cmt_list li.ub-content:has(.dory_txt) {
        display: none !important;
      }
    `;
  }

  function clearStyle() {
    const style = document.getElementById(STYLE_ID);
    if (style) style.textContent = "";
  }

  function clearMarks() {
    document.querySelectorAll(`.${BLOCKED_CLASS}`).forEach((el) => {
      el.classList.remove(BLOCKED_CLASS);
    });
  }

  function writerMatches(writer) {
    if (!writer) return false;

    const candidates = [
      writer.getAttribute("data-nick"),
      writer.querySelector(".nickname")?.getAttribute("title"),
      writer.querySelector(".nickname em")?.textContent,
      writer.querySelector(".nickname")?.textContent,
      writer.textContent
    ];

    return candidates.some((value) => normalizeNick(value) === BLOCKED_NICK);
  }

  function nodeLooksLikeDory(node) {
    if (!node || node.nodeType !== 1) return false;

    return (
      node.matches?.("li.dory, .comment_dory, .dory_txt, .nickname.cmtboy") ||
      writerMatches(node.matches?.(".gall_writer, .ub-writer") ? node : null) ||
      !!node.querySelector?.('.gall_writer[data-nick="댓글돌이"], .nickname.cmtboy, .comment_dory, .dory_txt')
    );
  }

  function findCommentContainer(node) {
    if (!node || node.nodeType !== 1) return null;

    const commentLi = node.closest(
      "#focus_cmt li, .comment_wrap li, .cmt_list li, .reply_box li, .reply_list li, " +
      ".dccon_comment_box li, li.ub-content, li[id^='comment_li_'], li.dory"
    );
    if (commentLi) return commentLi;

    const info = node.closest(".cmt_info, .reply_info, .cmt_nickbox, .clear.cmt_txtbox");
    if (info?.parentElement?.tagName === "LI") return info.parentElement;

    return null;
  }

  function markBlocked(el) {
    if (!el || el.nodeType !== 1) return;
    el.classList.add(BLOCKED_CLASS);
  }

  function applyBlock() {
    scheduled = false;

    if (!enabled) {
      clearStyle();
      clearMarks();
      return;
    }

    ensureStyle();
    clearMarks();

    document
      .querySelectorAll(
        'li.dory, .comment_dory, .dory_txt, .nickname.cmtboy, .gall_writer, .ub-writer'
      )
      .forEach((node) => {
        if (!nodeLooksLikeDory(node)) return;

        const container = findCommentContainer(node);
        if (container) markBlocked(container);
      });
  }

  function scheduleApply() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(applyBlock);
  }

  function startObserver() {
    if (observer) return;

    observer = new MutationObserver(() => scheduleApply());

    const observe = () => {
      if (document.body) {
        observer.observe(document.body, { childList: true, subtree: true });
      }
    };

    if (document.body) observe();
    else document.addEventListener("DOMContentLoaded", observe, { once: true });
  }

  function stopObserver() {
    if (observer) {
      observer.disconnect();
      observer = null;
    }
  }

  function loadAndApply() {
    chrome.storage.sync.get(DEFAULTS, ({ doryBlockEnabled }) => {
      enabled = doryBlockEnabled !== false;

      if (enabled) {
        ensureStyle();
        scheduleApply();
        startObserver();
      } else {
        stopObserver();
        clearStyle();
        clearMarks();
      }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", loadAndApply, { once: true });
  } else {
    loadAndApply();
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "sync" || !changes.doryBlockEnabled) return;

    enabled = changes.doryBlockEnabled.newValue !== false;

    if (enabled) {
      ensureStyle();
      scheduleApply();
      startObserver();
    } else {
      stopObserver();
      clearStyle();
      clearMarks();
    }
  });
})();

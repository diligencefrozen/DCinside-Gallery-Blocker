/*****************************************************************
 * cleaner-gamemeca.js — 게임메카 작성 글/댓글 전용 차단
 *****************************************************************/
(() => {
  const STYLE_ID = "dcb-gamemeca-block-style";
  const BLOCKED_CLASS = "dcb-gamemeca-blocked";
  const BLOCKED_NICK = "게임메카";
  const BLOCKED_UID = "gamemeca";

  const DEFAULTS = {
    gamemecaBlockEnabled: true
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

  function normalizeUid(value) {
    return String(value || "")
      .trim()
      .toLowerCase();
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

      .gall_list tr.ub-content:has(.gall_writer[data-nick="${BLOCKED_NICK}"]),
      .gall_list tr.ub-content:has(.gall_writer[data-uid="${BLOCKED_UID}"]),
      .gall_list li.ub-content:has(.gall_writer[data-nick="${BLOCKED_NICK}"]),
      .gall_list li.ub-content:has(.gall_writer[data-uid="${BLOCKED_UID}"]) {
        display: none !important;
      }

      .view_content_wrap:has(.gall_writer[data-loc="view"][data-nick="${BLOCKED_NICK}"]),
      .view_content_wrap:has(.gall_writer[data-loc="view"][data-uid="${BLOCKED_UID}"]) {
        display: none !important;
      }

      #focus_cmt li.ub-content:has(.gall_writer[data-nick="${BLOCKED_NICK}"]),
      #focus_cmt li.ub-content:has(.gall_writer[data-uid="${BLOCKED_UID}"]),
      .comment_wrap li.ub-content:has(.gall_writer[data-nick="${BLOCKED_NICK}"]),
      .comment_wrap li.ub-content:has(.gall_writer[data-uid="${BLOCKED_UID}"]),
      .cmt_list li.ub-content:has(.gall_writer[data-nick="${BLOCKED_NICK}"]),
      .cmt_list li.ub-content:has(.gall_writer[data-uid="${BLOCKED_UID}"]) {
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

    const uid = normalizeUid(writer.getAttribute("data-uid"));
    if (uid === BLOCKED_UID) return true;

    const candidates = [
      writer.getAttribute("data-nick"),
      writer.querySelector(".nickname")?.getAttribute("title"),
      writer.querySelector(".nickname em")?.textContent,
      writer.querySelector(".nickname")?.textContent
    ];

    return candidates.some((value) => normalizeNick(value) === BLOCKED_NICK);
  }

  function markBlocked(el) {
    if (!el || el.nodeType !== 1) return;
    el.classList.add(BLOCKED_CLASS);
  }

  function isInsideCommentRoot(writer) {
    return !!writer.closest(
      "#focus_cmt, .comment_wrap, .cmt_list, .reply_box, .reply_list, .dccon_comment_box"
    );
  }

  function findCommentContainer(writer) {
    const commentLi = writer.closest(
      "#focus_cmt li, .comment_wrap li, .cmt_list li, .reply_box li, .reply_list li, .dccon_comment_box li"
    );
    if (commentLi) return commentLi;

    const info = writer.closest(".cmt_info, .reply_info, .cmt_nickbox");
    if (info?.parentElement?.tagName === "LI") return info.parentElement;

    return null;
  }

  function findListContainer(writer) {
    if (isInsideCommentRoot(writer)) return null;

    return writer.closest(
      ".gall_list tr.ub-content, .gall_list tr[data-no], .gall_list tr.gall_tr, " +
      "tr.ub-content, tr[data-no], tr.gall_tr, .gall_list li.ub-content, " +
      ".gall_list li.gall_item, li.ub-content, li.gall_item, .gall_item"
    );
  }

  function isViewWriter(writer) {
    if (isInsideCommentRoot(writer)) return false;
    if (writer.getAttribute("data-loc") === "view") return true;
    return !!writer.closest(".gallview_head, .view_head, .view_content_wrap");
  }

  function findViewContainer(writer) {
    if (!isViewWriter(writer)) return null;

    return (
      writer.closest(".view_content_wrap") ||
      document.querySelector(".view_content_wrap") ||
      writer.closest(".view_wrap") ||
      writer.closest(".gallview") ||
      writer.closest("article") ||
      writer.closest(".gallview_head, .view_head")
    );
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

    document.querySelectorAll(".gall_writer, .ub-writer").forEach((writer) => {
      if (!writerMatches(writer)) return;

      const commentContainer = findCommentContainer(writer);
      if (commentContainer) {
        markBlocked(commentContainer);
        return;
      }

      const listContainer = findListContainer(writer);
      if (listContainer) {
        markBlocked(listContainer);
        return;
      }

      const viewContainer = findViewContainer(writer);
      if (viewContainer) {
        markBlocked(viewContainer);
      }
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
    chrome.storage.sync.get(DEFAULTS, ({ gamemecaBlockEnabled }) => {
      enabled = gamemecaBlockEnabled !== false;

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
    if (area !== "sync" || !changes.gamemecaBlockEnabled) return;

    enabled = changes.gamemecaBlockEnabled.newValue !== false;

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

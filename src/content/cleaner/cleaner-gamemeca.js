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
  let unsubscribeDomBus = null;

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

  function processWriter(writer) {
    if (!writer || writer.nodeType !== 1) return;
    const matched = writerMatches(writer);
    const commentContainer = findCommentContainer(writer);
    const listContainer = findListContainer(writer);
    const viewContainer = findViewContainer(writer);
    for (const container of [commentContainer, listContainer, viewContainer]) {
      if (container) container.classList.toggle(BLOCKED_CLASS, matched);
    }
  }

  function processRoot(root) {
    if (!enabled || !root) return;
    const element = root.nodeType === Node.ELEMENT_NODE ? root : root.parentElement;
    if (!element || element.closest?.("[data-dcb-owned]")) return;
    const writers = new Set();
    const closest = element.matches?.(".gall_writer, .ub-writer")
      ? element
      : element.closest?.(".gall_writer, .ub-writer");
    if (closest) writers.add(closest);
    element.querySelectorAll?.(".gall_writer, .ub-writer").forEach((writer) => writers.add(writer));
    writers.forEach(processWriter);
  }

  function applyBlock() {
    if (!enabled) {
      clearStyle();
      clearMarks();
      return;
    }
    ensureStyle();
    document.querySelectorAll(".gall_writer, .ub-writer").forEach(processWriter);
  }

  function startObserver() {
    if (unsubscribeDomBus || !globalThis.DCBDomMutationBus) return;
    unsubscribeDomBus = globalThis.DCBDomMutationBus.subscribe(
      "cleaner-gamemeca",
      (records) => {
        const roots = new Set();
        for (const record of records) {
          roots.add(record.target);
          if (record.type === "childList") record.addedNodes.forEach((node) => roots.add(node));
        }
        roots.forEach(processRoot);
      },
      { types: ["childList", "attributes"], attributes: ["data-nick", "data-uid", "data-user-id", "data-userid", "data-user_id", "data-memo-uid", "title"] }
    );
  }

  function stopObserver() {
    unsubscribeDomBus?.();
    unsubscribeDomBus = null;
  }

  function loadAndApply() {
    globalThis.DCBRuntimeSettingsCache.get(DEFAULTS, ({ gamemecaBlockEnabled }) => {
      enabled = gamemecaBlockEnabled !== false;

      if (enabled) {
        ensureStyle();
        applyBlock();
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
      applyBlock();
      startObserver();
    } else {
      stopObserver();
      clearStyle();
      clearMarks();
    }
  });
})();

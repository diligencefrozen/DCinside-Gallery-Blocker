/*****************************************************************
 * cleaner-notice.js — 운영자 AD/설문 딱지 숨김
 *****************************************************************/
(() => {
  const STYLE_ID = "dcb-notice-block-style";
  const BLOCKED_CLASS = "dcb-notice-blocked";
  const TARGET_BADGES = new Set(["AD", "설문"]);

  const DEFAULTS = {
    noticeBlockEnabled: true
  };

  let enabled = true;
  let observer = null;
  let scheduled = false;

  function normalizeBadge(value) {
    const text = String(value || "")
      .normalize("NFKC")
      .replace(/\s+/g, "")
      .trim();

    return /^[a-z]+$/i.test(text) ? text.toUpperCase() : text;
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

  function subjectMatches(subject) {
    if (!subject) return false;

    const candidates = [
      subject.querySelector("b")?.textContent,
      subject.textContent
    ];

    return candidates.some((value) => TARGET_BADGES.has(normalizeBadge(value)));
  }

  function findListContainer(subject) {
    if (!subject) return null;

    return subject.closest(
      ".gall_list tr.ub-content, .gall_list tr[data-no], .gall_list tr.gall_tr, " +
      ".gall_list tr, tr.ub-content, tr[data-no], tr.gall_tr, " +
      ".gall_list li.ub-content, .gall_list li.gall_item, li.ub-content, li.gall_item, .gall_item"
    );
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

    document.querySelectorAll("td.gall_subject, .gall_subject").forEach((subject) => {
      if (!subjectMatches(subject)) return;

      const container = findListContainer(subject);
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
    chrome.storage.sync.get(DEFAULTS, ({ noticeBlockEnabled }) => {
      enabled = noticeBlockEnabled !== false;

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
    if (area !== "sync" || !changes.noticeBlockEnabled) return;

    enabled = changes.noticeBlockEnabled.newValue !== false;

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

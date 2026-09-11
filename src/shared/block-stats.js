(() => {
  "use strict";

  if (globalThis.DCBBlockStats) return;

  const FLUSH_DELAY_MS = 120;
  const SCAN_DELAY_MS = 40;
  const RETRY_MIN_MS = 250;
  const RETRY_MAX_MS = 4000;
  const registrations = new Map();
  const seenElements = new WeakSet();
  const pageCounts = Object.create(null);
  const pendingRoots = new Set();
  const PAGE_ID = (() => {
    try {
      return crypto.randomUUID();
    } catch (_) {
      return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    }
  })();

  const COMMENT_ROW_SELECTOR = [
    "#focus_cmt li.ub-content",
    "#focus_cmt li[id^='comment_']",
    "#focus_cmt li[id^='reply_']",
    ".comment_wrap li.ub-content",
    ".cmt_list li.ub-content",
    ".reply_list li",
    "li[id^='comment_li_']",
    "li[id^='reply_li_']",
    ".dcbpv-comment-item"
  ].join(",");

  // report() 호출이 초기 로딩 경쟁으로 누락되더라도, 확장 프로그램이 남긴
  // 숨김 표식을 보고 현재 페이지 카운트를 복구할 수 있게 한다.
  const RECOVERY_RULES = Object.freeze([
    { selector: ".dcb-userblock-hidden", category: "users" },
    { selector: ".dcb-account-activity-hidden", category: "lowActivity" },
    { selector: ".dcb-anonymous-hidden", category: "anonymous" },
    { selector: '[data-dcb-keyword-hidden="1"],[data-dcb-keyword-soft-hidden="1"]', category: "keywords" },
    { selector: '[data-dcb-text-detection-hidden="1"]', category: "aggressive" },
    { selector: ".dcb-cleaner-textcon-comment-hidden,.dcb-cleaner-textcon-content-hidden,.dcbpv-textcon-hidden", category: "textcon", canonicalComment: true },
    { selector: ".dcb-cleaner-dccon-comment-hidden,.dcb-cleaner-dccon-content-hidden,.dcbpv-dccon-hidden,[data-dcb-selective-dccon-hidden=\"true\"],[data-dcb-dccon-hidden=\"true\"]", category: "dccon", canonicalComment: true },
    { selector: ".dcb-dory-blocked", category: "ads" },
    { selector: ".dcb-notice-blocked", category: "notices" },
    { selector: ".dcb-gamemeca-blocked", category: "automated" },
    { selector: '[data-dcb-area-hidden="1"]', category: "pageElements" },
    { selector: '.dcibx-frame[style*="display: none"]', category: "images" }
  ]);
  const RECOVERY_SELECTOR = RECOVERY_RULES.map((rule) => rule.selector).join(",");

  // 일부 숨김 기능은 개별 요소에 표식을 남기지 않고 CSS 한 장으로 처리한다.
  // report/register 호출을 놓친 경우에도 실제로 활성화된 확장 스타일을 기준으로 복구한다.
  const STYLE_RECOVERY_RULES = Object.freeze([
    {
      styleId: "dcb-hide-comment-style",
      selector: COMMENT_ROW_SELECTOR,
      category: "comments"
    },
    {
      styleId: "dcb-hide-img-comment-style",
      selector: "div.img_comment,div.img_comment.fold,div.img_comment.getMoreComment",
      category: "imageComments"
    },
    {
      styleId: "dcb-hide-dccon-style",
      selector: [
        ".coment_dccon_img",
        ".comment_dccon:not(:has(.coment_dccon_txt,.comment_dccon_txt,.txtcon_txt))",
        ".written_dccon:not(.coment_dccon_txt):not(.comment_dccon_txt):not(.txtcon_txt)",
        "img[src*='dccon.php']",
        "video[src*='dccon']",
        "[reqpath*='dccon']"
      ].join(","),
      category: "dccon",
      canonicalComment: true
    },
    {
      styleId: "dcb-hide-textcon-style",
      selector: ".coment_dccon_txt,.comment_dccon_txt,.txtcon_txt",
      category: "textcon",
      canonicalComment: true
    }
  ]);

  let observer = null;
  let flushTimer = 0;
  let scanTimer = 0;
  let flushInFlight = false;
  let syncDirty = false;
  let retryDelayMs = RETRY_MIN_MS;

  function cleanCategory(value) {
    return String(value || "other").trim().slice(0, 40) || "other";
  }

  function snapshot() {
    const byCategory = {};
    Object.entries(pageCounts).forEach(([key, value]) => {
      const count = Math.max(0, Number.parseInt(value, 10) || 0);
      if (count) byCategory[key] = count;
    });
    return {
      total: Object.values(byCategory).reduce((sum, count) => sum + count, 0),
      byCategory
    };
  }

  function announcePageStart(attempt = 0) {
    try {
      chrome.runtime.sendMessage({ type: "dcb.stats.pageStart", pageId: PAGE_ID }, (response) => {
        const failed = !!chrome.runtime.lastError || !response?.ok;
        if (!failed) return;
        if (attempt >= 4) return;
        setTimeout(() => announcePageStart(attempt + 1), Math.min(2000, 100 * (2 ** attempt)));
      });
    } catch (_) {
      if (attempt < 4) setTimeout(() => announcePageStart(attempt + 1), Math.min(2000, 100 * (2 ** attempt)));
    }
  }

  function markSeen(element) {
    if (!(element instanceof Element) || seenElements.has(element)) return false;
    seenElements.add(element);
    return true;
  }

  function scheduleFlush(delay = FLUSH_DELAY_MS) {
    if (flushTimer) return;
    flushTimer = setTimeout(flush, Math.max(0, delay));
  }

  function markCount(category, count = 1) {
    const key = cleanCategory(category);
    const safeCount = Math.max(0, Math.min(10_000, Number.parseInt(count, 10) || 0));
    if (!safeCount) return;
    pageCounts[key] = (pageCounts[key] || 0) + safeCount;
    syncDirty = true;
    scheduleFlush();
  }

  function report(element, category = "other") {
    if (!(element instanceof Element) || !markSeen(element)) return false;
    markCount(category, 1);
    return true;
  }

  function reportMany(elements, category = "other") {
    let count = 0;
    for (const element of elements || []) {
      if (report(element, category)) count += 1;
    }
    return count;
  }

  function finishFlush(ok) {
    flushInFlight = false;
    if (ok) {
      retryDelayMs = RETRY_MIN_MS;
    } else {
      // 절대값 스냅샷이므로 재전송해도 누적 집계가 중복되지 않는다.
      syncDirty = true;
      retryDelayMs = Math.min(RETRY_MAX_MS, retryDelayMs * 2);
    }
    if (syncDirty) scheduleFlush(ok ? FLUSH_DELAY_MS : retryDelayMs);
  }

  function flush() {
    if (flushTimer) {
      clearTimeout(flushTimer);
      flushTimer = 0;
    }
    if (flushInFlight) {
      scheduleFlush();
      return;
    }
    if (!syncDirty || !globalThis.chrome?.runtime?.sendMessage) return;

    syncDirty = false;
    flushInFlight = true;
    const stats = snapshot();

    try {
      chrome.runtime.sendMessage({ type: "dcb.stats.sync", pageId: PAGE_ID, stats }, (response) => {
        finishFlush(!chrome.runtime.lastError && !!response?.ok);
      });
    } catch (_) {
      finishFlush(false);
    }
  }

  function scanRegistration(registration, root = document) {
    const { selector, category } = registration;
    if (!selector || !root) return;

    if (root instanceof Element && root.matches?.(selector)) report(root, category);
    root.querySelectorAll?.(selector).forEach((element) => report(element, category));
  }

  function canonicalRecoveryTarget(element, rule) {
    if (!(element instanceof Element)) return null;
    if (!rule?.canonicalComment) return element;
    return element.closest?.(COMMENT_ROW_SELECTOR) || element;
  }

  function previewReasonCategory(reason) {
    const key = String(reason || "").trim();
    if (key === "dccon") return "dccon";
    if (key === "textcon") return "textcon";
    if (key === "user" || key === "blocked-parent") return "users";
    if (key === "anonymous") return "anonymous";
    if (key === "keyword" || key === "keyword-hide" || key === "keyword-block") return "keywords";
    if (key === "dory") return "ads";
    return "other";
  }

  function scanRecoveryMarkers(root = document) {
    if (!root?.querySelectorAll) return;

    // 미리보기 댓글은 행 하나를 한 번만 센다. 내부 디시콘/텍스트콘 표식과 중복 집계하지 않는다.
    root.querySelectorAll('.dcbpv-comment-item.dcbpv-filter-hidden[data-dcbpv-blocked-reason]').forEach((row) => {
      report(row, previewReasonCategory(row.dataset?.dcbpvBlockedReason));
    });

    root.querySelectorAll(RECOVERY_SELECTOR).forEach((element) => {
      const rule = RECOVERY_RULES.find((candidate) => element.matches?.(candidate.selector));
      if (!rule) return;
      const target = canonicalRecoveryTarget(element, rule);
      if (!target) return;

      if (rule.category === "dccon") {
        const kind = String(target.getAttribute?.("data-dcb-dccon-kind") || "");
        const isTextCon = kind.split(",").includes("textcon")
          || !!element.closest?.(".coment_dccon_txt,.comment_dccon_txt")
          || !!element.matches?.(".txtcon_txt,.dcbpv-textcon-hidden");
        report(target, isTextCon ? "textcon" : "dccon");
        return;
      }

      report(target, rule.category);
    });
  }

  function scanStyleRecovery(root = document) {
    if (!root?.querySelectorAll) return;

    for (const rule of STYLE_RECOVERY_RULES) {
      if (!document.getElementById?.(rule.styleId)) continue;

      const handle = (element) => {
        if (!(element instanceof Element)) return;
        const target = canonicalRecoveryTarget(element, rule);
        if (target) report(target, rule.category);
      };

      if (root instanceof Element && root.matches?.(rule.selector)) handle(root);
      root.querySelectorAll(rule.selector).forEach(handle);
    }
  }

  function reconcile(root = document) {
    registrations.forEach((registration) => scanRegistration(registration, root));
    scanRecoveryMarkers(root);
    scanStyleRecovery(root);
    return snapshot();
  }

  function minimizeRoots(roots) {
    const connected = roots.filter((root) => root && root.isConnected !== false);
    return connected.filter((root, index) => {
      if (!(root instanceof Element)) return true;
      return !connected.some((other, otherIndex) => (
        index !== otherIndex && other instanceof Element && other.contains?.(root)
      ));
    });
  }

  function flushScans() {
    scanTimer = 0;
    const roots = minimizeRoots(Array.from(pendingRoots));
    pendingRoots.clear();
    if (!roots.length || !registrations.size) return;

    for (const root of roots) {
      registrations.forEach((registration) => scanRegistration(registration, root));
    }
  }

  function scheduleScan(root) {
    if (!(root instanceof Element) && !(root instanceof DocumentFragment)) return;
    pendingRoots.add(root);
    if (scanTimer) return;
    scanTimer = setTimeout(flushScans, SCAN_DELAY_MS);
  }

  function ensureObserver() {
    if (observer || !registrations.size) return;
    const target = document.documentElement || document;
    if (!target) return;

    observer = new MutationObserver((records) => {
      for (const record of records) {
        for (const node of record.addedNodes || []) scheduleScan(node);
      }
    });
    observer.observe(target, { childList: true, subtree: true });
  }

  function stopObserverIfIdle() {
    if (registrations.size || !observer) return;
    observer.disconnect();
    observer = null;
    if (scanTimer) clearTimeout(scanTimer);
    scanTimer = 0;
    pendingRoots.clear();
  }

  function registerSelector(id, selector, category = "other") {
    const key = String(id || "").trim();
    if (!key || !selector) return;
    const registration = { selector: String(selector), category: cleanCategory(category) };
    registrations.set(key, registration);
    scanRegistration(registration, document);
    ensureObserver();
  }

  function unregisterSelector(id) {
    registrations.delete(String(id || "").trim());
    stopObserverIfIdle();
  }

  // 다른 차단 스크립트가 같은 document_start에서 실행되더라도 바로 접근할 수 있게
  // API를 먼저 공개한 뒤 비동기 초기화를 시작한다.
  globalThis.DCBBlockStats = Object.freeze({
    report,
    reportMany,
    registerSelector,
    unregisterSelector,
    snapshot,
    reconcile,
    flush
  });

  announcePageStart();

  const reconcileSoon = () => {
    try {
      reconcile(document);
    } catch (_) {}
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", reconcileSoon, { once: true });
  } else {
    if (typeof queueMicrotask === "function") queueMicrotask(reconcileSoon);
    else setTimeout(reconcileSoon, 0);
  }
  window.addEventListener("pageshow", (event) => {
    if (event.persisted) {
      announcePageStart();
      reconcileSoon();
    }
  });
  window.addEventListener("pagehide", flush, { once: true });

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type !== "dcb.stats.snapshot") return;
    const page = message.reconcile === false ? snapshot() : reconcile(document);
    sendResponse({ ok: true, pageId: PAGE_ID, page });
  });
})();

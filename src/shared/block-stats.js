(() => {
  "use strict";

  if (globalThis.DCBBlockStats) return;

  const FLUSH_DELAY_MS = 120;
  const SCAN_DELAY_MS = 40;
  const MAX_PENDING_ROOTS = 80;
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
    {
      selector: '.dcb-selective-dccon-hidden,[data-dcb-selective-dccon-hidden="true"]',
      category: "dccon"
    },
    { selector: ".dcb-cleaner-dccon-comment-hidden,.dcb-cleaner-dccon-content-hidden,.dcbpv-dccon-hidden,[data-dcb-dccon-hidden=\"true\"]", category: "dccon", canonicalComment: true },
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
  const RECOVERY_ATTRIBUTE_FILTER = Object.freeze([
    "class",
    "id",
    "style",
    "src",
    "reqpath",
    "data-dcb-keyword-hidden",
    "data-dcb-keyword-soft-hidden",
    "data-dcb-text-detection-hidden",
    "data-dcb-selective-dccon-hidden",
    "data-dcb-dccon-hidden",
    "data-dcb-area-hidden",
    "data-dcbpv-blocked-reason"
  ]);

  let observer = null;
  let flushTimer = 0;
  let scanTimer = 0;
  let flushInFlight = false;
  let syncDirty = false;
  let pendingFullScan = false;
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

  function forEachMatch(root, selector, callback) {
    if (!root || !selector || typeof callback !== "function") return;
    if (root instanceof Element && root.matches?.(selector)) callback(root);
    root.querySelectorAll?.(selector).forEach(callback);
  }

  function scanRecoveryMarkers(root = document) {
    if (!root) return;

    // 미리보기 댓글은 행 하나를 한 번만 센다. 내부 디시콘/텍스트콘 표식과 중복 집계하지 않는다.
    forEachMatch(root, '.dcbpv-comment-item.dcbpv-filter-hidden[data-dcbpv-blocked-reason]', (row) => {
      report(row, previewReasonCategory(row.dataset?.dcbpvBlockedReason));
    });

    forEachMatch(root, RECOVERY_SELECTOR, (element) => {
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

  function scanStyleRule(rule, root = document) {
    if (!root || !rule) return;

    const handle = (element) => {
      if (!(element instanceof Element)) return;
      const target = canonicalRecoveryTarget(element, rule);
      if (target) report(target, rule.category);
    };
    forEachMatch(root, rule.selector, handle);
  }

  function activeStyleNode(rule) {
    const style = document.getElementById?.(rule?.styleId);
    if (!style) return null;
    return String(style.textContent || "").trim() ? style : null;
  }

  function scanStyleRecovery(root = document) {
    if (!root) return;

    for (const rule of STYLE_RECOVERY_RULES) {
      if (!activeStyleNode(rule)) continue;
      scanStyleRule(rule, root);
    }
  }

  function scanActivatedStyleRecovery(root) {
    if (!root) return;

    for (const rule of STYLE_RECOVERY_RULES) {
      const isStyle = root instanceof Element && root.id === rule.styleId;
      if (!isStyle && !root.querySelector?.(`#${rule.styleId}`)) continue;
      if (!activeStyleNode(rule)) continue;

      // 스타일 삽입 자체는 차단 대상의 조상이 아니므로, 활성화된 규칙만 문서에서 한 번 복구한다.
      scanStyleRule(rule, document);
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
    const fullScan = pendingFullScan;
    pendingFullScan = false;
    const roots = fullScan ? [document] : minimizeRoots(Array.from(pendingRoots));
    pendingRoots.clear();
    if (!roots.length) return;

    for (const root of roots) {
      registrations.forEach((registration) => scanRegistration(registration, root));
      scanRecoveryMarkers(root);
      scanStyleRecovery(root);
      // 전체 루트에서는 위 scanStyleRecovery가 이미 모든 활성 스타일 대상을 훑었다.
      if (root !== document && root !== document.documentElement) scanActivatedStyleRecovery(root);
    }
  }

  function scheduleScan(root) {
    if (!(root instanceof Element) && !(root instanceof DocumentFragment)) return;
    if (!pendingFullScan) {
      pendingRoots.add(root);
      if (pendingRoots.size > MAX_PENDING_ROOTS) {
        // 대형 DOM batch에서 minimizeRoots의 O(n²) 비교를 피하고 전체 스캔 한 번으로 상한을 둔다.
        pendingRoots.clear();
        pendingFullScan = true;
      }
    }
    if (scanTimer) return;
    scanTimer = setTimeout(flushScans, SCAN_DELAY_MS);
  }

  function relevantAttributeMutation(record) {
    const target = record?.target;
    if (!(target instanceof Element)) return false;
    if (target.matches?.(RECOVERY_SELECTOR)) return true;
    if (target.matches?.('.dcbpv-comment-item.dcbpv-filter-hidden[data-dcbpv-blocked-reason]')) return true;
    if (STYLE_RECOVERY_RULES.some((rule) => target.id === rule.styleId)) return true;
    return STYLE_RECOVERY_RULES.some((rule) => (
      !!activeStyleNode(rule) && target.matches?.(rule.selector)
    ));
  }

  function ensureObserver() {
    if (observer) return;
    const target = document.documentElement || document;
    if (!target) return;

    observer = new MutationObserver((records) => {
      for (const record of records) {
        if (record.type === "attributes") {
          if (relevantAttributeMutation(record)) scheduleScan(record.target);
          continue;
        }
        if (
          record.target instanceof Element
          && STYLE_RECOVERY_RULES.some((rule) => record.target.id === rule.styleId)
        ) {
          // 기존 스타일 노드의 textContent가 다시 채워지는 재활성화도 놓치지 않는다.
          scheduleScan(record.target);
        }
        for (const node of record.addedNodes || []) scheduleScan(node);
      }
    });
    observer.observe(target, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: RECOVERY_ATTRIBUTE_FILTER
    });
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

  // 복구 표식은 각 차단기가 registerSelector()를 쓰지 않아도 동적으로 생길 수 있다.
  ensureObserver();
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

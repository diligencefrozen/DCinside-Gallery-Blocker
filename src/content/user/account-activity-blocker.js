(() => {
  "use strict";

  const FILTER = () => globalThis.DCBAccountActivityFilter;
  const STYLE_ID = "dcb-account-activity-style";
  const HIDDEN_CLASS = "dcb-account-activity-hidden";
  const PENDING_CLASS = "dcb-account-activity-pending";
  const NOTICE_CLASS = "dcb-account-activity-notice";
  const MAX_UNCACHED_UIDS_PER_PAGE = 12;
  const WRITER_SELECTOR = [
    ".gall_writer",
    ".ub-writer",
    ".dcb-uid-badge",
    "[data-full-uid]",
    "[data-uid]",
    "[data-memo-uid]"
  ].join(",");

  let observer = null;
  let scanTimer = null;
  let incrementalTimer = null;
  let rulesEpoch = 0;
  const attemptedUids = new Set();
  const pendingRoots = new Set();

  const cleanText = (value) => String(value ?? "").trim();

  function escapeHtml(value) {
    return cleanText(value).replace(/[&<>"']/g, (char) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[char]));
  }

  function normalizeUid(value) {
    const uid = cleanText(value)
      .replace(/^uid\s*[:=]\s*/i, "")
      .replace(/^@+/, "")
      .replace(/[\s\)\]>'";]+$/g, "")
      .trim();
    if (!/^[A-Za-z0-9._-]{2,64}$/.test(uid)) return "";
    if (/^\d{1,3}(?:\.\d{1,3}){1,3}$/.test(uid)) return "";
    return uid;
  }

  function dataValue(scope, names) {
    for (const name of names) {
      const own = cleanText(scope?.getAttribute?.(name));
      if (own) return own;
      const child = scope?.querySelector?.(`[${name}]`);
      const nested = cleanText(child?.getAttribute?.(name));
      if (nested) return nested;
    }
    return "";
  }

  function uidFromGallog(scope) {
    if (!scope) return "";
    const nestedRefs = scope.querySelectorAll?.(
      "[href*='gallog.dcinside.com'],[onclick*='gallog.dcinside.com']"
    ) || [];
    const refs = [scope, ...nestedRefs];
    for (const ref of refs) {
      const text = [ref.getAttribute?.("href"), ref.getAttribute?.("onclick")]
        .filter(Boolean)
        .join(" ");
      const path = text.match(/gallog\.dcinside\.com\/?([A-Za-z0-9._-]{2,64})/i);
      if (path) return normalizeUid(path[1]);
      const query = text.match(/[?&](?:id|user_id|userid|uid)=([A-Za-z0-9._-]{2,64})/i);
      if (query) return normalizeUid(query[1]);
    }
    return "";
  }

  function hasGallogMarker(scope) {
    if (!scope) return false;
    if (uidFromGallog(scope)) return true;
    if (scope.matches?.(".writer_nikcon,.dcb-uid-badge")) return true;
    return !!scope.querySelector?.(
      ".writer_nikcon,.dcb-uid-badge,[href*='gallog'],[onclick*='gallog']"
    );
  }

  function extractUid(writer) {
    if (!hasGallogMarker(writer)) return "";
    const raw =
      dataValue(writer, ["data-full-uid", "data-uid", "data-memo-uid", "data-user-id", "data-userid", "data-user_id"]) ||
      cleanText(writer?.querySelector?.(".dcb-uid-badge")?.getAttribute?.("data-full-uid")) ||
      uidFromGallog(writer);
    return normalizeUid(raw);
  }

  function canonicalWriter(node) {
    return node?.closest?.(".gall_writer,.ub-writer") || node;
  }

  function targetForWriter(writer) {
    const comment = writer.closest?.(
      ".dcbpv-comment-item,#focus_cmt li,.comment_wrap li,.cmt_list li,.reply_box li,.reply_list li,.dccon_comment_box li"
    );
    if (comment) return { kind: "comment", target: comment, showNotice: false };

    const listPost = writer.closest?.(
      ".gall_list tr.ub-content,.gall_list tr[data-no],.gall_list tr.gall_tr," +
      "tr.ub-content,tr[data-no],tr.gall_tr,.gall_list li.ub-content,.gall_list li.gall_item,li.gall_item"
    );
    if (listPost) return { kind: "post", target: listPost, showNotice: false };

    const preview = writer.closest?.("#dcb-preview-overlay");
    if (preview) {
      const article = preview.querySelector(".dcbpv-article");
      if (article) return { kind: "post", target: article, showNotice: true };
    }

    if (writer.getAttribute?.("data-loc") === "view" || writer.closest?.(".gallview_head,.view_head,.view_content_wrap")) {
      const view = writer.closest?.(".view_content_wrap") || document.querySelector(".view_content_wrap");
      if (view) return { kind: "post", target: view, showNotice: true };
    }

    return null;
  }

  function installStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const root = document.head || document.documentElement;
    if (!root) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      .${HIDDEN_CLASS},.${PENDING_CLASS}{display:none!important}
      .${NOTICE_CLASS}{display:flex;align-items:center;gap:12px;margin:12px 0;padding:13px 14px;border:1px dashed rgba(244,63,94,.45);border-radius:14px;background:#111827;color:#e5e7eb;font:700 12px/1.45 system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif}
      .${NOTICE_CLASS}[data-pending='1']{border-color:rgba(56,189,248,.45)}
      .${NOTICE_CLASS} span{min-width:0}
      .${NOTICE_CLASS} strong{display:block;color:#fff;font-size:13px;margin-bottom:2px}
      .${NOTICE_CLASS} small{display:block;color:#a5b4c7;font-size:11px;word-break:break-word}
      .${NOTICE_CLASS} button{margin-left:auto;flex:0 0 auto;border:0;border-radius:999px;background:#f8fafc;color:#111827;padding:8px 12px;font:800 11px/1 system-ui;cursor:pointer}
    `;
    root.appendChild(style);
  }

  function removeNotice(target) {
    const previous = target?.previousElementSibling;
    if (previous?.classList?.contains(NOTICE_CLASS)) previous.remove();
  }

  function clearTarget(target, uid = "") {
    if (!target) return;
    target.classList.remove(HIDDEN_CLASS, PENDING_CLASS);
    removeNotice(target);
    if (!uid || target.dataset.dcbAccountActivityUid === uid) {
      delete target.dataset.dcbAccountActivityUid;
      delete target.dataset.dcbAccountActivityState;
      delete target.dataset.dcbAccountActivitySummary;
    }
  }

  function revealTemporarily(target, uid) {
    target.dataset.dcbAccountActivityPeek = uid;
    clearTarget(target, uid);
  }

  function showTargetNotice(target, uid, verdict, pending) {
    removeNotice(target);
    const notice = document.createElement("div");
    notice.className = NOTICE_CLASS;
    notice.dataset.pending = pending ? "1" : "0";
    const title = pending ? "작성자 활동 정보를 확인하고 있어요" : "활동이 적은 회원의 게시글을 숨겼어요";
    const detail = pending ? `UID ${uid} · 확인하는 동안 먼저 접어 둡니다` : `UID ${uid} · ${verdict?.summary || "설정한 활동 기준 미달"}`;
    notice.innerHTML = `<span><strong>${escapeHtml(title)}</strong><small>${escapeHtml(detail)}</small></span><button type="button">게시글 보기</button>`;
    notice.querySelector("button").addEventListener("click", () => revealTemporarily(target, uid));
    target.parentNode?.insertBefore(notice, target);
  }

  function setState(info, uid, state, verdict = null) {
    const { target, showNotice } = info;
    const summary = cleanText(verdict?.summary);
    if (
      target.dataset.dcbAccountActivityUid === uid &&
      target.dataset.dcbAccountActivityState === state &&
      target.dataset.dcbAccountActivitySummary === summary
    ) return;
    target.dataset.dcbAccountActivityUid = uid;
    target.dataset.dcbAccountActivityState = state;
    target.dataset.dcbAccountActivitySummary = summary;
    target.classList.toggle(PENDING_CLASS, state === "pending");
    target.classList.toggle(HIDDEN_CLASS, state === "hidden");
    if (state === "hidden") globalThis.DCBBlockStats?.report?.(target, "lowActivity");
    if (showNotice && (state === "pending" || state === "hidden")) {
      showTargetNotice(target, uid, verdict, state === "pending");
    } else {
      removeNotice(target);
    }
  }

  function settingAllows(settings, kind) {
    return kind === "comment" ? settings.blockComments !== false : settings.blockPosts !== false;
  }

  async function evaluateWriter(writer, filter, settings, epoch) {
    const uid = extractUid(writer);
    if (!uid) return;
    const info = targetForWriter(writer);
    if (!info) return;

    const { target } = info;
    if (!settingAllows(settings, info.kind)) {
      clearTarget(target);
      return;
    }
    if (target.dataset.dcbAccountActivityPeek === uid) {
      clearTarget(target, uid);
      return;
    }

    const cached = filter.peek?.(uid);
    if (cached) {
      if (cached.shouldHide) setState(info, uid, "hidden", cached);
      else clearTarget(target, uid);
      return;
    }

    const attemptKey = uid.toLowerCase();
    if (!attemptedUids.has(attemptKey)) {
      if (attemptedUids.size >= MAX_UNCACHED_UIDS_PER_PAGE) {
        clearTarget(target, uid);
        return;
      }
      attemptedUids.add(attemptKey);
    }

    if (settings.holdWhileChecking) setState(info, uid, "pending");
    else {
      target.dataset.dcbAccountActivityUid = uid;
      target.dataset.dcbAccountActivityState = "checking";
    }

    const verdict = await filter.evaluate(uid);
    if (epoch !== rulesEpoch) return;
    if (!target.isConnected || target.dataset.dcbAccountActivityUid !== uid) return;
    if (target.dataset.dcbAccountActivityPeek === uid) {
      clearTarget(target, uid);
      return;
    }
    if (verdict?.shouldHide) setState(info, uid, "hidden", verdict);
    else clearTarget(target, uid);
  }

  function clearAll(resetPeek = false) {
    document.querySelectorAll(`[data-dcb-account-activity-uid],[data-dcb-account-activity-peek],.${HIDDEN_CLASS},.${PENDING_CLASS}`).forEach((target) => {
      clearTarget(target);
      if (resetPeek) delete target.dataset.dcbAccountActivityPeek;
    });
    document.querySelectorAll(`.${NOTICE_CLASS}`).forEach((notice) => notice.remove());
  }

  function writerNodesInScope(scope) {
    const nodes = [];
    if (!scope) return nodes;
    if (scope === document || scope.nodeType === Node.DOCUMENT_NODE) {
      document.querySelectorAll(WRITER_SELECTOR).forEach((node) => nodes.push(node));
      return nodes;
    }
    if (scope.nodeType !== Node.ELEMENT_NODE && scope.nodeType !== Node.DOCUMENT_FRAGMENT_NODE) return nodes;
    if (scope.nodeType === Node.ELEMENT_NODE) {
      if (scope.matches?.(WRITER_SELECTOR)) nodes.push(scope);
      const owner = scope.closest?.(".gall_writer,.ub-writer");
      if (owner) nodes.push(owner);
    }
    scope.querySelectorAll?.(WRITER_SELECTOR).forEach((node) => nodes.push(node));
    return nodes;
  }

  async function scanScope(scope = document) {
    const filter = FILTER();
    if (!filter) return;
    await filter.ready();
    const settings = filter.getSettings();
    if (!settings.enabled) {
      if (scope === document) clearAll();
      return;
    }
    if (document.visibilityState === "hidden") return;

    const epoch = rulesEpoch;
    const seen = new Set();
    writerNodesInScope(scope).forEach((node) => {
      const writer = canonicalWriter(node);
      if (!writer || seen.has(writer)) return;
      seen.add(writer);
      void evaluateWriter(writer, filter, settings, epoch);
    });
  }

  async function scan() {
    return scanScope(document);
  }

  function scheduleScan(delay = 80) {
    if (scanTimer) clearTimeout(scanTimer);
    scanTimer = setTimeout(() => {
      scanTimer = null;
      void scan();
    }, delay);
  }

  function minimalPendingRoots() {
    const roots = Array.from(pendingRoots).filter((root) => root?.isConnected !== false);
    pendingRoots.clear();
    return roots.filter((root, index) => {
      if (!(root instanceof Element)) return true;
      return !roots.some((other, otherIndex) => (
        index !== otherIndex && other instanceof Element && other.contains?.(root)
      ));
    });
  }

  function flushIncrementalScans() {
    incrementalTimer = null;
    const roots = minimalPendingRoots();
    if (!roots.length) return;
    roots.forEach((root) => void scanScope(root));
  }

  function queueIncrementalScan(root) {
    if (!root || (root.nodeType !== Node.ELEMENT_NODE && root.nodeType !== Node.DOCUMENT_FRAGMENT_NODE)) return;
    pendingRoots.add(root);
    if (incrementalTimer) return;
    incrementalTimer = setTimeout(flushIncrementalScans, 80);
  }

  function watch() {
    if (observer || !document.documentElement) return;
    observer = new MutationObserver((records) => {
      for (const record of records) {
        if (record.type === "attributes") {
          queueIncrementalScan(record.target);
          continue;
        }
        for (const node of record.addedNodes || []) queueIncrementalScan(node);
      }
    });
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["data-uid", "data-full-uid", "data-memo-uid", "href", "onclick"]
    });
  }

  window.addEventListener("dcb:account-activity-rules-changed", () => {
    rulesEpoch += 1;
    attemptedUids.clear();
    clearAll(true);
    scheduleScan(0);
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "hidden") scheduleScan(0);
  });
  document.addEventListener("dcb-preview-state", (event) => {
    if (!event?.detail?.open) return;
    const preview = document.getElementById("dcb-preview-overlay");
    preview?.querySelectorAll?.(`[data-dcb-account-activity-uid],[data-dcb-account-activity-peek],.${HIDDEN_CLASS},.${PENDING_CLASS}`).forEach((target) => {
      clearTarget(target);
      delete target.dataset.dcbAccountActivityPeek;
    });
    if (preview) queueIncrementalScan(preview);
  });

  installStyle();
  watch();
  scheduleScan(0);
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      installStyle();
      watch();
      scheduleScan(0);
    }, { once: true });
  }
})();

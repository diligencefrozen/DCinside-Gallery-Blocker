/*****************************************************************
 * cleaner-foreign-ip.js — 해외/우회 접속 IP 글·댓글 숨김
 *
 * Performance notes:
 * - Do one full discovery pass only when the feature is enabled.
 * - After that, process only rows/comments affected by DOM mutations.
 * - Never observe class changes; our own classList updates must not
 *   wake this observer and trigger document-wide rescans.
 *****************************************************************/
(() => {
  "use strict";
  const classifier = globalThis.DCBIpNetworkClassifier;
  if (!classifier) return;

  const STYLE_ID = "dcb-foreign-ip-clean-style";
  const HIDDEN_CLASS = "dcb-foreign-ip-hidden";
  const OWNED_ATTR = "data-dcb-foreign-ip-cleaner";
  const WRITER_SELECTOR = [
    ".gall_writer", ".ub-writer", ".writer_info[data-ip]", ".writer_info[data-memo-ip]",
    ".user_info[data-ip]", ".user_info[data-memo-ip]", ".cmt_nickbox[data-ip]",
    ".cmt_nickbox[data-memo-ip]", "[data-loc='list'][data-ip]", "[data-loc='list'][data-memo-ip]",
    "[data-loc='view'][data-ip]", "[data-loc='view'][data-memo-ip]"
  ].join(",");
  const COMMENT_ROOT_SELECTOR = "#focus_cmt,.comment_wrap,.cmt_list,.reply_box,.reply_list,.dccon_comment_box";
  const COMMENT_ITEM_SELECTOR = "#focus_cmt li,.comment_wrap li,.cmt_list li,.reply_box li,.reply_list li,.dccon_comment_box li,li.ub-content";
  const LIST_ITEM_SELECTOR = ".gall_list tr.ub-content,.gall_list tr[data-no],.gall_list tr.gall_tr,tr.ub-content,tr[data-no],tr.gall_tr,.gall_list li.ub-content,.gall_list li.gall_item,li.gall_item,.gall_item";
  const BLOCKED_CATEGORIES = new Set(["foreign", "anonymizer", "relay"]);

  let enabled = false;
  let observer = null;
  let scanFrame = 0;
  const pendingTargets = new Set();

  function ensureStyle() {
    let style = document.getElementById(STYLE_ID);
    if (!style) {
      style = document.createElement("style");
      style.id = STYLE_ID;
      (document.head || document.documentElement).appendChild(style);
    }
    style.textContent = `.${HIDDEN_CLASS}{display:none!important}`;
  }

  function readIp(writer) {
    for (const name of ["data-ip", "data-memo-ip"]) {
      const value = writer.getAttribute?.(name) || writer.querySelector?.(`[${name}]`)?.getAttribute(name);
      if (value) return value;
    }
    const ipNode = writer.matches?.(".ip,.writer_ip") ? writer : writer.querySelector?.(".ip,.writer_ip");
    const text = String(ipNode?.textContent || "").trim();
    // class="ip" is also used for date fragments in some comment templates.
    // Without an explicit IP attribute, date-like two-octet text is uncertain.
    if (/^\(?\d{2,4}\.\d{1,2}\)?$/.test(text)) return "";
    return text;
  }

  function isBlockedWriter(writer) {
    return BLOCKED_CATEGORIES.has(classifier.classify(readIp(writer)).category);
  }

  function criticalFilterOwnsListRows() {
    return !!globalThis.DCBCriticalFilter?.processRoot;
  }

  function findTarget(writer) {
    if (writer.closest?.(COMMENT_ROOT_SELECTOR)) return writer.closest?.(COMMENT_ITEM_SELECTOR) || null;
    const row = writer.closest?.(LIST_ITEM_SELECTOR);
    // The first-paint critical filter already owns list rows in the top frame.
    // Avoid classifying and mutating the same row twice there. Iframes without
    // the critical filter still fall back to this cleaner.
    if (row) return criticalFilterOwnsListRows() ? null : row;
    const isViewWriter = writer.getAttribute?.("data-loc") === "view" || !!writer.closest?.(".gallview_head,.view_head,.view_content_wrap");
    if (!isViewWriter) return null;
    return writer.closest?.(".view_content_wrap") || document.querySelector?.(".view_content_wrap") || writer.closest?.(".view_wrap,.gallview,article,.gallview_head,.view_head") || null;
  }

  function findContainingTarget(node) {
    if (!(node instanceof Element)) return null;
    if (node.closest?.(COMMENT_ROOT_SELECTOR)) {
      const item = node.closest?.(COMMENT_ITEM_SELECTOR);
      if (item) return item;
    }
    const row = node.closest?.(LIST_ITEM_SELECTOR);
    if (row) return criticalFilterOwnsListRows() ? null : row;
    if (node.closest?.(".gallview_head,.view_head,.view_content_wrap")) {
      return node.closest?.(".view_content_wrap") || document.querySelector?.(".view_content_wrap") || node.closest?.(".view_wrap,.gallview,article,.gallview_head,.view_head") || null;
    }
    return null;
  }

  function setTargetHidden(target, hidden) {
    if (!(target instanceof Element)) return;
    if (hidden) {
      target.setAttribute(OWNED_ATTR, "");
      target.classList.add(HIDDEN_CLASS);
      return;
    }
    if (!target.hasAttribute(OWNED_ATTR)) return;
    target.removeAttribute(OWNED_ATTR);
    target.classList.remove(HIDDEN_CLASS);
  }

  function evaluateTarget(target) {
    if (!enabled || !(target instanceof Element) || !target.isConnected) return;
    const writers = target.matches?.(WRITER_SELECTOR)
      ? [target, ...(target.querySelectorAll?.(WRITER_SELECTOR) || [])]
      : [...(target.querySelectorAll?.(WRITER_SELECTOR) || [])];
    setTargetHidden(target, writers.some(isBlockedWriter));
  }

  function collectTargetsFromRoot(root, targets) {
    if (!(root instanceof Element)) return;

    const containing = findContainingTarget(root);
    if (containing) targets.add(containing);

    if (root.matches?.(WRITER_SELECTOR)) {
      const target = findTarget(root);
      if (target) targets.add(target);
    }
    root.querySelectorAll?.(WRITER_SELECTOR).forEach((writer) => {
      const target = findTarget(writer);
      if (target) targets.add(target);
    });
  }

  function flushPendingTargets() {
    scanFrame = 0;
    if (!enabled) {
      pendingTargets.clear();
      return;
    }
    const targets = [...pendingTargets];
    pendingTargets.clear();
    targets.forEach(evaluateTarget);
  }

  function scheduleTargets(targets) {
    for (const target of targets) {
      if (target instanceof Element && target.isConnected) pendingTargets.add(target);
    }
    if (!pendingTargets.size || scanFrame) return;
    scanFrame = requestAnimationFrame(flushPendingTargets);
  }

  function scheduleRoot(root) {
    const targets = new Set();
    collectTargetsFromRoot(root, targets);
    scheduleTargets(targets);
  }

  function initialScan() {
    if (!enabled) return;
    ensureStyle();
    const targets = new Set();
    document.querySelectorAll(WRITER_SELECTOR).forEach((writer) => {
      const target = findTarget(writer);
      if (target) targets.add(target);
    });
    targets.forEach(evaluateTarget);
  }

  function stop() {
    observer?.disconnect();
    observer = null;
    if (scanFrame) cancelAnimationFrame(scanFrame);
    scanFrame = 0;
    pendingTargets.clear();
    document.querySelectorAll(`[${OWNED_ATTR}]`).forEach((el) => setTargetHidden(el, false));
    document.getElementById(STYLE_ID)?.remove();
  }

  function start() {
    observer?.disconnect();
    observer = new MutationObserver((records) => {
      const targets = new Set();
      for (const record of records) {
        if (record.type === "attributes") {
          collectTargetsFromRoot(record.target, targets);
          continue;
        }

        // Re-evaluate the container after removals (for example, when the only
        // foreign writer node disappears from an existing comment/row).
        const parentTarget = findContainingTarget(record.target);
        if (parentTarget) targets.add(parentTarget);

        for (const node of record.addedNodes) {
          if (node.nodeType === Node.ELEMENT_NODE) collectTargetsFromRoot(node, targets);
        }
      }
      scheduleTargets(targets);
    });
    observer.observe(document.documentElement || document, {
      childList: true,
      subtree: true,
      attributes: true,
      // Deliberately exclude "class": class mutations are extremely frequent
      // on DCInside and include this extension's own badge/filter updates.
      attributeFilter: ["data-ip", "data-memo-ip", "data-loc"]
    });
  }

  function apply(value) {
    enabled = !!value;
    if (!enabled) return stop();
    ensureStyle();
    initialScan();
    start();
  }

  try {
    chrome.storage.sync.get({ hideForeignIpEnabled: false }, ({ hideForeignIpEnabled }) => apply(hideForeignIpEnabled));
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === "sync" && changes.hideForeignIpEnabled) apply(changes.hideForeignIpEnabled.newValue);
    });
  } catch (_) {}
})();

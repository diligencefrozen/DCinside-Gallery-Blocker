/*****************************************************************
 * cleaner-foreign-ip.js — 해외/우회망 후보 글·댓글 숨김
 *****************************************************************/
(() => {
  "use strict";
  const classifier = globalThis.DCBIpNetworkClassifier;
  if (!classifier) return;
  const STYLE_ID = "dcb-foreign-ip-clean-style";
  const HIDDEN_CLASS = "dcb-foreign-ip-hidden";
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
  function findTarget(writer) {
    if (writer.closest?.(COMMENT_ROOT_SELECTOR)) return writer.closest?.(COMMENT_ITEM_SELECTOR) || null;
    const row = writer.closest?.(LIST_ITEM_SELECTOR);
    if (row) return row;
    const isViewWriter = writer.getAttribute?.("data-loc") === "view" || !!writer.closest?.(".gallview_head,.view_head,.view_content_wrap");
    if (!isViewWriter) return null;
    return writer.closest?.(".view_content_wrap") || document.querySelector?.(".view_content_wrap") || writer.closest?.(".view_wrap,.gallview,article,.gallview_head,.view_head") || null;
  }
  function collectTargets(root = document) {
    const targets = new Set();
    const writers = root.matches?.(WRITER_SELECTOR) ? [root, ...(root.querySelectorAll?.(WRITER_SELECTOR) || [])] : root.querySelectorAll?.(WRITER_SELECTOR) || [];
    writers.forEach((writer) => {
      if (!BLOCKED_CATEGORIES.has(classifier.classify(readIp(writer)).category)) return;
      const target = findTarget(writer);
      if (target) targets.add(target);
    });
    return targets;
  }
  function hideNow() {
    if (!enabled) return;
    ensureStyle();
    const targets = collectTargets();
    document.querySelectorAll(`.${HIDDEN_CLASS}`).forEach((el) => { if (!targets.has(el)) el.classList.remove(HIDDEN_CLASS); });
    targets.forEach((el) => el.classList.add(HIDDEN_CLASS));
  }
  function scheduleHideNow() {
    if (scanFrame) return;
    scanFrame = requestAnimationFrame(() => { scanFrame = 0; hideNow(); });
  }
  function stop() {
    observer?.disconnect(); observer = null;
    if (scanFrame) cancelAnimationFrame(scanFrame);
    scanFrame = 0;
    document.querySelectorAll(`.${HIDDEN_CLASS}`).forEach((el) => el.classList.remove(HIDDEN_CLASS));
    document.getElementById(STYLE_ID)?.remove();
  }
  function start() {
    observer?.disconnect();
    observer = new MutationObserver((records) => {
      if (records.some((record) => record.addedNodes.length || record.removedNodes.length || record.type === "attributes")) scheduleHideNow();
    });
    observer.observe(document.documentElement || document, { childList: true, subtree: true, attributes: true, attributeFilter: ["data-ip", "data-memo-ip", "data-loc", "class"] });
  }
  function apply(value) {
    enabled = !!value;
    if (!enabled) return stop();
    hideNow(); start();
  }
  try {
    chrome.storage.sync.get({ hideForeignIpEnabled: false }, ({ hideForeignIpEnabled }) => apply(hideForeignIpEnabled));
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === "sync" && changes.hideForeignIpEnabled) apply(changes.hideForeignIpEnabled.newValue);
    });
  } catch (_) {}
})();

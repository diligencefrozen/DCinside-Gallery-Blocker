// member-ip-view.js
// Adds compact network hints to visible DCInside IP fragments.
(() => {
  "use strict";

  const STORAGE_KEY = "showMemberIpInfo";
  const BADGE_CLASS = "dc-member-ip-chip";
  const STYLE_ID = "dc-member-ip-view-style";
  const classifier = globalThis.DCBIpNetworkClassifier;
  if (!classifier) return;
  const { normalizeIpText, describeIpFragment } = classifier;

  function unwrapIpToken(raw) {
    return String(raw || "")
      .trim()
      .replace(/^\(|\)$/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function isDateLikeIpToken(raw) {
    const token = unwrapIpToken(raw);
    if (!token) return false;

    return /^(?:\d{2,4}\.)?\d{1,2}\.\d{1,2}(?:\s+\d{1,2}:\d{2}(?::\d{2})?)?$/.test(token)
      || /^\d{1,2}:\d{2}(?::\d{2})?$/.test(token);
  }

  function isWriterIpContext(ipEl) {
    return !!(
      ipEl?.matches?.(".writer_ip") ||
      ipEl?.closest?.(".gall_writer,.ub-writer,.writer_info,.user_info,.cmt_nickbox,[data-ip],[data-memo-ip]")
    );
  }

  function shouldSkipIpElement(ipEl) {
    if (!(ipEl instanceof Element)) return true;
    if (!isDateLikeIpToken(ipEl.textContent || "")) return false;

    // DCInside uses class="ip" both for anonymous IP fragments and for date text
    // such as (06.28). Only allow date-shaped tokens when they are inside
    // an actual writer/IP context; otherwise they are timestamps, not IPs.
    return !isWriterIpContext(ipEl);
  }
  function ensureBadgeStyle() {
    let style = document.getElementById(STYLE_ID);
    if (!style) {
      style = document.createElement("style");
      style.id = STYLE_ID;
      (document.head || document.documentElement).appendChild(style);
    }

    style.textContent = `
      .${BADGE_CLASS}{
        --member-ip-bg:rgba(76, 99, 255, .09);
        --member-ip-fg:#3446a8;
        --member-ip-ring:rgba(76, 99, 255, .22);
        display:inline-flex !important;
        align-items:center !important;
        gap:3px !important;
        max-width:62px !important;
        height:15px !important;
        margin-left:3px !important;
        padding:0 4px !important;
        border:1px solid var(--member-ip-ring) !important;
        border-radius:8px !important;
        background:linear-gradient(180deg, rgba(255,255,255,.78), rgba(255,255,255,.52)), var(--member-ip-bg) !important;
        box-shadow:0 1px 2px rgba(15,23,42,.06), inset 0 1px 0 rgba(255,255,255,.55) !important;
        color:var(--member-ip-fg) !important;
        font:800 10px/1.1 Arial, Helvetica, sans-serif !important;
        letter-spacing:-.25px !important;
        white-space:nowrap !important;
        vertical-align:middle !important;
        overflow:hidden !important;
        text-overflow:ellipsis !important;
        box-sizing:border-box !important;
      }
      .${BADGE_CLASS}::before{
        content:"" !important;
        flex:0 0 4px !important;
        width:4px !important;
        height:4px !important;
        border-radius:50% !important;
        background:currentColor !important;
        opacity:.78 !important;
      }
      .${BADGE_CLASS}[data-tone="wired"]{--member-ip-bg:rgba(38, 166, 91, .10);--member-ip-fg:#257247;--member-ip-ring:rgba(38, 166, 91, .24);}
      .${BADGE_CLASS}[data-tone="mobile"]{--member-ip-bg:rgba(59, 130, 246, .11);--member-ip-fg:#285ba9;--member-ip-ring:rgba(59, 130, 246, .24);}
      .${BADGE_CLASS}[data-tone="risk"]{--member-ip-bg:rgba(239, 68, 68, .10);--member-ip-fg:#a83b3b;--member-ip-ring:rgba(239, 68, 68, .24);}
      .${BADGE_CLASS}[data-tone="foreign"]{--member-ip-bg:rgba(148, 163, 184, .16);--member-ip-fg:#566173;--member-ip-ring:rgba(148, 163, 184, .26);}
      .gall_list td.gall_writer .${BADGE_CLASS},
      .gall_list td.ub-writer .${BADGE_CLASS},
      td.gall_writer.ub-writer[data-loc="list"] .${BADGE_CLASS},
      td.ub-writer[data-loc="list"] .${BADGE_CLASS}{
        display:inline-flex !important;
        max-width:42px !important;
        height:13px !important;
        margin:0 0 0 1px !important;
        padding:0 2px !important;
        font-size:8px !important;
        letter-spacing:-.35px !important;
        vertical-align:baseline !important;
      }
      .gall_list td.gall_writer .${BADGE_CLASS}::before,
      .gall_list td.ub-writer .${BADGE_CLASS}::before,
      td.gall_writer.ub-writer[data-loc="list"] .${BADGE_CLASS}::before,
      td.ub-writer[data-loc="list"] .${BADGE_CLASS}::before{width:4px !important;height:4px !important;flex-basis:4px !important;}
      body.dcb-dark .${BADGE_CLASS}, .darkmode .${BADGE_CLASS}{
        background:linear-gradient(180deg, rgba(255,255,255,.08), rgba(255,255,255,.03)), var(--member-ip-bg) !important;
        box-shadow:none !important;
      }
    `;
  }

  function removeBadgeStyle() {
    document.getElementById(STYLE_ID)?.remove();
  }

  function removeMemberIpBadges(root = document) {
    root.querySelectorAll?.(`.${BADGE_CLASS}`).forEach((el) => el.remove());
  }

  function hasExistingBadge(ipEl) {
    const next = ipEl.nextElementSibling;
    return !!(next && next.classList && next.classList.contains(BADGE_CLASS));
  }

  function createMemberIpBadge(ip) {
    const info = describeIpFragment(ip);
    const tag = document.createElement("span");
    tag.className = BADGE_CLASS;
    tag.dataset.tone = info.tone;
    tag.dataset.ip = ip;
    tag.title = info.title;
    tag.textContent = info.label;
    return tag;
  }

  function attachMemberIpBadge(ipEl) {
    if (!(ipEl instanceof Element)) return;
    if (ipEl.closest?.(`.${BADGE_CLASS}`)) return;
    if (hasExistingBadge(ipEl)) return;
    if (shouldSkipIpElement(ipEl)) return;

    const ip = normalizeIpText(ipEl.textContent || "");
    if (!ip) return;

    ipEl.insertAdjacentElement("afterend", createMemberIpBadge(ip));
  }

  function attachMemberIpBadgeFromWriter(writer) {
    if (!(writer instanceof Element)) return;
    if (writer.querySelector?.(`.${BADGE_CLASS}`)) return;

    const ip = normalizeIpText(writer.getAttribute("data-ip") || writer.getAttribute("data-memo-ip") || "");
    if (!ip) return;

    const anchor = writer.querySelector?.(".ip,.writer_ip");
    if (anchor) {
      const anchorIp = normalizeIpText(anchor.textContent || "");
      if (anchorIp && anchorIp === ip && !shouldSkipIpElement(anchor)) {
        attachMemberIpBadge(anchor);
        return;
      }
    }

    const tools = writer.querySelector?.(".dcb-writer-tools");
    if (tools) {
      tools.insertAdjacentElement("afterbegin", createMemberIpBadge(ip));
      return;
    }

    const after = writer.querySelector?.(":scope > .writer_nikcon") || writer.querySelector?.(":scope > .nickname") || writer.querySelector?.(".writer_nikcon,.nickname");
    if (after) after.insertAdjacentElement("afterend", createMemberIpBadge(ip));
    else writer.appendChild(createMemberIpBadge(ip));
  }

  function refreshMemberIpBadges(root = document) {
    if (!enabled) {
      removeMemberIpBadges(root);
      removeBadgeStyle();
      return;
    }

    ensureBadgeStyle();
    root.querySelectorAll?.(".ip,.writer_ip").forEach(attachMemberIpBadge);
    root.querySelectorAll?.(".gall_writer[data-ip],.ub-writer[data-ip],.gall_writer[data-memo-ip],.ub-writer[data-memo-ip]").forEach(attachMemberIpBadgeFromWriter);
  }

  function scheduleMemberIpScan(root = document) {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      refreshMemberIpBadges(root);
    });
  }

  function isOwnNode(node) {
    return !!(
      node &&
      node.nodeType === 1 &&
      (node.closest?.("[data-dcb-owned]") || node.id === STYLE_ID || node.classList?.contains(BADGE_CLASS) || node.closest?.(`.${BADGE_CLASS}`))
    );
  }

  function shouldReact(mutations) {
    for (const mutation of mutations) {
      if (isOwnNode(mutation.target)) continue;
      if (mutation.type === "characterData") return true;
      for (const node of mutation.addedNodes) {
        if (isOwnNode(node)) continue;
        if (node.nodeType === 1 && (node.matches?.(".ip,.writer_ip,.gall_writer[data-ip],.ub-writer[data-ip],.gall_writer[data-memo-ip],.ub-writer[data-memo-ip]") || node.querySelector?.(".ip,.writer_ip,.gall_writer[data-ip],.ub-writer[data-ip],.gall_writer[data-memo-ip],.ub-writer[data-memo-ip]"))) return true;
      }
    }
    return false;
  }

  const observer = new MutationObserver((mutations) => {
    if (!enabled) return;
    if (shouldReact(mutations)) scheduleMemberIpScan(document);
  });

  function refreshWithCurrentState(root = document) {
    if (!enabled) {
      removeMemberIpBadges(root);
      return;
    }
    refreshMemberIpBadges(root);
  }

  try {
    globalThis.DCMemberIpView = Object.freeze({
      refresh: refreshWithCurrentState,
      describe: describeIpFragment
    });

    document.addEventListener("dc-member-ip-view:refresh", (event) => {
      refreshWithCurrentState(event?.detail?.root || document);
    });
  } catch (_) {}

  function boot() {
    try {
      chrome.storage.sync.get({ [STORAGE_KEY]: true }, (conf) => {
        enabled = !!conf[STORAGE_KEY];
        refreshMemberIpBadges(document);
      });

      chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== "sync" || !changes[STORAGE_KEY]) return;
        enabled = !!changes[STORAGE_KEY].newValue;
        refreshMemberIpBadges(document);
      });
    } catch (_) {
      refreshMemberIpBadges(document);
    }

    if (document.body) {
      observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
})();

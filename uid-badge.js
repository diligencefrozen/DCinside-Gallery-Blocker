// uid-badge.js
(() => {
  const BADGE = "dcb-uid-badge";
  const STYLE_ID = "dcb-uid-style";

  const MEMO_TRIGGER_CLASS = "dcb-user-memo-trigger";
  const WRITER_TOOLS_CLASS = "dcb-writer-tools";
  const WRITER_ENHANCED_CLASS = "dcb-writer-enhanced";

  let showEnabled = true;

  const isIpLike = (s) =>
    /^\d{1,3}(?:\.\d{1,3}){1,3}$/.test(String(s || "").trim());

  function isListWriter(writer) {
    return !!(
      writer &&
      writer.matches?.("td.gall_writer, .gall_list .gall_writer") &&
      (
        writer.getAttribute("data-loc") === "list" ||
        writer.closest(".gall_list")
      )
    );
  }

  function shortenUidForList(uid) {
    const s = String(uid || "").trim();
    if (s.length <= 8) return s;
    return `${s.slice(0, 8)}…`;
  }

  function cleanupEmptyWriterTools() {
    document.querySelectorAll(`.${WRITER_TOOLS_CLASS}`).forEach((tools) => {
      if (!tools.children.length) tools.remove();
    });

    document.querySelectorAll(`.${WRITER_ENHANCED_CLASS}`).forEach((writer) => {
      const tools = writer.querySelector(`:scope > .${WRITER_TOOLS_CLASS}`);
      if (!tools) writer.classList.remove(WRITER_ENHANCED_CLASS);
    });
  }

  function removeAllBadges() {
    document.querySelectorAll(`.${BADGE}`).forEach((el) => el.remove());
    cleanupEmptyWriterTools();
  }

  function removeInjectedStyle() {
    const st = document.getElementById(STYLE_ID);
    if (st) st.remove();

    const legacyStyle = document.getElementById(BADGE);
    if (legacyStyle && legacyStyle.tagName === "STYLE") {
      legacyStyle.remove();
    }
  }

  function restoreOriginalUi() {
    removeAllBadges();
    removeInjectedStyle();
  }

  function ensureStyle() {
    const legacyStyle = document.getElementById(BADGE);
    if (legacyStyle && legacyStyle.tagName === "STYLE") {
      legacyStyle.remove();
    }

    let st = document.getElementById(STYLE_ID);
    if (!st) {
      st = document.createElement("style");
      st.id = STYLE_ID;
      (document.head || document.documentElement).appendChild(st);
    }

    st.textContent = `
      .${WRITER_ENHANCED_CLASS}{
        max-width:100% !important;
      }

      .${WRITER_TOOLS_CLASS}{
        display:inline-flex !important;
        align-items:center !important;
        gap:4px !important;
        flex-wrap:nowrap !important;
        vertical-align:middle !important;
        margin-left:5px !important;
        max-width:100% !important;
        white-space:nowrap !important;
      }

      .${BADGE}{
        display:inline-flex !important;
        align-items:center !important;
        flex:0 0 auto !important;
        font-size:11px !important;
        color:#98a2b3 !important;
        background:rgba(152,162,179,.15) !important;
        padding:1px 6px !important;
        border-radius:10px !important;
        line-height:1.2 !important;
        white-space:nowrap !important;
        vertical-align:middle !important;
        position:static !important;
        z-index:auto !important;
        box-sizing:border-box !important;
      }

      .gall_writer .${BADGE}{
        position:static !important;
        z-index:auto !important;
      }

      .gall_writer.${WRITER_ENHANCED_CLASS}{
        overflow:visible !important;
      }

      .gall_writer.${WRITER_ENHANCED_CLASS} > .nickname,
      .gall_writer.${WRITER_ENHANCED_CLASS} > .writer_nikcon,
      .gall_writer.${WRITER_ENHANCED_CLASS} > .${WRITER_TOOLS_CLASS}{
        vertical-align:middle !important;
      }

      /*
        댓글/본문 작성자 영역
      */

      .cmt_nickbox .gall_writer.${WRITER_ENHANCED_CLASS},
      .cmt_info .gall_writer.${WRITER_ENHANCED_CLASS},
      .reply_info .gall_writer.${WRITER_ENHANCED_CLASS}{
        display:inline-flex !important;
        align-items:center !important;
        flex-wrap:wrap !important;
        gap:3px !important;
        max-width:100% !important;
        white-space:normal !important;
        overflow:visible !important;
      }

      .cmt_nickbox .gall_writer.${WRITER_ENHANCED_CLASS} > .nickname,
      .cmt_info .gall_writer.${WRITER_ENHANCED_CLASS} > .nickname,
      .reply_info .gall_writer.${WRITER_ENHANCED_CLASS} > .nickname{
        flex:0 1 auto !important;
        min-width:0 !important;
        max-width:none !important;
        white-space:normal !important;
        overflow:visible !important;
        text-overflow:clip !important;
        word-break:break-all !important;
      }

      .cmt_nickbox .gall_writer.${WRITER_ENHANCED_CLASS} > .writer_nikcon,
      .cmt_info .gall_writer.${WRITER_ENHANCED_CLASS} > .writer_nikcon,
      .reply_info .gall_writer.${WRITER_ENHANCED_CLASS} > .writer_nikcon{
        flex:0 0 auto !important;
      }

      .cmt_nickbox .gall_writer.${WRITER_ENHANCED_CLASS} > .${WRITER_TOOLS_CLASS},
      .cmt_info .gall_writer.${WRITER_ENHANCED_CLASS} > .${WRITER_TOOLS_CLASS},
      .reply_info .gall_writer.${WRITER_ENHANCED_CLASS} > .${WRITER_TOOLS_CLASS}{
        flex:0 0 auto !important;
        margin-left:5px !important;
        transform:translateX(2px) !important;
      }

      /*
        게시물 목록 작성자 칸 전용 최적화
        실제 구조:
        td.gall_writer
          div.addbox
            span.nickname
            a.writer_nikcon
          span.dcb-writer-tools

        핵심:
        - addbox는 18px 확보해서 디시 기본 마크가 잘리지 않게 보호
        - UID/메모 줄만 별도 압축
      */

      .gall_list td.gall_writer.${WRITER_ENHANCED_CLASS},
      td.gall_writer.ub-writer.${WRITER_ENHANCED_CLASS}[data-loc="list"]{
        overflow:visible !important;
        text-align:center !important;
        vertical-align:middle !important;
        white-space:normal !important;
        line-height:1.12 !important;
        padding-left:2px !important;
        padding-right:2px !important;
      }

      .gall_list td.gall_writer.${WRITER_ENHANCED_CLASS} .addbox,
      td.gall_writer.ub-writer.${WRITER_ENHANCED_CLASS}[data-loc="list"] .addbox{
        display:flex !important;
        align-items:center !important;
        justify-content:center !important;
        gap:2px !important;
        width:100% !important;
        max-width:100% !important;
        min-width:0 !important;
        min-height:18px !important;
        height:18px !important;
        line-height:18px !important;
        overflow:visible !important;
        box-sizing:border-box !important;
      }

      .gall_list td.gall_writer.${WRITER_ENHANCED_CLASS} .nickname,
      td.gall_writer.ub-writer.${WRITER_ENHANCED_CLASS}[data-loc="list"] .nickname{
        display:inline-block !important;
        max-width:calc(100% - 22px) !important;
        min-width:0 !important;
        overflow:hidden !important;
        text-overflow:ellipsis !important;
        white-space:nowrap !important;
        vertical-align:middle !important;
        line-height:18px !important;
      }

      .gall_list td.gall_writer.${WRITER_ENHANCED_CLASS} .nickname em,
      td.gall_writer.ub-writer.${WRITER_ENHANCED_CLASS}[data-loc="list"] .nickname em{
        display:inline !important;
        white-space:nowrap !important;
        line-height:18px !important;
      }

      .gall_list td.gall_writer.${WRITER_ENHANCED_CLASS} .writer_nikcon,
      td.gall_writer.ub-writer.${WRITER_ENHANCED_CLASS}[data-loc="list"] .writer_nikcon{
        flex:0 0 auto !important;
        display:inline-flex !important;
        align-items:center !important;
        justify-content:center !important;
        width:auto !important;
        min-width:12px !important;
        max-width:22px !important;
        height:18px !important;
        max-height:18px !important;
        overflow:visible !important;
        vertical-align:middle !important;
      }

      .gall_list td.gall_writer.${WRITER_ENHANCED_CLASS} .addbox img,
      td.gall_writer.ub-writer.${WRITER_ENHANCED_CLASS}[data-loc="list"] .addbox img,
      .gall_list td.gall_writer.${WRITER_ENHANCED_CLASS} .writer_nikcon img,
      td.gall_writer.ub-writer.${WRITER_ENHANCED_CLASS}[data-loc="list"] .writer_nikcon img{
        display:inline-block !important;
        vertical-align:middle !important;
        max-width:18px !important;
        max-height:18px !important;
        object-fit:contain !important;
        margin-left:1px !important;
      }

      .gall_list td.gall_writer.${WRITER_ENHANCED_CLASS} > .${WRITER_TOOLS_CLASS},
      td.gall_writer.ub-writer.${WRITER_ENHANCED_CLASS}[data-loc="list"] > .${WRITER_TOOLS_CLASS}{
        display:flex !important;
        align-items:center !important;
        justify-content:center !important;
        gap:2px !important;
        width:100% !important;
        max-width:100% !important;
        min-width:0 !important;
        height:15px !important;
        line-height:15px !important;
        margin:0 !important;
        padding:0 !important;
        overflow:hidden !important;
        white-space:nowrap !important;
        transform:none !important;
        box-sizing:border-box !important;
      }

      .gall_list td.gall_writer.${WRITER_ENHANCED_CLASS} .${BADGE},
      td.gall_writer.ub-writer.${WRITER_ENHANCED_CLASS}[data-loc="list"] .${BADGE}{
        flex:0 1 auto !important;
        max-width:56px !important;
        min-width:0 !important;
        height:14px !important;
        line-height:13px !important;
        padding:0 4px !important;
        font-size:9.5px !important;
        border-radius:8px !important;
        overflow:hidden !important;
        text-overflow:ellipsis !important;
        white-space:nowrap !important;
        box-sizing:border-box !important;
      }

      .${BADGE}.is-list{
        max-width:56px !important;
      }

      @media (max-width:640px){
        .cmt_nickbox .gall_writer.${WRITER_ENHANCED_CLASS},
        .cmt_info .gall_writer.${WRITER_ENHANCED_CLASS},
        .reply_info .gall_writer.${WRITER_ENHANCED_CLASS}{
          row-gap:4px !important;
        }

        .cmt_nickbox .gall_writer.${WRITER_ENHANCED_CLASS} > .${WRITER_TOOLS_CLASS},
        .cmt_info .gall_writer.${WRITER_ENHANCED_CLASS} > .${WRITER_TOOLS_CLASS},
        .reply_info .gall_writer.${WRITER_ENHANCED_CLASS} > .${WRITER_TOOLS_CLASS}{
          margin-left:7px !important;
          transform:translateX(3px) !important;
        }

        .gall_list td.gall_writer.${WRITER_ENHANCED_CLASS} .${BADGE},
        td.gall_writer.ub-writer.${WRITER_ENHANCED_CLASS}[data-loc="list"] .${BADGE}{
          max-width:50px !important;
          font-size:9px !important;
          padding:0 3px !important;
        }
      }
    `;
  }

  function extractUid(writer) {
    let uid = writer.getAttribute("data-uid") || "";
    if (uid && !isIpLike(uid)) return uid;

    const rf =
      writer.querySelector(".refresherUserData") ||
      writer.parentElement?.querySelector(".refresherUserData");

    if (rf) {
      uid = rf.getAttribute("title") || "";
      if (!uid) {
        const m = (rf.textContent || "").match(/\(([A-Za-z0-9._-]+)\)/);
        if (m) uid = m[1];
      }
      if (uid && !isIpLike(uid)) return uid;
    }

    const link =
      writer.querySelector(
        '.writer_nikcon,[onclick*="gallog.dcinside.com"],a[href*="gallog.dcinside.com"]'
      ) ||
      writer.parentElement?.querySelector(
        '.writer_nikcon,[onclick*="gallog.dcinside.com"],a[href*="gallog.dcinside.com"]'
      );

    if (link) {
      const src =
        link.getAttribute("onclick") || link.getAttribute("href") || "";

      let m = src.match(/gallog\.dcinside\.com\/([A-Za-z0-9._-]+)/);
      if (m && m[1] && !isIpLike(m[1])) return m[1];

      m = src.match(/\(([A-Za-z0-9._-]+)\)/);
      if (m && m[1] && !isIpLike(m[1])) return m[1];
    }

    return "";
  }

  function ensureWriterTools(writer) {
    writer.classList.add(WRITER_ENHANCED_CLASS);

    let tools = writer.querySelector(`:scope > .${WRITER_TOOLS_CLASS}`);
    if (!tools) {
      tools = document.createElement("span");
      tools.className = WRITER_TOOLS_CLASS;
    }

    const listMode = isListWriter(writer);
    const addbox = writer.querySelector(":scope > .addbox");
    const nikcon = writer.querySelector(":scope > .writer_nikcon");
    const nick = writer.querySelector(":scope > .nickname");

    if (listMode && addbox) {
      if (addbox.nextSibling !== tools) {
        addbox.insertAdjacentElement("afterend", tools);
      }
      return tools;
    }

    if (nikcon) {
      if (nikcon.nextSibling !== tools) {
        nikcon.insertAdjacentElement("afterend", tools);
      }
    } else if (nick) {
      if (nick.nextSibling !== tools) {
        nick.insertAdjacentElement("afterend", tools);
      }
    } else if (addbox) {
      if (addbox.nextSibling !== tools) {
        addbox.insertAdjacentElement("afterend", tools);
      }
    } else if (tools.parentElement !== writer) {
      writer.appendChild(tools);
    }

    return tools;
  }

  function placeBadge(writer) {
    if (!showEnabled) return;
    if (!(writer instanceof Element)) return;

    const uid = extractUid(writer);
    const badges = Array.from(writer.querySelectorAll(`:scope .${BADGE}`));

    if (!uid) {
      badges.forEach((el) => el.remove());
      cleanupEmptyWriterTools();
      return;
    }

    let span = badges[0] || null;
    badges.slice(1).forEach((el) => el.remove());

    if (!span) {
      span = document.createElement("span");
      span.className = BADGE;
    }

    const listMode = isListWriter(writer);
    const displayUid = listMode ? shortenUidForList(uid) : uid;
    const text = `(${displayUid})`;

    span.dataset.fullUid = uid;
    span.title = uid;
    span.classList.toggle("is-list", listMode);

    if (span.textContent !== text) {
      span.textContent = text;
    }

    const tools = ensureWriterTools(writer);
    const memoBtn = tools.querySelector(`.${MEMO_TRIGGER_CLASS}`);

    if (memoBtn) {
      if (memoBtn.previousSibling !== span) {
        tools.insertBefore(span, memoBtn);
      }
    } else if (span.parentElement !== tools) {
      tools.appendChild(span);
    }
  }

  function scan() {
    if (!showEnabled) {
      restoreOriginalUi();
      return;
    }

    ensureStyle();
    document.querySelectorAll(".gall_writer").forEach(placeBadge);
  }

  try {
    if (chrome && chrome.storage && chrome.storage.sync) {
      chrome.storage.sync.get({ showUidBadge: false }, ({ showUidBadge }) => {
        showEnabled = !!showUidBadge;
        scan();
      });

      chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== "sync" || !changes.showUidBadge) return;
        showEnabled = !!changes.showUidBadge.newValue;
        scan();
      });
    } else {
      scan();
    }
  } catch (e) {
    scan();
  }

  function isUidOwnNode(node) {
    return !!(
      node &&
      node.nodeType === 1 &&
      (
        node.id === STYLE_ID ||
        node.classList?.contains(BADGE) ||
        node.closest?.(`.${BADGE}`)
      )
    );
  }

  function shouldReactToMutations(mutations) {
    for (const m of mutations) {
      if (isUidOwnNode(m.target)) continue;

      for (const n of m.addedNodes) {
        if (isUidOwnNode(n)) continue;
        if (n.nodeType === 1) {
          if (
            n.matches?.(".gall_writer") ||
            n.querySelector?.(".gall_writer") ||
            n.classList?.contains(MEMO_TRIGGER_CLASS) ||
            n.querySelector?.(`.${MEMO_TRIGGER_CLASS}`)
          ) {
            return true;
          }
        }
      }

      for (const n of m.removedNodes) {
        if (isUidOwnNode(n)) continue;
        if (n.nodeType === 1) {
          if (
            n.matches?.(".gall_writer") ||
            n.querySelector?.(".gall_writer") ||
            n.classList?.contains(MEMO_TRIGGER_CLASS) ||
            n.querySelector?.(`.${MEMO_TRIGGER_CLASS}`)
          ) {
            return true;
          }
        }
      }
    }

    return false;
  }

  let scheduled = false;
  const mo = new MutationObserver((mutations) => {
    if (!shouldReactToMutations(mutations)) return;
    if (scheduled) return;

    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      scan();
    });
  });

  if (document.readyState === "loading") {
    document.addEventListener(
      "DOMContentLoaded",
      () => {
        scan();
        if (document.body) {
          mo.observe(document.body, { childList: true, subtree: true });
        }
      },
      { once: true }
    );
  } else {
    scan();
    if (document.body) {
      mo.observe(document.body, { childList: true, subtree: true });
    }
  }
})();

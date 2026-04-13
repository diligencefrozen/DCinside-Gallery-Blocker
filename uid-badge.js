// uid-badge.js
(() => {
  const BADGE = "dcb-uid-badge";
  const STYLE_ID = "dcb-uid-style";
  let showEnabled = true;

  function removeAllBadges() {
    document.querySelectorAll("." + BADGE).forEach((el) => el.remove());
  }

  function removeInjectedStyle() {
    const st = document.getElementById(STYLE_ID);
    if (st) st.remove();

    // 혹시 예전 버전에서 BADGE id로 style을 넣었을 경우까지 정리
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
    .${BADGE}{
      display:inline-flex;
      align-items:center;
      margin-left:4px;
      font-size:11px;
      color:#98a2b3;
      background:rgba(152,162,179,.15);
      padding:1px 6px;
      border-radius:10px;
      line-height:1.2;
      white-space:nowrap;
      vertical-align:middle;
    }

    .gall_writer .${BADGE}{
      position:static !important;
      z-index:auto !important;
    }

    .cmt_nickbox .gall_writer .nickname,
    .cmt_nickbox .gall_writer .writer_nikcon,
    .cmt_nickbox .gall_writer .${BADGE}{
      vertical-align:middle;
    }

    .cmt_nickbox .gall_writer .writer_nikcon img.gallercon{
      display:inline-block;
      vertical-align:middle;
    }
  `;
}

  const isIpLike = (s) =>
    /^\d{1,3}(?:\.\d{1,3}){1,3}$/.test(String(s || "").trim());

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

  function placeBadge(writer) {
    if (!showEnabled) return;
    if (!(writer instanceof Element)) return;

    writer.querySelectorAll(`.${BADGE}`).forEach((el) => el.remove());

    const uid = extractUid(writer);
    if (!uid) return;

    const span = document.createElement("span");
    span.className = BADGE;
    span.textContent = `(${uid})`;

    const nikcon = writer.querySelector(':scope > .writer_nikcon');
    const nick = writer.querySelector(':scope > .nickname');

    if (nikcon) {
      nikcon.insertAdjacentElement("beforebegin", span);
    } else if (nick) {
      nick.insertAdjacentElement("afterend", span);
    } else {
      writer.appendChild(span);
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
      // chrome.storage.sync.get({ showUidBadge: true }, ({ showUidBadge }) => {
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

  let scheduled = false;
  const mo = new MutationObserver(() => {
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
        mo.observe(document.body, { childList: true, subtree: true });
      },
      { once: true }
    );
  } else {
    scan();
    mo.observe(document.body, { childList: true, subtree: true });
  }
})();

// uid-badge.js
(() => {
  const BADGE = "dcb-uid-badge";

  // --- state & helpers for ON/OFF ---
  let showEnabled = true;

  function removeAllBadges() {
    document.querySelectorAll("." + BADGE).forEach((el) => el.remove());
  }

  // 간단한 스타일
  function ensureStyle() {
    if (document.getElementById(BADGE)) return;
    const st = document.createElement("style");
    st.id = BADGE;
    st.textContent = `
      .${BADGE}{
        margin-left:6px; font-size:12px; color:#98a2b3;
        background:rgba(152,162,179,.15); padding:2px 6px; border-radius:10px;
        vertical-align:middle;
      }
    `;
    (document.head || document.documentElement).appendChild(st);
  }

  const isIpLike = (s) =>
    /^\d{1,3}(?:\.\d{1,3}){1,3}$/.test(String(s || "").trim());

  // writer 블록에서 회원 UID 추출
  function extractUid(writer) {
    // 1) data-uid
    let uid = writer.getAttribute("data-uid") || "";
    if (uid && !isIpLike(uid)) return uid;

    // 2) 새로고침 데이터 블록(title/text에 (uid))
    let rf =
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

    // 3) 갤로그 링크에서 추출(onclick/href)
    const link =
      writer.parentElement?.querySelector(
        '.writer_nikcon,[onclick*="gallog.dcinside.com"],a[href*="gallog.dcinside.com"]'
      ) || writer.querySelector('a[href*="gallog.dcinside.com"]');

    if (link) {
      const src =
        link.getAttribute("onclick") || link.getAttribute("href") || "";
      // 예: https://gallog.dcinside.com/SomeUID
      let m = src.match(/gallog\.dcinside\.com\/([A-Za-z0-9._-]+)/);
      if (m && m[1] && !isIpLike(m[1])) return m[1];
      // 혹시 다른 형태가 있으면 괄호 안 UID 시도
      m = src.match(/\(([A-Za-z0-9._-]+)\)/);
      if (m && m[1] && !isIpLike(m[1])) return m[1];
    }

    return "";
  }

  function placeBadge(writer) {
    if (!showEnabled) return; // OFF면 표시 안 함

    const nick = writer.querySelector(".nickname");
    if (!nick) return;

    // 이미 있으면 중복 생성 방지
    if (writer.querySelector(`.${BADGE}`)) return;

    const uid = extractUid(writer);
    if (!uid) return; // 비회원/미검출 → 표시 안 함

    const span = document.createElement("span");
    span.className = BADGE;
    span.textContent = `(${uid})`;
    nick.insertAdjacentElement("afterend", span);
  }

  function scan() {
    if (!showEnabled) {
      removeAllBadges();
      return;
    }
    ensureStyle();
    // 모든 작성자 블록
    document.querySelectorAll(".gall_writer").forEach(placeBadge);
  }

  // --- storage: 초기 로드 & 변경 반영 ---
  try {
    if (chrome && chrome.storage && chrome.storage.sync) {
      chrome.storage.sync.get(
        { showUidBadge: true },
        ({ showUidBadge }) => {
          showEnabled = !!showUidBadge;
          if (!showEnabled) removeAllBadges();
          else scan();
        }
      );

      chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== "sync" || !changes.showUidBadge) return;
        showEnabled = !!changes.showUidBadge.newValue;
        if (!showEnabled) removeAllBadges();
        else scan();
      });
    }
  } catch (e) {
    // storage가 없으면 기본값(true)로 동작
  }

  // 초기 + 동적 로딩 대응(리스트 리프레셔/댓글 새로고침 등)
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

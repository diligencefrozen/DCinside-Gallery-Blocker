// uid-badge.js 
(() => {
  const BADGE = "dcb-uid-badge";

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

  const isIpLike = s => /^\d{1,3}(?:\.\d{1,3}){1,3}$/.test(String(s||"").trim());

  // writer 블록에서 ID 추출 (회원만)
  function extractUid(writer){
    // 1) data-uid
    let uid = writer.getAttribute("data-uid") || "";
    if (uid && !isIpLike(uid)) return uid;

    // 2) (eccehomos) 같은 텍스트 or title
    let rf = writer.querySelector(".refresherUserData") ||
             writer.parentElement?.querySelector(".refresherUserData");
    if (rf){
      uid = rf.getAttribute("title") || "";
      if (!uid) {
        const m = (rf.textContent||"").match(/\(([A-Za-z0-9._-]+)\)/);
        if (m) uid = m[1];
      }
      if (uid && !isIpLike(uid)) return uid;
    }

    // 3) 갤로그 링크 onclick / href 에서 추출
    const link = writer.parentElement?.querySelector('.writer_nikcon,[onclick*="gallog.dcinside.com"]');
    if (link){
      const src = (link.getAttribute("onclick") || link.getAttribute("href") || "");
      const m = src.match(/gallog\.dcinside\.com\/([A-Za-z0-9._-]+)/);
      if (m && !isIpLike(m[1])) return m[1];
    }

    return ""; // 회원 아님(혹은 못 찾음)
  }

  function placeBadge(writer){
    const nick = writer.querySelector(".nickname");
    if (!nick) return;
    if (writer.querySelector(`.${BADGE}`)) return; // 이미 있음

    const uid = extractUid(writer);
    if (!uid) return; // 비회원/미검출 → 표시 안 함

    const span = document.createElement("span");
    span.className = BADGE;
    span.textContent = `(${uid})`;
    nick.insertAdjacentElement("afterend", span);
  }

  function scan(){
    ensureStyle();
    // 모든 작성자 블록
    document.querySelectorAll(".gall_writer").forEach(placeBadge);
  }

  // 초기 + 동적 로딩 대응(리스트 리프레셔/댓글 새로고침 등)
  let scheduled = false;
  const mo = new MutationObserver(() => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => { scheduled = false; scan(); });
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => { scan(); mo.observe(document.body, {childList:true, subtree:true}); }, {once:true});
  } else {
    scan();
    mo.observe(document.body, {childList:true, subtree:true});
  }
})();

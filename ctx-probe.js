/*****************************************************************
 * ctx-probe.js  
 *****************************************************************/
(function () {
  // 안전한 closest
  const closest = (el, sel) => (el && el.closest ? el.closest(sel) : null);

  // 같은 행/블록 안에서 작성자 요소 우선 탐색
  function findAuthorEl(start) {
    // 1) 우선, 가까운 "행" 컨테이너를 잡는다 (목록 tr, 댓글 li/행)
    const row =
      closest(start, "tr.ub-content, li.ub-content, .cmt_info") ||
      closest(start, ".comment_box") ||
      closest(start, ".view_content_wrap") ||
      start;

    // 2) 그 안에서 대표 작성자 DOM을 찾는다
    const cand =
      row.querySelector(".gall_writer[data-uid]") ||
      row.querySelector(".ub-writer[data-uid]") ||
      row.querySelector(".gall_writer, .ub-writer, .cmt_info");

    // 3) 없으면 위로 조금 타고 올라가며 백업 탐색
    if (cand) return cand;
    let el = start;
    for (let i = 0; i < 8 && el; i++, el = el.parentElement) {
      if (el.matches?.(".gall_writer, .ub-writer, .cmt_info")) return el;
      const gw = el.querySelector?.(".gall_writer, .ub-writer, .cmt_info");
      if (gw) return gw;
    }
    return null;
  }

  // gallog 링크에서 UID 파싱 (onclick/href 모두)
  function uidFromGallogLink(scope) {
    const a =
      scope.querySelector('a[onclick*="gallog.dcinside.com"]') ||
      scope.querySelector('a[href*="gallog.dcinside.com"]');
    if (!a) return "";
    const s = a.getAttribute("onclick") || a.getAttribute("href") || "";
    const m = s.match(/gallog\.dcinside\.com\/([A-Za-z0-9_\-]+)/i);
    return m ? m[1] : "";
  }

  // 비회원 IP 앞두옥텟 파싱: (119.202) 스타일, 텍스트 전역 검사
  function ipPrefixFromText(scope) {
    // 1) 전용 span.ip에서 먼저
    const ipEl = scope.querySelector(".ip") || scope.querySelector(".refresherUserData.ip");
    const text = (ipEl?.textContent || scope.textContent || "").trim();
    // (119.202) 또는 119.202 형태
    const m = text.match(/\(?\b(\d{1,3}\.\d{1,3})\b\)?/);
    return m ? m[1] : "";
  }

  function pickUidIp(target) {
    const auth = findAuthorEl(target);
    let uid = "", ip = "";

    if (auth) {
      // 1) data-* 우선
      uid = auth.getAttribute?.("data-uid") || "";
      ip  = auth.getAttribute?.("data-ip")  || "";

      // 2) 없으면 하위에서 보조 추출
      if (!uid) uid = auth.querySelector?.("[data-uid]")?.getAttribute("data-uid") || "";
      if (!ip)  ip  = auth.querySelector?.("[data-ip]") ?.getAttribute("data-ip")  || "";

      // 3) 그래도 없으면 gallog 링크 / 텍스트에서 추출
      if (!uid) uid = uidFromGallogLink(auth);
      if (!ip)  ip  = ipPrefixFromText(auth);
    }

    // 최후의 보루: 선택 텍스트에서
    if (!uid || !ip) {
      const sel = window.getSelection()?.toString() || "";
      if (!uid) {
        const mUid = sel.match(/[A-Za-z0-9_\-]{3,}/);
        if (mUid) uid = mUid[0];
      }
      if (!ip) {
        const mIp = sel.match(/(\d{1,3}\.\d{1,3})/);
        if (mIp) ip = mIp[1];
      }
    }

    return { uid: (uid || "").trim(), ip: (ip || "").trim() };
  }

  // 마지막 우클릭 지점의 후보를 백그라운드에 전달
  document.addEventListener(
    "contextmenu",
    (e) => {
      try {
        const { uid, ip } = pickUidIp(e.target);
        chrome.runtime.sendMessage({ type: "dcb.ctxCandidate", uid, ip });
      } catch (_) {
        // 무시 (권한/샌드박스 이슈 등)
      }
    },
    { capture: true }
  );
})();

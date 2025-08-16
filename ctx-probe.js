/*****************************************************************
 * ctx-probe.js  
 *****************************************************************/
(function () {
  // 작성자 블록을 위로 타고 올라가며 찾아보기
  function findAuthorEl(start) {
    let el = start;
    for (let i = 0; i < 6 && el; i++, el = el.parentElement) {
      if (el.matches?.(".gall_writer, .ub-writer, .cmt_info, .gall_writer.ub-writer")) return el;
      const gw = el.querySelector?.(".gall_writer, .ub-writer");
      if (gw) return gw;
    }
    return null;
  }

  function pickUidIp(target) {
    const auth = findAuthorEl(target);
    let uid = "", ip = "";

    if (auth) {
      // data-uid / data-ip 속성 우선
      uid = auth.getAttribute?.("data-uid") || "";
      ip  = auth.getAttribute?.("data-ip")  || "";

      // 텍스트에서 (123.45) 같은 IP 앞부분 보조 추출
      if (!ip) {
        const txt = auth.textContent || "";
        const m = txt.match(/\((\d{1,3}\.\d{1,3})/); // 예: (119.202
        if (m) ip = m[1];
      }
    } else {
      // 작성자 블록을 못 찾았으면 선택 텍스트에서 시도
      const sel = window.getSelection()?.toString() || "";
      const mIp  = sel.match(/(\d{1,3}\.\d{1,3})/);
      const mUid = sel.match(/[A-Za-z0-9_\-]{3,}/);
      if (mIp)  ip  = mIp[1];
      if (mUid) uid = mUid[0];
    }

    return { uid: (uid || "").trim(), ip: (ip || "").trim() };
  }

  // 마지막 우클릭 정보 → 백그라운드에 전달
  document.addEventListener("contextmenu", (e) => {
    const { uid, ip } = pickUidIp(e.target);
    chrome.runtime.sendMessage({ type: "dcb.ctxCandidate", uid, ip });
  }, { capture: true });
})();

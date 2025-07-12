(async () => {
  /* ===== 유틸 ===== */
  /** URLSearchParams에서 id 값 반환 (없으면 null) */
  function getGalleryId() {
    try {
      const url = new URL(location.href);
      return url.searchParams.get("id"); // 문자열 또는 null
    } catch {
      return null;
    }
  }

  /* ===== 차단 검사 ===== */
  const { blockedIds = [] } = await chrome.storage.sync.get("blockedIds");
  const gid = getGalleryId();

  if (!gid || !blockedIds.includes(gid)) return; // 차단 대상 아님 → 즉시 종료

  /* ===== 화면 가리기 ===== */
  document.documentElement.innerHTML = ""; // 깜빡임 최소화를 위해 document_start에서 실행
  const style = document.createElement("style");
  style.textContent = `
    html,body{height:100%;margin:0;padding:0;background:#111;color:#f1f1f1;
      display:flex;align-items:center;justify-content:center;font-family:Inter, sans-serif}
    #dgb-message{max-width:460px;text-align:center;line-height:1.5}
    #dgb-message h1{font-size:1.6rem;margin:0 0 .6rem;font-weight:600;color:#4f7cff}
    #dgb-message p{margin:0 0 1.2rem;font-size:0.95rem;color:#c9c9c9}
    #dgb-message button{padding:.6rem 1.2rem;border:0;border-radius:6px;font-size:.9rem;
      cursor:pointer;background:#4f7cff;color:#fff}
    #dgb-message button:hover{filter:brightness(1.1)}
  `;
  const wrap = document.createElement("div");
  wrap.id = "dgb-message";
  wrap.innerHTML = `
    <h1>차단된 갤러리입니다</h1>
    <p>이 갤러리(<code>${gid}</code>)는 설정한 목록에 의해 숨겨졌습니다.</p>
    <button id="dgb-close">닫기</button>
  `;

  document.head.appendChild(style);
  document.body.appendChild(wrap);

  // “닫기” 누르면 뒤로 가기 또는 about:blank
  document.getElementById("dgb-close")?.addEventListener("click", () => {
    history.length > 1 ? history.back() : (location.href = "about:blank");
  });
})();

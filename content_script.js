(async () => {
  /* ============ 1. storage 로드 ============ */
  const { blockedIds = [] } = await chrome.storage.sync.get("blockedIds");

  /* ============ 2. 현재 갤러리 id 파싱 ============ */
  function getGalleryId() {
    try {
      const u = new URL(location.href);
      return u.searchParams.get("id"); // string | null
    } catch {
      return null;
    }
  }
  const gid = getGalleryId();

  /* =============================================================
   * 3. dcbest 갤러리 차단 로직
   * ============================================================= */
  if (gid === "dcbest") {
    const PRE_DELAY_MS = 500;   // 페이지가 잠깐 보이도록 0.5초 지연
    const BLOCK_DELAY  = 3;     // 오버레이 카운트다운(초)
    const TARGET_URL   = "https://www.dcinside.com/";

    /* 3-A. PRE_DELAY 후 오버레이 삽입 */
    setTimeout(() => {
      const overlay = document.createElement("div");
      overlay.id = "dgb-block";
      overlay.innerHTML = `
        <style>
          @import url("https://fonts.googleapis.com/css2?family=Inter:wght@400;600&display=swap");
          :root{
            --accent:#0dd7ff;
            --bg:#05060d;
            --fg:#e8eaf6;
          }
          #dgb-block{
            position:fixed; inset:0; z-index:2147483647;
            display:flex; align-items:center; justify-content:center;
            background:rgba(0,0,0,.85);
            font-family:'Inter',sans-serif;
          }
          #dgb-card{
            width:90%; max-width:480px;
            padding:2.2rem 2rem 2.6rem;
            text-align:center;
            background:linear-gradient(135deg,#08101e 0%,#0c1426 100%);
            border:1px solid rgba(13,215,255,.25);
            border-radius:22px;
            box-shadow:0 18px 46px rgba(0,0,0,.65);
          }
          #dgb-card h1{
            margin:0 0 .9rem;
            font-size:1.6rem;
            font-weight:700;
            color:var(--accent);
          }
          #dgb-card p{
            margin:0 0 1.6rem;
            font-size:1rem;
            line-height:1.5;
            color:var(--fg);
          }
          #dgb-bar{
            width:100%; height:8px;
            background:#1b1c24;
            border-radius:4px;
            overflow:hidden;
          }
          #dgb-fill{
            width:0; height:100%;
            background:var(--accent);
            animation:dgb-fill ${BLOCK_DELAY}s linear forwards;
          }
          @keyframes dgb-fill{to{width:100%;}}
        </style>

        <div id="dgb-card">
          <h1>이 갤러리는 차단되었습니다.</h1>
          <p><span id="dgb-sec">${BLOCK_DELAY}</span>초 후, 메인 페이지로 이동합니다.</p>
          <div id="dgb-bar"><div id="dgb-fill"></div></div>
        </div>`;
      document.body.appendChild(overlay);

      /* 3-B. 카운트다운 숫자 업데이트 */
      let remain = BLOCK_DELAY;
      const secEl = overlay.querySelector("#dgb-sec");
      const iv = setInterval(() => {
        remain--;
        if (remain <= 0) clearInterval(iv);
        if (secEl) secEl.textContent = String(remain);
      }, 1000);

      /* 3-C. BLOCK_DELAY 후 리다이렉트 */
      setTimeout(() => { location.href = TARGET_URL; }, BLOCK_DELAY * 1000);
    }, PRE_DELAY_MS);

    return; // dcbest 처리 후 아래 로직 실행 중단
  }

  /* =============================================================
   * 4. 기타 blockedIds 목록 갤러리 차단
   * ============================================================= */
  if (!gid || !blockedIds.includes(gid)) return; // 차단 대상 아님 → 종료

  /* 4-A. 간단 차단 메시지 카드 */
  document.documentElement.innerHTML = "";
  const style = document.createElement("style");
  style.textContent = `
    html,body{
      height:100%; margin:0;
      background:#111; color:#f1f1f1;
      display:flex; align-items:center; justify-content:center;
      font-family:'Inter',sans-serif;
    }
    #dgb-message{max-width:460px; text-align:center; line-height:1.5;}
    #dgb-message h1{
      font-size:1.6rem; margin:0 0 .6rem;
      font-weight:600; color:#4f7cff;
    }
    #dgb-message p{
      margin:0 0 1.2rem; font-size:.95rem; color:#c9c9c9;
    }
    #dgb-message button{
      padding:.6rem 1.2rem; border:0; border-radius:6px; font-size:.9rem;
      cursor:pointer; background:#4f7cff; color:#fff;
    }
    #dgb-message button:hover{filter:brightness(1.1);}
  `;
  document.head.appendChild(style);

  const wrap = document.createElement("div");
  wrap.id = "dgb-message";
  wrap.innerHTML = `
    <h1>차단된 갤러리입니다</h1>
    <p>이 갤러리(<code>${gid}</code>)는 설정에 의해 숨겨졌습니다.</p>
    <button id="dgb-close">닫기</button>
  `;
  document.body.appendChild(wrap);

  document.getElementById("dgb-close")?.addEventListener("click", () => {
    history.length > 1 ? history.back() : (location.href = "about:blank");
  });
})();

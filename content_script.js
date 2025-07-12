
(async () => {
  /* ============ 1. 옵션 불러오기 ============ */
  const {
    enabled       = true,                           // 전역 ON/OFF
    blockedLinks  = [],                             // 사용자가 추가한 차단 목록
    redirectTarget = "https://www.dcinside.com/",   // 리다이렉트 목적지
    delaySeconds   = 3                              // 카운트다운 시간
  } = await chrome.storage.sync.get([
    "enabled",
    "blockedLinks",
    "redirectTarget",
    "delaySeconds"
  ]);

  if (!enabled) return;          // 전체 기능 비활성화

  const href      = location.href;
  const { host }  = location;
  const isDcbest  = href.includes("gall.dcinside.com") &&
                    new URL(href).searchParams.get("id") === "dcbest";

  const isUserBlocked = blockedLinks.some((item) => {
    try {
      // 사용자가 전체 URL을 넣을 수도, 호스트만 넣을 수도 있으므로 두 방식 모두 검사
      const sanitized = item.trim().toLowerCase();
      return href.toLowerCase().includes(sanitized) ||
             host.toLowerCase().endsWith(sanitized.replace(/^https?:\/\//, ""));
    } catch {
      return false;
    }
  });

  if (!isDcbest && !isUserBlocked) return;          // 차단 대상 아님

  /* ============ 2. 경고 오버레이 출력 ============ */
  const overlay = document.createElement("div");
  overlay.id = "dcb-lock";
  overlay.innerHTML = `
    <style>
      @import url("https://fonts.googleapis.com/css2?family=Inter:wght@400;600&display=swap");
      :root{
        --accent:#0dd7ff;
        --fg:#e9ecf5;
      }
      #dcb-lock{
        position:fixed; inset:0; z-index:2147483647;
        display:flex; align-items:center; justify-content:center;
        background:rgba(0,0,0,.82);
        font-family:'Inter',sans-serif;
      }
      #dcb-card{
        max-width:480px; width:90%;
        padding:2rem 1.8rem 2.5rem;
        text-align:center;
        background:#05060d;
        border:1px solid rgba(13,215,255,.25);
        border-radius:22px;
        box-shadow:0 18px 46px rgba(0,0,0,.7);
        color:var(--fg);
      }
      #dcb-card h1{
        margin:0 0 .85rem;
        font-size:1.6rem;
        font-weight:700;
        color:var(--accent);
      }
      #dcb-card p{
        margin:0 0 1.5rem;
        font-size:1rem;
        line-height:1.5;
      }
      #dcb-bar{
        width:100%; height:8px;
        background:#1b1c24;
        border-radius:4px;
        overflow:hidden;
      }
      #dcb-fill{
        width:0; height:100%;
        background:var(--accent);
        animation:dcb-fill ${delaySeconds}s linear forwards;
      }
      @keyframes dcb-fill{to{width:100%;}}
    </style>

    <div id="dcb-card">
      <h1>이 갤러리는 차단되었습니다.</h1>
      <p><span id="dcb-sec">${delaySeconds}</span>초 후, 메인 페이지로 이동합니다.</p>
      <div id="dcb-bar"><div id="dcb-fill"></div></div>
    </div>`;
  document.body.appendChild(overlay);

  /* ============ 3. 카운트다운 & 리다이렉트 ============ */
  let remain = delaySeconds;
  const secEl = overlay.querySelector("#dcb-sec");
  const iv    = setInterval(() => {
    remain--;
    if (remain <= 0) clearInterval(iv);
    if (secEl) secEl.textContent = String(remain);
  }, 1000);

  setTimeout(() => { location.href = redirectTarget; }, delaySeconds * 1000);
})();

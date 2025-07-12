(async () => {
  /* ============ 1. 확장 설정 로드 ============ */
  const {
    enabled           = true,   // 확장 전역 ON/OFF
    delay             = 3,      // 기본 카운트다운(초) – 뉴스 도메인용
    domains           = [],     // 차단할 뉴스 도메인 배열
    redirectUrl       = "https://news.google.com", // 뉴스 리다이렉트 목적지
  } = await chrome.storage.sync.get([
    "enabled",
    "delay",
    "domains",
    "redirectUrl"
  ]);

  if (!enabled) return;   // 전체 기능 비활성화

  /* ===============================================================
   * 2. DCInside dcbest 갤러리 전용 차단 로직
   *    - URL: https://gall.dcinside.com/board/lists/?id=dcbest
   *    - 5초 카운트다운 + 오버레이 → https://www.dcinside.com/ 로 이동
   * =============================================================== */
  (function handleDcbest() {
    try {
      const url = new URL(location.href);

      // 대상 조건 검사
      const isGalleryList =
        url.hostname === "gall.dcinside.com" &&
        url.pathname.startsWith("/board/lists/");
      const isBestGallery = url.searchParams.get("id") === "dcbest";

      if (!isGalleryList || !isBestGallery) return;   // 조건 불일치 – 통과

      const BLOCK_DELAY = 5;                // dcbest 고정 지연시간(초)
      const TARGET_URL  = "https://www.dcinside.com/"; // 이동 목적지

      /* ---------- 2-A. 오버레이 DOM 삽입 ---------- */
      const overlay = document.createElement("div");
      overlay.id = "knl-dcbest-block";
      overlay.innerHTML = `
        <style>
          @import url("https://fonts.googleapis.com/css2?family=Inter:wght@400;600&display=swap");

          :root{
            --accent:#0dd7ff;
            --bg:#05060d;
            --fg:#e8eaf6;
            --radius:22px;
          }
          /* 오버레이 전체 영역 */
          #knl-dcbest-block{
            position:fixed;
            inset:0;
            z-index:2147483647;
            display:flex;
            align-items:center;
            justify-content:center;
            background:rgba(0,0,0,.88);
            font-family:'Inter',sans-serif;
          }
          /* 카드 */
          #knl-dcbest-card{
            width:90%;
            max-width:480px;
            padding:2.4rem 2rem 2.8rem;
            text-align:center;
            background:linear-gradient(135deg,#08101e 0%,#0c1426 100%);
            border:1px solid rgba(13,215,255,.25);
            border-radius:var(--radius);
            box-shadow:0 18px 46px rgba(0,0,0,.65);
          }
          #knl-dcbest-card h1{
            margin:0 0 .9rem;
            font-size:1.65rem;
            font-weight:700;
            color:var(--accent);
            letter-spacing:-.015em;
          }
          #knl-dcbest-card p{
            margin:0 0 1.8rem;
            font-size:1rem;
            line-height:1.5;
            color:var(--fg);
          }
          /* 프로그레스 바 */
          #knl-dcbest-bar{
            width:100%;
            height:8px;
            background:#1b1c24;
            border-radius:4px;
            overflow:hidden;
          }
          #knl-dcbest-fill{
            width:0; height:100%;
            background:var(--accent);
            animation:knl-dcb-fill ${BLOCK_DELAY}s linear forwards;
          }
          @keyframes knl-dcb-fill{to{width:100%;}}
        </style>

        <div id="knl-dcbest-card">
          <h1>이 갤러리는 차단되었습니다.</h1>
          <p><span id="knl-dcb-sec">${BLOCK_DELAY}</span>초 후, 메인 페이지로 이동합니다.</p>
          <div id="knl-dcbest-bar"><div id="knl-dcbest-fill"></div></div>
        </div>
      `;
      document.body.appendChild(overlay);

      /* ---------- 2-B. 카운트다운 표시 ---------- */
      let remain = BLOCK_DELAY;
      const secText = overlay.querySelector("#knl-dcb-sec");
      const iv = setInterval(() => {
        remain--;
        if (remain <= 0) clearInterval(iv);
        if (secText) secText.textContent = String(remain);
      }, 1000);

      /* ---------- 2-C. 지정 시간 후 리다이렉트 ---------- */
      setTimeout(() => { location.href = TARGET_URL; }, BLOCK_DELAY * 1000);

      /* dcbest 처리 후, 이후 로직 실행 중단 */
      return true;    // 함수가 true 리턴 시 아래 뉴스 로직 스킵
    } catch (err) {
      console.error("[K-News-Liberator] dcbest block error:", err);
    }
    return false;     // 예외‧불일치 시 뉴스 로직 계속
  })();   // 즉시 실행

  /* ===============================================================
   * 3. 뉴스 도메인 차단/리다이렉트
   *    - domains 배열에 포함된 도메인만 대상
   *    - delay(기본 3초) 카운트다운 후 redirectUrl 로 이동
   * =============================================================== */

  /* ---------- 3-A. 호스트 정규화 함수 ---------- */
  const sanitize = (str) =>
    str
      .trim()
      .toLowerCase()
      .replace(/^https?:\/\//, "")  // 프로토콜 제거
      .replace(/^www\./, "")        // www. 제거
      .replace(/[\/?#].*$/, "");    // 경로·쿼리·해시 제거

  /* ---------- 3-B. 현재 페이지 호스트 확인 ---------- */
  const host = sanitize(location.hostname);
  const isBlockedNews = domains
    .map(sanitize)
    .some((d) => host === d || host.endsWith("." + d));

  if (!isBlockedNews) return;   // 뉴스 차단 대상 아님 → 종료

  /* ---------- 3-C. 오버레이 DOM 삽입 ---------- */
  const overlay = document.createElement("div");
  overlay.id = "knl-news-block";
  overlay.innerHTML = `
    <style>
      @import url("https://fonts.googleapis.com/css2?family=Inter:wght@400;600&display=swap");

      :root{
        --accent:#4f7cff;
        --bg:#0a0d17;
        --fg:#e4e6f0;
        --radius:18px;
      }
      /* 오버레이 */
      #knl-news-block{
        position:fixed; inset:0; z-index:2147483646;
        display:flex; align-items:center; justify-content:center;
        background:rgba(0,0,0,.82);
        font-family:'Inter',sans-serif;
      }
      /* 카드 */
      #knl-news-card{
        width:92%; max-width:440px;
        padding:2rem 1.8rem 2.4rem;
        background:var(--bg);
        border-radius:var(--radius);
        box-shadow:0 16px 40px rgba(0,0,0,.6);
        text-align:center;
      }
      #knl-news-card h1{
        margin:0 0 .8rem;
        font-size:1.55rem;
        color:var(--accent);
        font-weight:700;
      }
      #knl-news-card p{
        margin:0 0 1.6rem;
        font-size:1rem;
        color:var(--fg);
        line-height:1.5;
      }
      /* 프로그레스 바 */
      #knl-news-bar{
        width:100%; height:8px;
        background:#202436;
        border-radius:4px;
        overflow:hidden;
      }
      #knl-news-fill{
        width:0; height:100%;
        background:var(--accent);
        animation:knl-news-fill ${delay}s linear forwards;
      }
      @keyframes knl-news-fill{to{width:100%;}}
    </style>

    <div id="knl-news-card">
      <h1>차단된 갤러리입니다</h1>
      <p><span id="knl-news-sec">${delay}</span>초 후, 메인 페이지로 이동합니다.</p>
      <div id="knl-news-bar"><div id="knl-news-fill"></div></div>
    </div>
  `;
  document.body.appendChild(overlay);

  /* ---------- 3-D. 카운트다운 표시 ---------- */
  let remain = Number(delay);
  const secLabel = overlay.querySelector("#knl-news-sec");
  const timer = setInterval(() => {
    remain--;
    if (remain <= 0) clearInterval(timer);
    if (secLabel) secLabel.textContent = String(remain);
  }, 1000);

  /* ---------- 3-E. 리다이렉트 실행 ---------- */
  setTimeout(() => { location.href = redirectUrl; }, delay * 1000);
})();

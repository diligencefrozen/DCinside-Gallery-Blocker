(async () => {
  /* === 설정 불러오기 === */
  const { enabled = true, delay = 5, blocked = [] } =
    await chrome.storage.sync.get(["enabled", "delay", "blocked"]);

  if (!enabled) return;

  /* === 현재 페이지가 차단 대상인지 확인 === */
  const url = new URL(location.href);

  // ① pc,모바일 공통 ― ?id=galleryName 사용
  let gallId = url.searchParams.get("id");

  // ② 혹시 주소에 파라미터가 없으면, /galleryName 패턴 추출 (모바일 글보기 등)
  if (!gallId) {
    const m = url.pathname.match(/\/([^/]+?)(?:\/|$)/);
    gallId = m?.[1] || "";
  }

  if (!blocked.includes(gallId)) return; // 차단 목록 아님 → 종료

  /* === 오버레이 생성 === */
  const overlay = document.createElement("div");
  overlay.id = "dcg-block-overlay";
  overlay.innerHTML = `
    <style>
      #dcg-block-overlay{
        all:unset;
        position:fixed; inset:0;
        background:rgba(0,0,0,.8);
        color:#fff; font-family:Inter, sans-serif;
        display:flex; flex-direction:column;
        justify-content:center; align-items:center;
        z-index:2147483647; /* 최상단 */
        text-align:center;
      }
      #dcg-block-overlay h1{font-size:1.5rem;margin:0 0 .5rem 0;font-weight:600}
      #dcg-block-overlay p{font-size:1rem;margin:0}
    </style>
    <h1>⚠️ 차단된 갤러리입니다</h1>
    <p>5초 후 디시인사이드 메인으로 이동합니다.</p>
  `;
  document.documentElement.appendChild(overlay);

  /* === 5초 후 리다이렉트 === */
  setTimeout(() => {
    location.replace("https://www.dcinside.com/");
  }, delay * 1000);
})();

// ─────────────────────────────────────────────
// 설정
// ─────────────────────────────────────────────
const builtinBlocked = ["dcbest"];        // 항상 차단되는 기본 갤러리
const redirectUrl    = "https://www.dcinside.com";
const delaySeconds   = 5;                 // 카운트다운 시간

// ─────────────────────────────────────────────
// ① 현재 URL에서 갤러리 id 추출 → 차단 여부 검사
// ─────────────────────────────────────────────
function handleUrl() {
  const params = new URLSearchParams(location.search);
  const gid = params.get("id")?.trim().toLowerCase();
  if (!gid) return;

  chrome.storage.sync.get({ blockedIds: [] }, ({ blockedIds }) => {
    const blocked = new Set([
      ...builtinBlocked,
      ...blockedIds.map(x => x.trim().toLowerCase())
    ]);

    if (!blocked.has(gid)) return;   // 차단 대상이 아니면 종료
    if (document.getElementById("dcblock-overlay")) return; // 중복 실행 방지

    showOverlayAndRedirect();
  });
}

// ─────────────────────────────────────────────
// ② 오버레이 띄우고 지연 후 리다이렉트
// ─────────────────────────────────────────────
function showOverlayAndRedirect() {
  const overlay = document.createElement("div");
  overlay.id = "dcblock-overlay";

  Object.assign(overlay.style, {
    position: "fixed",
    inset: 0,
    zIndex: 2147483647,
    background: "rgba(0,0,0,0.9)",
    color: "#fff",
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    alignItems: "center",
    fontFamily: "Inter, sans-serif",
    fontSize: "24px",
    lineHeight: 1.5,
    textAlign: "center"
  });

  let sec = delaySeconds;
  overlay.textContent = `이 갤러리는 차단됨, ${sec}초 후 메인 페이지로 이동합니다`;
  document.documentElement.appendChild(overlay);

  const timer = setInterval(() => {
    sec -= 1;
    if (sec <= 0) {
      clearInterval(timer);
      location.href = redirectUrl;
    } else {
      overlay.textContent = `이 갤러리는 차단됨, ${sec}초 후 메인 페이지로 이동합니다`;
    }
  }, 1000);
}

// ─────────────────────────────────────────────
// ③ SPA(푸시스테이트) 대응 ─ URL 변화를 관찰
// ─────────────────────────────────────────────
function patchHistoryMethod(type) {
  const orig = history[type];
  history[type] = function () {
    const ret = orig.apply(this, arguments);
    handleUrl();
    return ret;
  };
}

["pushState", "replaceState"].forEach(patchHistoryMethod);
addEventListener("popstate", handleUrl); // 뒤로/앞으로

// ─────────────────────────────────────────────
// ④ 첫 로드 시 한 번 실행
// ─────────────────────────────────────────────
handleUrl();

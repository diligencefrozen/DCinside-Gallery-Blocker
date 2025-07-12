// ─────────────────────────────────────────────
// ① 현재 페이지에서 갤러리 id 추출
// ─────────────────────────────────────────────
const params = new URLSearchParams(location.search);
const gid = params.get("id")?.trim().toLowerCase();   // ← 공백 제거 + 소문자화
if (!gid) return;

// ─────────────────────────────────────────────
// ② 항상 차단되는 기본 갤러리 목록
//    (여기서는 dcbest 하나지만, 원하면 더 넣을 수 있음)
// ─────────────────────────────────────────────
const builtinBlocked = ["dcbest"];

// ─────────────────────────────────────────────
// ③ 사용자 정의 목록 + 기본 목록 합쳐서 검사
// ─────────────────────────────────────────────
chrome.storage.sync.get({ blockedIds: [] }, ({ blockedIds }) => {
  // 모두 소문자화해서 Set 으로 합치기
  const blocked = new Set([
    ...builtinBlocked,
    ...blockedIds.map(id => id.trim().toLowerCase())
  ]);

  if (!blocked.has(gid)) return;   // 차단 대상이 아니면 끝

  // ───────────────────────────────────────────
  // ④ 오버레이 + 5초 뒤 리다이렉트
  // ───────────────────────────────────────────
  const overlay = document.createElement("div");
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

  let sec = 5;
  overlay.textContent = `이 갤러리는 차단됨, ${sec}초 후 메인 페이지로 이동합니다`;
  document.documentElement.appendChild(overlay);

  const timer = setInterval(() => {
    sec -= 1;
    if (sec <= 0) {
      clearInterval(timer);
      location.href = "https://www.dcinside.com";
    } else {
      overlay.textContent = `이 갤러리는 차단됨, ${sec}초 후 메인 페이지로 이동합니다`;
    }
  }, 1000);
});

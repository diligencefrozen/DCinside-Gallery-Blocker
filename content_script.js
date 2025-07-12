// 접속한 페이지의 갤러리 id 얻기
const { searchParams } = new URL(location.href);
const gid = searchParams.get("id");
if (!gid) return;

// 저장된 차단 목록 불러오기
chrome.storage.sync.get({ blockedIds: [] }, ({ blockedIds }) => {
  if (!blockedIds.includes(gid)) return;          // 차단 대상이 아니면 끝

  /* === 오버레이 생성 === */
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

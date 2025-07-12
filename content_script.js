(() => {
  // URL 파라미터 검사
  const params = new URLSearchParams(location.search);
  const isDCBest = params.get("id") === "dcbest";
  if (!isDCBest) return;

  /* === 오버레이 생성 === */
  const overlay = document.createElement("div");
  overlay.id = "dcbest-block-overlay";
  Object.assign(overlay.style, {
    position: "fixed",
    inset: "0",
    zIndex: "2147483647",
    background: "rgba(0, 0, 0, 0.9)",
    color: "#fff",
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    alignItems: "center",
    fontFamily: '"Inter", sans-serif',
    fontSize: "24px",
    textAlign: "center",
    lineHeight: "1.5"
  });

  // 카운트다운 텍스트 노드
  const msg = document.createElement("p");
  msg.style.margin = 0;
  const countdown = document.createElement("span");
  let remaining = 5;
  msg.textContent = `이 갤러리는 차단됨, ${remaining}초 후 메인 페이지로 이동합니다`;
  overlay.appendChild(msg);
  msg.appendChild(countdown);

  // DOM 삽입
  document.documentElement.appendChild(overlay);

  /* === 1초마다 갱신 === */
  const timer = setInterval(() => {
    remaining -= 1;
    if (remaining <= 0) {
      clearInterval(timer);
      location.href = "https://www.dcinside.com";
    } else {
      msg.textContent = `이 갤러리는 차단됨, ${remaining}초 후 메인 페이지로 이동합니다`;
    }
  }, 1000);
})();

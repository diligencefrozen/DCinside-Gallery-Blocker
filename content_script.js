/*****************************************************************
 * DCinside Gallery Blocker – Content Script
 * 2025-07-13 rev.
 *****************************************************************/

/* ────────────── 고정 설정 ────────────── */
const builtinBlocked = ["dcbest"];               // 항상 차단되는 기본 갤러리
const redirectUrl    = "https://www.dcinside.com";
const delaySeconds   = 5;                        // 카운트다운 시간

/* ────────────── 동적 설정(토글,사용자 목록) ────────────── */
let enabled      = true;                         // 전역 ON/OFF
let blockedSet   = new Set(builtinBlocked);      // 차단 ID 집합

/* 저장값 → 메모리로 동기화 */
function syncSettings(callback) {
  chrome.storage.sync.get(
    { enabled: true, blockedIds: [] },
    ({ enabled: en, blockedIds }) => {
      enabled = en;
      blockedSet = new Set([
        ...builtinBlocked,
        ...blockedIds.map(id => id.trim().toLowerCase())
      ]);
      if (callback) callback();
    }
  );
}

/* storage 변경 감지 → 실시간 반영 */
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "sync") return;
  if (changes.enabled) enabled = changes.enabled.newValue;
  if (changes.blockedIds) {
    blockedSet = new Set([
      ...builtinBlocked,
      ...changes.blockedIds.newValue.map(id => id.trim().toLowerCase())
    ]);
  }
});

/* ────────────── URL 검사 & 처리 ────────────── */
function handleUrl() {
  if (!enabled) return;                          // 토글 OFF면 무시

  const params = new URLSearchParams(location.search);
  const gid = params.get("id")?.trim().toLowerCase();
  if (!gid || !blockedSet.has(gid)) return;      // 대상 아님 → 종료
  if (document.getElementById("dcblock-overlay")) return; // 이미 실행됨

  showOverlayAndRedirect();
}

/* ────────────── 오버레이 + 카운트다운 ────────────── */
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

/* ────────────── SPA(PushState) 대응 ────────────── */
function patchHistoryMethod(type) {
  const orig = history[type];
  history[type] = function () {
    const ret = orig.apply(this, arguments);
    handleUrl();
    return ret;
  };
}
["pushState", "replaceState"].forEach(patchHistoryMethod);
addEventListener("popstate", handleUrl);         // 뒤로/앞으로 클릭

/* ────────────── 초기화 ────────────── */
syncSettings(() => handleUrl());                 // 설정을 불러온 뒤 첫 검사


/* ────────────── 고정 설정 ────────────── */
const builtinBlocked = ["dcbest"];          // 항상 차단되는 기본 갤러리
const redirectUrl    = "https://www.dcinside.com";

/* ────────────── 동적 설정 ────────────── */
let enabled      = true;                    // ON / OFF
let blockedSet   = new Set(builtinBlocked); // 차단 ID 집합
let delaySeconds = 5;                       // 리다이렉트 지연 (0 ~ 10, 0.5 단위)

/* ────────── 저장값 → 메모리 동기화 ────────── */
function syncSettings(cb) {
  chrome.storage.sync.get(
    { enabled: true, blockedIds: [], delay: 5 },
    ({ enabled: en, blockedIds, delay }) => {
      enabled      = en;
      blockedSet   = new Set([
        ...builtinBlocked,
        ...blockedIds.map(id => id.trim().toLowerCase())
      ]);
      delaySeconds = typeof delay === "number" ? delay : 5;
      cb && cb();
    }
  );
}

/* storage 변경 감지 → 실시간 반영 */
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "sync") return;
  if (changes.enabled)   enabled      = changes.enabled.newValue;
  if (changes.blockedIds) blockedSet  = new Set([
    ...builtinBlocked,
    ...changes.blockedIds.newValue.map(id => id.trim().toLowerCase())
  ]);
  if (changes.delay)     delaySeconds = changes.delay.newValue;
});

/* ────────────── URL 검사 & 처리 ────────────── */
function handleUrl() {
  if (!enabled) return;                        // 기능 OFF

  const gid = new URLSearchParams(location.search)
              .get("id")?.trim().toLowerCase();
  if (!gid || !blockedSet.has(gid)) return;    // 차단 대상 아님
  if (document.getElementById("dcblock-overlay")) return; // 이미 처리됨

  showOverlayAndRedirect();
}

/* ────────────── 오버레이 + 지연 처리 ────────────── */
function showOverlayAndRedirect() {
  /* 0초 설정이면 오버레이 없이 즉시 이동 */
  if (delaySeconds === 0) {
    location.href = redirectUrl;
    return;
  }

  const ov = document.createElement("div");
  ov.id = "dcblock-overlay";
  Object.assign(ov.style, {
    position:"fixed", inset:0, zIndex:2147483647,
    background:"rgba(0,0,0,0.9)", color:"#fff",
    display:"flex", flexDirection:"column",
    justifyContent:"center", alignItems:"center",
    fontFamily:"Inter,sans-serif", fontSize:"24px",
    lineHeight:1.5, textAlign:"center"
  });

  /* 0.5 ~ 0.9초 같은 소수점 지연 */
  if (delaySeconds < 1) {
    ov.textContent = "이 갤러리는 차단됨, 잠시 후 메인 페이지로 이동합니다";
    document.documentElement.appendChild(ov);
    setTimeout(() => location.href = redirectUrl, delaySeconds * 1000);
    return;
  }

  /* 1초 이상 → 카운트다운 */
  let sec = Math.round(delaySeconds);
  ov.textContent = `이 갤러리는 차단됨, ${sec}초 후 메인 페이지로 이동합니다`;
  document.documentElement.appendChild(ov);

  const timer = setInterval(() => {
    sec -= 1;
    if (sec <= 0) {
      clearInterval(timer);
      location.href = redirectUrl;
    } else {
      ov.textContent = `이 갤러리는 차단됨, ${sec}초 후 메인 페이지로 이동합니다`;
    }
  }, 1000);
}

/* ────────────── SPA(pushState) 대응 ────────────── */
["pushState", "replaceState"].forEach(type => {
  const orig = history[type];
  history[type] = function () {
    const ret = orig.apply(this, arguments);
    handleUrl();
    return ret;
  };
});
addEventListener("popstate", handleUrl);       // 뒤로/앞으로 탐색

/* ────────────── 초기화 ────────────── */
syncSettings(handleUrl);

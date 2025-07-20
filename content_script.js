/*****************************************************************
 * content_script.js 
 *****************************************************************/

/* ───────── 상수 ───────── */
const REDIRECT_URL   = "https://www.dcinside.com";
const BUILTIN_BLOCK  = ["dcbest"];               // 항상 차단되는 갤러리 ID
const DELAY_MIN = 0, DELAY_MAX = 10;             // 지연 범위

/* ───────── 동적 상태 ───────── */
let enabled      = true;                         // 전역 ON/OFF
let blockMode    = "redirect";                   // "redirect" | "block"
let blockedSet   = new Set(BUILTIN_BLOCK);       // 차단 ID
let delaySeconds = 5;                            // 0 ~ 10, 0.5 단위

/* ───────── storage → 메모리 ───────── */
function syncSettings(cb){
  chrome.storage.sync.get(
    { enabled:true, blockMode:"redirect", blockedIds:[], delay:5 },
    ({ enabled:en, blockMode:bm, blockedIds, delay })=>{
      enabled   = en;
      blockMode = bm;
      blockedSet = new Set([...BUILTIN_BLOCK, ...blockedIds.map(x=>x.trim().toLowerCase())]);
      delaySeconds = clampDelay(delay);
      cb && cb();
    }
  );
}

/* storage 변경 실시간 반영 */
chrome.storage.onChanged.addListener((chg,area)=>{
  if(area!=="sync") return;
  if(chg.enabled)      enabled   = chg.enabled.newValue;
  if(chg.blockMode)    blockMode = chg.blockMode.newValue;
  if(chg.blockedIds)   blockedSet = new Set([...BUILTIN_BLOCK, ...chg.blockedIds.newValue.map(x=>x.trim().toLowerCase())]);
  if(chg.delay)        delaySeconds = clampDelay(chg.delay.newValue);
});

/* ───────── URL 검사 ───────── */
function handleUrl(){
  /* 하드모드(block)·OFF 일 때는 아무 작업도 하지 않음 */
  if(!enabled || blockMode!=="redirect") return;

  const gid = new URLSearchParams(location.search).get("id")?.trim().toLowerCase();
  if(!gid || !blockedSet.has(gid)) return;
  if(document.getElementById("dcblock-overlay")) return; // 중복 방지

  showOverlayAndRedirect();
}

/* ───────── 오버레이 + 지연 ───────── */
function showOverlayAndRedirect(){
  /* 지연 0 → 즉시 이동 (오버레이 없음) */
  if(delaySeconds===0){ location.href = REDIRECT_URL; return; }

  const ov = document.createElement("div");
  ov.id = "dcblock-overlay";
  Object.assign(ov.style,{
    position:"fixed",inset:0,zIndex:2147483647,
    background:"rgba(0,0,0,0.9)",color:"#fff",
    display:"flex",flexDirection:"column",
    justifyContent:"center",alignItems:"center",
    fontFamily:"Inter,sans-serif",fontSize:"24px",
    lineHeight:1.5,textAlign:"center"
  });

  /* 0 < delay < 1 초 : 고정 문구 후 타임아웃 */
  if(delaySeconds < 1){
    ov.textContent = "이 갤러리는 차단됨, 잠시 후 메인 페이지로 이동합니다";
    document.documentElement.appendChild(ov);
    setTimeout(()=>location.href = REDIRECT_URL, delaySeconds*1000);
    return;
  }

  /* 1 초 이상 : 카운트다운 */
  let sec = Math.round(delaySeconds);
  ov.textContent = `이 갤러리는 차단됨, ${sec}초 후 메인 페이지로 이동합니다`;
  document.documentElement.appendChild(ov);

  const timer = setInterval(()=>{
    sec--;
    if(sec<=0){
      clearInterval(timer);
      location.href = REDIRECT_URL;
    }else{
      ov.textContent = `이 갤러리는 차단됨, ${sec}초 후 메인 페이지로 이동합니다`;
    }
  },1000);
}

/* ───────── SPA(pushState) 대응 ───────── */
["pushState","replaceState"].forEach(fn=>{
  const orig = history[fn];
  history[fn] = function(){
    const res = orig.apply(this,arguments);
    handleUrl();
    return res;
  };
});
addEventListener("popstate", handleUrl);

/* ───────── 헬퍼 ───────── */
function clampDelay(v){
  const n = parseFloat(v);
  if(isNaN(n)) return 5;
  return Math.max(DELAY_MIN, Math.min(DELAY_MAX, Math.round(n*2)/2)); // 0.5 단위
}

/* ───────── 초기 실행 ───────── */
syncSettings(handleUrl);

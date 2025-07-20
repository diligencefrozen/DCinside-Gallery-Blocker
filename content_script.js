/*****************************************************************
 * content_script.js 
 *****************************************************************/

/* ───────── 고정값 ───────── */
const builtinBlocked = ["dcbest"];                  // 항상 차단
const redirectUrl    = "https://www.dcinside.com";

/* ───────── 동적 설정 ───────── */
let enabled      = true;                            // ON / OFF
let blockMode    = "redirect";                      // 초보모드 | block
let blockedSet   = new Set(builtinBlocked);         // 차단 ID
let delaySeconds = 5;                               // 지연 시간

/* ───────── storage → 메모리 ───────── */
function syncSettings(cb){
  chrome.storage.sync.get(
    { enabled:true, blockMode:"redirect", blockedIds:[], delay:5 },
    ({ enabled:en, blockMode:bm, blockedIds, delay })=>{
      enabled   = en;
      blockMode = bm;
      blockedSet = new Set([...builtinBlocked, ...blockedIds.map(x=>x.trim().toLowerCase())]);
      delaySeconds = typeof delay==="number" ? delay : 5;
      cb && cb();
    }
  );
}

/* 실시간 반영 */
chrome.storage.onChanged.addListener((chg,area)=>{
  if(area!=="sync") return;
  if(chg.enabled)      enabled   = chg.enabled.newValue;
  if(chg.blockMode)    blockMode = chg.blockMode.newValue;
  if(chg.blockedIds)   blockedSet = new Set([...builtinBlocked, ...chg.blockedIds.newValue.map(x=>x.trim().toLowerCase())]);
  if(chg.delay)        delaySeconds = chg.delay.newValue;
});

/* ───────── URL 검사 ───────── */
function handleUrl(){
  if(!enabled || blockMode!=="redirect") return;    // 하드모드면 패스

  const gid = new URLSearchParams(location.search).get("id")?.trim().toLowerCase();
  if(!gid || !blockedSet.has(gid)) return;
  if(document.getElementById("dcblock-overlay")) return;

  showOverlayAndRedirect();
}

/* ───────── 오버레이 + 지연 ───────── */
function showOverlayAndRedirect(){
  /* 0 초 지연 → 즉시 이동 */
  if(delaySeconds===0){ location.href = redirectUrl; return; }

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

  /* 0.5 ~ 0.9 초 */
  if(delaySeconds<1){
    ov.textContent = "이 갤러리는 차단됨, 잠시 후 메인 페이지로 이동합니다";
    document.documentElement.appendChild(ov);
    setTimeout(()=>location.href=redirectUrl, delaySeconds*1000);
    return;
  }

  /* 1 초 이상 → 카운트다운 */
  let sec = Math.round(delaySeconds);
  ov.textContent = `이 갤러리는 차단됨, ${sec}초 후 메인 페이지로 이동합니다`;
  document.documentElement.appendChild(ov);

  const timer = setInterval(()=>{
    sec -= 1;
    if(sec<=0){
      clearInterval(timer);
      location.href = redirectUrl;
    }else{
      ov.textContent = `이 갤러리는 차단됨, ${sec}초 후 메인 페이지로 이동합니다`;
    }
  },1000);
}

/* ───────── SPA 대응 ───────── */
["pushState","replaceState"].forEach(t=>{
  const o = history[t];
  history[t] = function(){
    const r = o.apply(this,arguments);
    handleUrl();
    return r;
  };
});
addEventListener("popstate", handleUrl);

/* ───────── 초기 실행 ───────── */
syncSettings(handleUrl);

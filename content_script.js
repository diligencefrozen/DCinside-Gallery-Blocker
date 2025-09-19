/*****************************************************************
 * content_script.js 
 *****************************************************************/

/* ───── 상수 ───── */
const REDIRECT_URL    = "https://www.dcinside.com";
const BUILTIN_BLOCKID = ["dcbest"];              // 항상 차단
const DELAY_MIN = 0, DELAY_MAX = 10;             // 0 ~ 10 s (0.5 step)

/* ───── 동적 상태 ───── */
// 갤러리 차단 전용 마스터 (galleryBlockEnabled 우선, 없으면 enabled 사용)
let gBlockEnabled = true;                        // 갤러리 차단 ON/OFF
let blockMode     = "redirect";                  // "redirect" | "block"
let blockedSet    = new Set(BUILTIN_BLOCKID);
let delaySeconds  = 5;

/* ───── storage → 메모리 ───── */
function syncSettings(cb){
  chrome.storage.sync.get(
    {
      galleryBlockEnabled: undefined,  // 신규 키
      enabled            : true,       // 구버전 호환
      blockMode          : "redirect",
      blockedIds         : [],
      delay              : 5
    },
    ({ galleryBlockEnabled, enabled, blockMode:bm, blockedIds, delay })=>{
      const en = (typeof galleryBlockEnabled === "boolean") ? galleryBlockEnabled : !!enabled;
      gBlockEnabled = en;
      blockMode     = bm;
      blockedSet    = new Set([...BUILTIN_BLOCKID, ...blockedIds.map(x=>String(x).trim().toLowerCase())]);
      delaySeconds  = clamp(delay);
      cb && cb();
    }
  );
}

chrome.storage.onChanged.addListener((chg,a)=>{
  if(a!=="sync") return;
  // 새 키 우선, 없으면 구키(enabled)도 반영
  if(chg.galleryBlockEnabled) gBlockEnabled = !!chg.galleryBlockEnabled.newValue;
  else if(chg.enabled)        gBlockEnabled = !!chg.enabled.newValue;

  if(chg.blockMode)    blockMode   = chg.blockMode.newValue;
  if(chg.blockedIds)   blockedSet  = new Set([...BUILTIN_BLOCKID, ...chg.blockedIds.newValue.map(x=>String(x).trim().toLowerCase())]);
  if(chg.delay)        delaySeconds= clamp(chg.delay.newValue);
});

/* ───── 갤러리 ID 추출 ───── */
function getGalleryId(){
  /* 1) ?id=foo */
  const qsId = new URLSearchParams(location.search).get("id");
  if(qsId) return qsId.trim().toLowerCase();

  /* 2) /mgallery/foo …  /mini/bar … */
  const m = location.pathname.match(/\/(?:mgallery|mini)\/([^\/?#]+)/);
  return m ? m[1].trim().toLowerCase() : null;
}

/* ───── URL 검사 & 처리 ───── */
function handleUrl(){
  if(!gBlockEnabled || blockMode!=="redirect") return; // 차단 OFF · 하드모드에선 패스

  const gid = getGalleryId();
  if(!gid || !blockedSet.has(gid)) return;
  if(document.getElementById("dcblock-overlay")) return;

  showOverlayAndRedirect();
}

/* ───── 오버레이 + 지연 ───── */
function showOverlayAndRedirect(){
  if(delaySeconds===0){ location.href = REDIRECT_URL; return; }

  const ov = document.createElement("div");
  Object.assign(ov.style,{
    position:"fixed",inset:0,zIndex:2147483647,
    background:"rgba(0,0,0,0.9)",color:"#fff",
    display:"flex",flexDirection:"column",
    justifyContent:"center",alignItems:"center",
    fontFamily:"Inter, system-ui, -apple-system, Segoe UI, Roboto, Noto Sans, sans-serif",
    fontSize:"24px",textAlign:"center"
  });
  ov.id="dcblock-overlay";

  if(delaySeconds<1){
    ov.textContent="이 갤러리는 차단됨, 잠시 후 메인 페이지로 이동합니다";
    document.documentElement.appendChild(ov);
    setTimeout(()=>location.href=REDIRECT_URL,delaySeconds*1000);
    return;
  }

  let sec=Math.round(delaySeconds);
  ov.textContent=`이 갤러리는 차단됨, ${sec}초 후 메인 페이지로 이동합니다`;
  document.documentElement.appendChild(ov);

  const t=setInterval(()=>{
    sec--;
    if(sec<=0){clearInterval(t);location.href=REDIRECT_URL;}
    else ov.textContent=`이 갤러리는 차단됨, ${sec}초 후 메인 페이지로 이동합니다`;
  },1000);
}

/* ───── SPA 대응 ───── */
["pushState","replaceState"].forEach(fn=>{
  const orig=history[fn];
  history[fn]=function(){const r=orig.apply(this,arguments);handleUrl();return r;};
});
addEventListener("popstate",handleUrl);

/* ───── 헬퍼 ───── */
function clamp(v){
  const n=parseFloat(v);
  return isNaN(n)?5:Math.max(DELAY_MIN,Math.min(DELAY_MAX,Math.round(n*2)/2));
}

/* ───── 초기 실행 ───── */
syncSettings(handleUrl);

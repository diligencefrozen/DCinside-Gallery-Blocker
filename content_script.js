/*****************************************************************
 * content_script.js 
 *****************************************************************/

/* ───── 상수 ───── */
const REDIRECT_URL    = "https://www.dcinside.com";
const BUILTIN_BLOCKID = ["dcbest"];              // 항상 차단
const DELAY_MIN = 0, DELAY_MAX = 10;             // 0 ~ 10 s (0.5 step)
const TEMP_ALLOW_KEY  = "dcb-temp-allow";        // sessionStorage 키

/* ───── 동적 상태 ───── */
// 갤러리 차단 전용 마스터 (galleryBlockEnabled 우선, 없으면 enabled 사용)
let gBlockEnabled = true;                        // 갤러리 차단 ON/OFF
let blockMode     = "redirect";                  // "redirect" | "block" | "smart"
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

/* ───── 임시 허용 체크 ───── */
function isTempAllowed(gid){
  try {
    const allowed = sessionStorage.getItem(TEMP_ALLOW_KEY);
    return allowed && JSON.parse(allowed).includes(gid);
  } catch { return false; }
}

function addTempAllow(gid){
  try {
    const allowed = sessionStorage.getItem(TEMP_ALLOW_KEY);
    const list = allowed ? JSON.parse(allowed) : [];
    if(!list.includes(gid)) list.push(gid);
    sessionStorage.setItem(TEMP_ALLOW_KEY, JSON.stringify(list));
  } catch {}
}

/* ───── URL 검사 & 처리 ───── */
function handleUrl(){
  if(!gBlockEnabled) return; // 차단 완전 OFF
  if(blockMode==="block") return; // 하드모드는 DNR이 처리

  const gid = getGalleryId();
  if(!gid || !blockedSet.has(gid)) return;
  if(isTempAllowed(gid)) return; // 임시 허용됨
  if(document.getElementById("dcblock-overlay")) return;

  // redirect 또는 smart 모드
  if(blockMode === "smart") showSmartWarning(gid);
  else showOverlayAndRedirect();
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

/* ───── 스마트 경고 화면 (선택지 제공) ───── */
function showSmartWarning(gid){
  const ov = document.createElement("div");
  Object.assign(ov.style, {
    position:"fixed",inset:0,zIndex:2147483647,
    background:"linear-gradient(135deg, rgba(30,30,30,0.97) 0%, rgba(20,20,20,0.97) 100%)",
    backdropFilter:"blur(10px)",
    display:"flex",alignItems:"center",justifyContent:"center",
    fontFamily:"Inter, system-ui, -apple-system, Segoe UI, Roboto, Noto Sans, sans-serif",
    animation:"dcb-fadein 0.3s ease-out"
  });
  ov.id="dcblock-overlay";

  const card = document.createElement("div");
  Object.assign(card.style, {
    background:"#fff",
    borderRadius:"16px",
    padding:"40px 48px",
    maxWidth:"480px",
    textAlign:"center",
    boxShadow:"0 20px 60px rgba(0,0,0,0.3)",
    animation:"dcb-slideup 0.4s ease-out"
  });

  // 아이콘
  const icon = document.createElement("div");
  icon.innerHTML = "⛔";
  Object.assign(icon.style, {
    fontSize:"64px",
    marginBottom:"20px",
    filter:"drop-shadow(0 4px 8px rgba(224,49,49,0.3))"
  });

  // 제목
  const title = document.createElement("h2");
  title.textContent = "차단된 갤러리";
  Object.assign(title.style, {
    margin:"0 0 12px 0",
    fontSize:"28px",
    fontWeight:"700",
    color:"#1a1a1a"
  });

  // 설명
  const desc = document.createElement("p");
  desc.innerHTML = `<strong style="color:#e03131">${gid}</strong> 갤러리는<br>차단 목록에 등록되어 있습니다.`;
  Object.assign(desc.style, {
    margin:"0 0 32px 0",
    fontSize:"16px",
    lineHeight:"1.6",
    color:"#666"
  });

  // 버튼 컨테이너
  const btnWrap = document.createElement("div");
  Object.assign(btnWrap.style, {
    display:"flex",
    gap:"12px",
    justifyContent:"center"
  });

  // "메인으로" 버튼 (기본)
  const btnMain = document.createElement("button");
  btnMain.textContent = "메인으로 돌아가기";
  Object.assign(btnMain.style, {
    padding:"14px 28px",
    fontSize:"15px",
    fontWeight:"600",
    border:"2px solid #e03131",
    borderRadius:"10px",
    background:"#e03131",
    color:"#fff",
    cursor:"pointer",
    transition:"all 0.2s ease",
    outline:"none"
  });
  btnMain.onmouseover = () => btnMain.style.background = "#c92a2a";
  btnMain.onmouseout  = () => btnMain.style.background = "#e03131";
  btnMain.onclick = () => location.href = REDIRECT_URL;

  // "이번만 보기" 버튼
  const btnAllow = document.createElement("button");
  btnAllow.textContent = "이번만 보기";
  Object.assign(btnAllow.style, {
    padding:"14px 28px",
    fontSize:"15px",
    fontWeight:"600",
    border:"2px solid #e0e0e0",
    borderRadius:"10px",
    background:"#fff",
    color:"#666",
    cursor:"pointer",
    transition:"all 0.2s ease",
    outline:"none"
  });
  btnAllow.onmouseover = () => {
    btnAllow.style.borderColor = "#999";
    btnAllow.style.color = "#333";
  };
  btnAllow.onmouseout = () => {
    btnAllow.style.borderColor = "#e0e0e0";
    btnAllow.style.color = "#666";
  };
  btnAllow.onclick = () => {
    addTempAllow(gid);
    ov.remove();
  };

  // 조립
  btnWrap.appendChild(btnMain);
  btnWrap.appendChild(btnAllow);
  card.appendChild(icon);
  card.appendChild(title);
  card.appendChild(desc);
  card.appendChild(btnWrap);
  ov.appendChild(card);

  // 애니메이션 CSS 주입
  if(!document.getElementById("dcb-smart-anim")){
    const style = document.createElement("style");
    style.id = "dcb-smart-anim";
    style.textContent = `
      @keyframes dcb-fadein { from{opacity:0} to{opacity:1} }
      @keyframes dcb-slideup { from{transform:translateY(30px);opacity:0} to{transform:translateY(0);opacity:1} }
    `;
    document.head.appendChild(style);
  }

  document.documentElement.appendChild(ov);
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

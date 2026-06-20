/*****************************************************************
 * content_script.js 
 *****************************************************************/

/* ───── 상수 ───── */
const REDIRECT_URL    = "https://www.dcinside.com";
const BUILTIN_DCBEST_ID = "dcbest";              // 실시간베스트 차단
const DELAY_MIN = 0, DELAY_MAX = 10;             // 0 ~ 10 s (0.5 step)
const TEMP_ALLOW_KEY  = "dcb-temp-allow";        // sessionStorage 키

/* ───── 동적 상태 ───── */
// 갤러리 차단 전용 마스터 (galleryBlockEnabled 우선, 없으면 enabled 사용)
let gBlockEnabled = true;                        // 갤러리 차단 ON/OFF
let blockMode     = "redirect";                  // "redirect" | "block" | "smart"
let builtinDcbestBlockEnabled = true;
let userBlockedIds = [];
let blockedSet    = new Set([BUILTIN_DCBEST_ID]);
let delaySeconds  = 5;

// 미리보기 창 상태 (window 객체에 추가하여 다른 스크립트에서도 접근 가능)
if (!window.isPreviewOpen) {
  window.isPreviewOpen = false;
}

// 미리보기 기능 활성화 상태
let previewEnabled = false;

// 미니/인물 갤러리 댓글 로딩 진단 로그
// - 미니/인물에서만 기본 출력
// - 다른 갤러리도 보고 싶으면 콘솔에서 localStorage.setItem("dcbPreviewCommentDebug", "1")
const PREVIEW_COMMENT_DEBUG = true;

function normalizeUserBlockedIds(blockedIds = []) {
  return Array.isArray(blockedIds)
    ? blockedIds.map(x => String(x).trim().toLowerCase()).filter(Boolean)
    : [];
}

function getBuiltinBlockedIds(enabled = true) {
  return enabled === false ? [] : [BUILTIN_DCBEST_ID];
}

function updateBlockedSet(blockedIds = userBlockedIds, builtinEnabled = builtinDcbestBlockEnabled) {
  userBlockedIds = normalizeUserBlockedIds(blockedIds);
  builtinDcbestBlockEnabled = builtinEnabled !== false;
  blockedSet = new Set([
    ...getBuiltinBlockedIds(builtinDcbestBlockEnabled),
    ...userBlockedIds
  ]);
}

/* ───── storage → 메모리 ───── */
function syncSettings(cb){
  chrome.storage.sync.get(
    {
      galleryBlockEnabled: undefined,  // 신규 키
      enabled            : true,       // 구버전 호환
      blockMode          : "redirect",
      builtinDcbestBlockEnabled: true,
      blockedIds         : [],
      delay              : 5,
      previewEnabled     : false
    },
    ({ galleryBlockEnabled, enabled, blockMode:bm, builtinDcbestBlockEnabled, blockedIds, delay, previewEnabled:pe })=>{
      const en = (typeof galleryBlockEnabled === "boolean") ? galleryBlockEnabled : !!enabled;
      gBlockEnabled = en;
      blockMode     = bm;
      updateBlockedSet(blockedIds, builtinDcbestBlockEnabled);
      delaySeconds  = clamp(delay);
      previewEnabled = !!pe;
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
  if(chg.previewEnabled) previewEnabled = !!chg.previewEnabled.newValue;
  if(chg.blockedIds || chg.builtinDcbestBlockEnabled) {
    updateBlockedSet(
      chg.blockedIds ? chg.blockedIds.newValue : userBlockedIds,
      chg.builtinDcbestBlockEnabled ? chg.builtinDcbestBlockEnabled.newValue : builtinDcbestBlockEnabled
    );
  }
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

  // access-guard.js가 이미 접근 차단 UI를 띄운 경우 중복 오버레이를 만들지 않는다.
  if(document.getElementById("dcb-access-guard-overlay")) return;

  const gid = getGalleryId();
  if(!gid || !blockedSet.has(gid)) return;

  // 스마트 모드에서만 임시 허용을 존중
  if(blockMode === "smart" && isTempAllowed(gid)) return;
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

/* ───── 게시글 미리보기 ───── */
(function dcBlockPostPreview(){
  "use strict";

  const STYLE_ID = "dcb-preview-style";
  const OVERLAY_ID = "dcb-preview-overlay";
  const SHARE_ID = "dcbpv-share-popup";
  const CACHE_TTL = 2 * 60 * 1000;

  const cache = new Map();
  let activeAbort = null;
  let currentPreviewData = null;

  const escapeText = (value) => String(value ?? "").replace(/[&<>'"]/g, (ch) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;"
  }[ch]));

  const asText = (root, selector) => root?.querySelector?.(selector)?.textContent?.trim() || "";

  const makeAbsolute = (value, baseUrl) => {
    try { return new URL(value || "", baseUrl || location.href).href; }
    catch (_) { return value || ""; }
  };

  function emitPreviewState(open){
    window.isPreviewOpen = !!open;
    document.dispatchEvent(new CustomEvent("dcb-preview-state", { detail: { open: !!open } }));
  }

  function articleNumberFrom(url, doc){
    try {
      const no = new URL(url, location.href).searchParams.get("no");
      if (no) return no;
    } catch (_) {}
    return doc?.querySelector?.("#no")?.value || doc?.querySelector?.("input[name='no']")?.value || "";
  }

  function galleryIdFrom(url){
    try { return new URL(url, location.href).searchParams.get("id") || ""; }
    catch (_) { return ""; }
  }

  function previewGalleryTypeFromUrl(url){
    try {
      const path = new URL(url, location.href).pathname || "";
      if (/\/mini\//i.test(path)) return "mini";
      if (/\/person\//i.test(path)) return "person";
      if (/\/mgallery\//i.test(path)) return "minor";
    } catch (_) {}
    return "main";
  }

  function previewCommentDebugEnabled(articleUrl){
    const type = previewGalleryTypeFromUrl(articleUrl);
    if (type === "mini" || type === "person") return true;
    try { return localStorage.getItem("dcbPreviewCommentDebug") === "1"; } catch (_) { return PREVIEW_COMMENT_DEBUG === true; }
  }

  function previewCommentLog(articleUrl, phase, detail){
    if (!previewCommentDebugEnabled(articleUrl)) return;
    try {
      console.info("[DCB Preview Comment]", phase, detail);
      // Edge/Chrome 콘솔에서 객체가 접혀서 body/snippet이 안 보이는 경우를 대비한 문자열 로그
      try { console.info("[DCB Preview Comment JSON]", phase, JSON.stringify(detail)); } catch (_) {}
    } catch (_) {}
  }

  function responseSnippet(text, max = 320){
    return String(text || "")
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, max);
  }

  function safeCommentBodyForLog(body){
    try {
      const params = new URLSearchParams(String(body || ""));
      if (params.has("e_s_n_o")) {
        const token = params.get("e_s_n_o") || "";
        params.set("e_s_n_o", token ? `[masked:${token.length}]` : "");
      }
      return Object.fromEntries(params.entries());
    } catch (_) {
      return {};
    }
  }

  function toMobileUrl(viewUrl){
    try {
      const parsed = new URL(viewUrl, location.href);
      const id = parsed.searchParams.get("id");
      const no = parsed.searchParams.get("no");
      if (!id || !no) return "";
      if (/\/mini\//i.test(parsed.pathname)) {
        return `https://m.dcinside.com/mini/${encodeURIComponent(id)}/${encodeURIComponent(no)}`;
      }
      if (/\/person\//i.test(parsed.pathname)) {
        return `https://m.dcinside.com/person/${encodeURIComponent(id)}/${encodeURIComponent(no)}`;
      }
      return `https://m.dcinside.com/board/${encodeURIComponent(id)}/${encodeURIComponent(no)}`;
    } catch (_) {
      return "";
    }
  }

  function installPreviewCss(){
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      #${OVERLAY_ID}{position:fixed;inset:0;z-index:2147483600;display:flex;align-items:center;justify-content:center;padding:22px;background:rgba(2,6,23,.58);backdrop-filter:blur(9px);font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;animation:dcbpv-fade .16s ease-out}
      #${OVERLAY_ID} *{box-sizing:border-box}
      #${OVERLAY_ID} .dcbpv-panel{width:min(840px,94vw);max-height:min(90vh,860px);display:flex;flex-direction:column;overflow:hidden;border-radius:18px;background:#fff;color:#111827;box-shadow:0 24px 80px rgba(0,0,0,.34),0 0 0 1px rgba(255,255,255,.25);animation:dcbpv-pop .18s ease-out}
      #${OVERLAY_ID} .dcbpv-header{display:flex;gap:14px;align-items:flex-start;justify-content:space-between;padding:17px 20px;border-bottom:1px solid #eef2f7;background:linear-gradient(180deg,#fff,#fbfcff)}
      #${OVERLAY_ID} .dcbpv-title{font-size:18px;font-weight:800;line-height:1.38;color:#0f172a;word-break:break-word}
      #${OVERLAY_ID} .dcbpv-title a{color:inherit;text-decoration:underline;text-underline-offset:3px}
      #${OVERLAY_ID} .dcbpv-writer{margin-top:8px;color:#64748b;font-size:12px;line-height:1.55;word-break:break-word}
      #${OVERLAY_ID} .dcbpv-writer a{color:#2563eb;text-decoration:none}
      #${OVERLAY_ID} .dcbpv-icons{display:flex;gap:6px;flex:0 0 auto}
      #${OVERLAY_ID} .dcbpv-icon{width:34px;height:34px;border:1px solid #e5e7eb;border-radius:10px;background:#fff;color:#64748b;cursor:pointer;font-size:16px;line-height:1;transition:.12s}
      #${OVERLAY_ID} .dcbpv-icon:hover{background:#f8fafc;border-color:#cbd5e1;color:#0f172a;transform:translateY(-1px)}
      #${OVERLAY_ID} .dcbpv-scroll{overflow:auto;padding:18px 20px 20px;background:#fff;overscroll-behavior:contain}
      #${OVERLAY_ID} .dcbpv-scroll::-webkit-scrollbar{width:8px}#${OVERLAY_ID} .dcbpv-scroll::-webkit-scrollbar-thumb{background:#cbd5e1;border-radius:999px}
      #${OVERLAY_ID} .dcbpv-section{margin:0 0 18px}
      #${OVERLAY_ID} .dcbpv-section-title{display:flex;align-items:center;gap:8px;margin:0 0 10px;color:#0f172a;font-size:13px;font-weight:800;letter-spacing:.01em}
      #${OVERLAY_ID} .dcbpv-section-title:before{content:"";width:5px;height:15px;border-radius:999px;background:#2563eb;display:inline-block}
      #${OVERLAY_ID} .dcbpv-html{font-size:14px;line-height:1.72;color:#334155;word-break:break-word;overflow-wrap:anywhere;max-width:100%}
      #${OVERLAY_ID} .dcbpv-html img,#${OVERLAY_ID} .dcbpv-html video,#${OVERLAY_ID} .dcbpv-html iframe{max-width:100%!important;width:auto!important;height:auto!important;border:0;vertical-align:top;object-fit:contain}
      #${OVERLAY_ID} .dcbpv-html img,#${OVERLAY_ID} .dcbpv-html video{display:block;margin:10px auto;border-radius:10px}
      #${OVERLAY_ID} .dcbpv-html img.dcbpv-img-broken{min-height:80px;background:repeating-linear-gradient(45deg,#f8fafc,#f8fafc 8px,#eef2f7 8px,#eef2f7 16px);border:1px dashed #cbd5e1}
      #${OVERLAY_ID} .dcbpv-html iframe{display:block;width:min(100%,640px)!important;min-height:320px;margin:10px auto;border-radius:10px;background:#000}
      #${OVERLAY_ID} .dcbpv-movie-wrap{width:min(100%,560px);margin:10px auto;overflow:hidden;border-radius:10px;background:#000}
      #${OVERLAY_ID} .dcbpv-movie-wrap iframe{width:100%!important;height:700px!important;margin:0;border-radius:0;transform:scale(.875);transform-origin:top left;min-height:0}
      #${OVERLAY_ID} .dcbpv-dccon,#${OVERLAY_ID} img.dcbpv-dccon,#${OVERLAY_ID} video.dcbpv-dccon,#${OVERLAY_ID} img[src*="dccon.php"]{display:inline-block!important;max-width:min(120px,32vw)!important;height:auto!important;margin:4px!important;border-radius:6px;box-shadow:none}
      #${OVERLAY_ID} .dcbpv-comment-scope,#${OVERLAY_ID} .dcbpv-comments{border-top:1px solid #eef2f7;padding-top:16px}
      #${OVERLAY_ID} .dcbpv-comments .dcbpv-html{font-size:13px;line-height:1.62}
      #${OVERLAY_ID} .dcbpv-comment-list{display:flex;flex-direction:column;gap:10px}
      #${OVERLAY_ID} .dcbpv-comment-item{padding:11px 12px;border:1px solid #e5e7eb;border-radius:12px;background:#fff}
      #${OVERLAY_ID} .dcbpv-comment-item.reply{margin-left:22px;background:#fbfdff}
      #${OVERLAY_ID} .dcbpv-comment-item.deleted{color:#94a3b8;background:#f8fafc}
      #${OVERLAY_ID} .dcbpv-comment-meta{display:flex;gap:8px;align-items:center;margin-bottom:5px;font-size:12px;color:#64748b}
      #${OVERLAY_ID} .dcbpv-comment-meta strong{color:#0f172a;font-size:13px}
      #${OVERLAY_ID} .dcbpv-comment-body{font-size:13px;line-height:1.62;color:#334155;word-break:break-word}
      #${OVERLAY_ID} .dcbpv-comment-body p{margin:0}
      #${OVERLAY_ID} .dcbpv-legacy-vote,#${OVERLAY_ID} .dcbpv-vote{margin:14px 0;padding:10px 12px;border:1px solid #e5e7eb;border-radius:12px;background:#f8fafc;color:#334155;font-size:13px;font-weight:700}
      #${OVERLAY_ID} .dcbpv-empty{padding:22px;text-align:center;border:1px dashed #cbd5e1;border-radius:12px;color:#64748b;background:#f8fafc}
      #${OVERLAY_ID} .dcbpv-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:16px;padding-top:16px;border-top:1px solid #eef2f7}
      #${OVERLAY_ID} .dcbpv-btn{flex:1 1 92px;min-width:88px;border:1px solid #e5e7eb;border-radius:11px;background:#fff;color:#334155;padding:9px 10px;cursor:pointer;font-weight:700;font-size:13px;transition:.12s}
      #${OVERLAY_ID} .dcbpv-btn:hover{background:#f8fafc;border-color:#cbd5e1;transform:translateY(-1px)}
      #${OVERLAY_ID} .dcbpv-btn.primary{background:#2563eb;border-color:#2563eb;color:#fff}#${OVERLAY_ID} .dcbpv-btn.primary:hover{background:#1d4ed8}
      #${OVERLAY_ID} .dcbpv-btn.warn{color:#b91c1c;border-color:#fecaca;background:#fff7f7}
      #${OVERLAY_ID} .dcbpv-center{min-height:240px;display:grid;place-items:center;text-align:center;color:#64748b;padding:28px}
      #${OVERLAY_ID} .dcbpv-spinner{width:34px;height:34px;border-radius:50%;border:3px solid #dbeafe;border-top-color:#2563eb;margin:0 auto 14px;animation:dcbpv-spin .8s linear infinite}
      #${OVERLAY_ID} .dcbpv-share-popup{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:min(420px,88vw);padding:20px;border-radius:16px;background:#fff;box-shadow:0 18px 70px rgba(0,0,0,.28);border:1px solid #e5e7eb;z-index:2}
      #${OVERLAY_ID} .dcbpv-share-popup h3{margin:0 0 14px;font-size:17px;color:#0f172a}
      #${OVERLAY_ID} .dcbpv-share-close{position:absolute;right:12px;top:10px;width:30px;height:30px;border:0;border-radius:8px;background:transparent;color:#64748b;font-size:20px;cursor:pointer}
      #${OVERLAY_ID} .dcbpv-share-close:hover{background:#f1f5f9;color:#0f172a}
      #${OVERLAY_ID} .dcbpv-share-row{display:flex;gap:8px;margin:10px 0}.dcbpv-share-row button{flex:1;padding:10px;border:1px solid #e5e7eb;border-radius:10px;background:#f8fafc;cursor:pointer;font-weight:700;color:#334155}
      #${OVERLAY_ID} .dcbpv-copy{display:flex;gap:8px;margin-top:12px}.dcbpv-copy input{min-width:0;flex:1;border:1px solid #e5e7eb;border-radius:10px;padding:10px;background:#f8fafc}.dcbpv-copy button{border:1px solid #2563eb;border-radius:10px;padding:0 14px;background:#2563eb;color:#fff;cursor:pointer;font-weight:800}
      @keyframes dcbpv-fade{from{opacity:0}to{opacity:1}}@keyframes dcbpv-pop{from{transform:translateY(8px) scale(.985);opacity:.6}to{transform:none;opacity:1}}@keyframes dcbpv-spin{to{transform:rotate(360deg)}}
      @media(max-width:540px){#${OVERLAY_ID}{padding:10px}#${OVERLAY_ID} .dcbpv-panel{max-height:92vh;border-radius:14px}#${OVERLAY_ID} .dcbpv-header{padding:15px}#${OVERLAY_ID} .dcbpv-scroll{padding:15px}#${OVERLAY_ID} .dcbpv-movie-wrap iframe{height:620px!important}}
    `;
    document.head.appendChild(style);
  }

  function closePreview(){
    const overlay = document.getElementById(OVERLAY_ID);
    if (overlay) overlay.remove();
    currentPreviewData = null;
    emitPreviewState(false);
  }

  function renderLoading(){
    installPreviewCss();
    closePreview();
    const overlay = document.createElement("div");
    overlay.id = OVERLAY_ID;
    overlay.innerHTML = `
      <section class="dcbpv-panel">
        <div class="dcbpv-center">
          <div>
            <div class="dcbpv-spinner"></div>
            <strong>게시글과 댓글을 불러오는 중...</strong>
            <div style="font-size:12px;margin-top:6px;color:#94a3b8">본문·댓글·이미지를 정리하고 있습니다.</div>
          </div>
        </div>
      </section>`;
    document.documentElement.appendChild(overlay);
    emitPreviewState(true);
  }

  function renderError(message, url){
    installPreviewCss();
    closePreview();
    const overlay = document.createElement("div");
    overlay.id = OVERLAY_ID;
    overlay.innerHTML = `
      <section class="dcbpv-panel">
        <div class="dcbpv-center">
          <div>
            <div style="font-size:34px;margin-bottom:10px">⚠️</div>
            <strong>미리보기를 열 수 없습니다</strong>
            <div style="font-size:12px;margin-top:8px;color:#94a3b8">${escapeText(message)}</div>
            <div style="display:flex;gap:8px;justify-content:center;margin-top:16px">
              <button class="dcbpv-btn primary" data-act="retry">다시 시도</button>
              <button class="dcbpv-btn" data-act="close">닫기</button>
            </div>
          </div>
        </div>
      </section>`;
    overlay.addEventListener("click", (event) => {
      const act = event.target.closest("[data-act]")?.dataset.act;
      if (act === "close") closePreview();
      if (act === "retry") openPreview(url, { force: true });
    });
    document.documentElement.appendChild(overlay);
    emitPreviewState(true);
  }

  function stripUnsafe(container, baseUrl){
    if (!container) return null;
    container.querySelectorAll("script,style,noscript,template").forEach((node) => node.remove());
    container.querySelectorAll("*").forEach((node) => {
      [...node.attributes].forEach((attr) => {
        const name = attr.name.toLowerCase();
        if (name.startsWith("on")) node.removeAttribute(attr.name);
        if (name === "src" || name === "href") node.setAttribute(attr.name, makeAbsolute(attr.value, baseUrl));
        if (name === "srcset" || name === "style" || name === "id") node.removeAttribute(attr.name);
      });
    });
    return container;
  }

  const IMAGE_SOURCE_ATTRS = [
    "data-original", "data-original-url", "data-original-src", "data-src", "data-lazy", "data-lazy-src",
    "data-url", "data-file", "data-file-url", "data-img", "data-image", "data-full", "data-full-src",
    "data-thumb", "data-thumbnail", "data-view-src", "data-viewimage", "data-org", "data-org-src",
    "data-gif", "data-webp", "data-mp4", "srcset", "src"
  ];

  const decodeMediaUrl = (value) => String(value || "")
    .trim()
    .replace(/&amp;/g, "&")
    .replace(/\\\//g, "/")
    .replace(/^['\"]+|['\"]+$/g, "");

  function isPlaceholderImageUrl(value){
    const url = String(value || "").toLowerCase();
    return !url || /(?:dccon_loading|loading|loader|blank|spacer|transparent|noimg|empty|default_img|placeholder)/.test(url);
  }

  function isLikelyMediaUrl(value){
    const url = decodeMediaUrl(value);
    if (!url || /^(?:javascript|data):/i.test(url)) return false;
    return /(?:\.(?:jpe?g|png|gif|webp|bmp|avif)(?:[?#]|$)|\.(?:mp4|webm)(?:[?#]|$)|viewimage\.php|dccon\.php|dcimg|dcinside|image\.dcinside|wstatic|nstatic)/i.test(url);
  }

  function firstUrlFromSrcset(value){
    return String(value || "")
      .split(",")
      .map((chunk) => chunk.trim().split(/\s+/)[0])
      .find(Boolean) || "";
  }

  function mediaUrlsFromText(value){
    const raw = decodeMediaUrl(value);
    if (!raw) return [];

    const srcsetUrl = firstUrlFromSrcset(raw);
    const candidates = [];
    if (srcsetUrl) candidates.push(srcsetUrl);

    const absoluteMatches = raw.match(/(?:https?:)?\/\/[^\s'\"<>),]+/gi) || [];
    candidates.push(...absoluteMatches);

    const relativeMatches = raw.match(/\/(?:viewimage\.php|dccon\.php|dcimg[^\s'\"<>),]*|dcn[^\s'\"<>),]*|images?\/[^\s'\"<>),]+)/gi) || [];
    candidates.push(...relativeMatches);

    if (isLikelyMediaUrl(raw)) candidates.push(raw);
    return candidates.map(decodeMediaUrl).filter(Boolean);
  }

  function collectImageCandidates(img, baseUrl){
    const found = [];
    const push = (value) => {
      mediaUrlsFromText(value).forEach((url) => {
        const absolute = makeAbsolute(url, baseUrl);
        if (isLikelyMediaUrl(absolute) && !found.includes(absolute)) found.push(absolute);
      });
    };

    IMAGE_SOURCE_ATTRS.forEach((name) => push(img.getAttribute(name)));
    Array.from(img.attributes || []).forEach((attr) => {
      const name = attr.name.toLowerCase();
      if (name.startsWith("data-") || name === "src" || name === "srcset") push(attr.value);
    });

    const parentHref = img.closest?.("a[href]")?.getAttribute("href");
    push(parentHref);

    return found.sort((a, b) => {
      const aMp4 = /\.(?:mp4|webm)(?:[?#]|$)/i.test(a) ? 1 : 0;
      const bMp4 = /\.(?:mp4|webm)(?:[?#]|$)/i.test(b) ? 1 : 0;
      const aBad = isPlaceholderImageUrl(a) ? 1 : 0;
      const bBad = isPlaceholderImageUrl(b) ? 1 : 0;
      return aBad - bBad || aMp4 - bMp4;
    });
  }

  function pickImageCandidate(img, baseUrl, options = {}){
    const urls = collectImageCandidates(img, baseUrl);
    const allowVideo = options.allowVideo !== false;
    return urls.find((url) => {
      if (isPlaceholderImageUrl(url)) return false;
      if (!allowVideo && /\.(?:mp4|webm)(?:[?#]|$)/i.test(url)) return false;
      return true;
    }) || "";
  }

  function bindImageFallbacks(img, baseUrl){
    const candidates = collectImageCandidates(img, baseUrl).filter((url) => !isPlaceholderImageUrl(url));
    if (!candidates.length) return;

    img.dataset.dcbpvFallbackQueue = candidates.join("\n");
    if (img.dataset.dcbpvFallbackBound === "true") return;
    img.dataset.dcbpvFallbackBound = "true";
    img.addEventListener("error", () => {
      const current = img.currentSrc || img.src || "";
      const queue = String(img.dataset.dcbpvFallbackQueue || "")
        .split("\n")
        .map((url) => url.trim())
        .filter(Boolean)
        .filter((url) => url !== current);
      const next = queue.shift();
      img.dataset.dcbpvFallbackQueue = queue.join("\n");
      if (next) {
        img.src = next;
      } else {
        img.classList.add("dcbpv-img-broken");
      }
    });
  }

  function normalizeDcMedia(root, baseUrl){
    root.querySelectorAll('iframe[id^="movie_iframe"], iframe[src*="movie_view"]').forEach((iframe) => {
      let movieNo = (iframe.id || "").replace(/^movie_iframe_/, "").trim();
      if (!movieNo) {
        try { movieNo = new URL(iframe.getAttribute("src") || "", baseUrl).searchParams.get("no") || ""; }
        catch (_) {}
      }
      if (!movieNo) return;
      const factory = root.ownerDocument || (root.createElement ? root : document);
      const wrapper = factory.createElement("div");
      const fresh = factory.createElement("iframe");
      wrapper.className = "dcbpv-movie-wrap";
      fresh.src = `https://gall.dcinside.com/board/movie/movie_view?no=${encodeURIComponent(movieNo)}`;
      fresh.frameBorder = "0";
      fresh.scrolling = "no";
      fresh.referrerPolicy = "unsafe-url";
      fresh.loading = "lazy";
      wrapper.appendChild(fresh);
      iframe.replaceWith(wrapper);
    });

    root.querySelectorAll("img").forEach((img) => {
      const currentSrc = img.getAttribute("src") || "";
      const gifUrl = pickImageCandidate(img, baseUrl, { allowVideo: false });
      const mp4Url = collectImageCandidates(img, baseUrl).find((url) => /\.(?:mp4|webm)(?:[?#]|$)/i.test(url)) || "";
      const isLoadingImage = isPlaceholderImageUrl(currentSrc) || img.classList.contains("lazy") || img.classList.contains("img_loading");
      const isInComment = !!img.closest(".all-comment,.dcbpv-comment-scope,.comment_wrap,#comment_wrap,.cmt_list,.reply_box,.comment_dccon");
      const wasDccon = img.classList.contains("written_dccon") || /dccon\.php/i.test(currentSrc) || /dccon\.php/i.test(gifUrl);

      if (mp4Url && isLoadingImage && !gifUrl) {
        const video = (img.ownerDocument || document).createElement("video");
        video.src = makeAbsolute(mp4Url, baseUrl);
        video.autoplay = true;
        video.loop = true;
        video.muted = true;
        video.playsInline = true;
        video.className = img.className;
        if (isInComment || wasDccon) video.classList.add("dcbpv-dccon");
        video.title = img.getAttribute("title") || "";
        video.setAttribute("aria-label", img.getAttribute("alt") || "");
        video.removeAttribute("width");
        video.removeAttribute("height");
        img.replaceWith(video);
        return;
      }

      if (gifUrl && (isLoadingImage || !currentSrc || isPlaceholderImageUrl(currentSrc))) {
        img.src = gifUrl;
      } else if (currentSrc) {
        img.src = makeAbsolute(currentSrc, baseUrl);
      } else if (gifUrl) {
        img.src = gifUrl;
      }

      bindImageFallbacks(img, baseUrl);
      img.classList.remove("lazy", "img_loading", "gif-mp4", "webp-mp4", "written_dccon");
      if (wasDccon || (isInComment && (/dccon\.php/i.test(gifUrl) || mp4Url))) {
        img.classList.add("dcbpv-dccon");
      }
      img.loading = "eager";
      img.decoding = "async";
      img.referrerPolicy = "unsafe-url";
      img.removeAttribute("width");
      img.removeAttribute("height");
      img.removeAttribute("srcset");
      img.removeAttribute("sizes");
    });

    root.querySelectorAll("video").forEach((video) => {
      const src = video.getAttribute("src");
      if (src) video.src = makeAbsolute(src, baseUrl);
      video.autoplay = video.autoplay || true;
      video.loop = video.loop || true;
      video.muted = true;
      video.playsInline = true;
      video.removeAttribute("width");
      video.removeAttribute("height");
    });

    root.querySelectorAll(".written_dccon").forEach((node) => {
      node.classList.remove("written_dccon");
      node.classList.add("dcbpv-dccon");
    });
  }

  function htmlFromElement(source, baseUrl){
    if (!source) return "";
    const clone = source.cloneNode(true);
    stripUnsafe(clone, baseUrl);
    return clone.innerHTML.trim();
  }

  function cleanWriter(writer, baseUrl){
    if (!writer) return "";
    const clone = writer.cloneNode(true);
    clone.querySelectorAll(".btn.btn-line-gray,.rt,button,input,script,style").forEach((node) => node.remove());

    const walker = document.createTreeWalker(clone, NodeFilter.SHOW_TEXT);
    const trash = [];
    while (walker.nextNode()) {
      const raw = walker.currentNode.nodeValue.trim();
      if (raw === "|" || raw === "ㅣ") trash.push(walker.currentNode);
    }
    trash.forEach((node) => node.remove());

    clone.querySelectorAll("li").forEach((li) => {
      const hasVisualChild = li.querySelector("a,img,span,em,i");
      if (!hasVisualChild && li.textContent.trim() === "") li.remove();
    });

    stripUnsafe(clone, baseUrl);
    return clone.innerHTML.trim() || escapeText(clone.textContent.trim());
  }

  function getMetaTitle(doc){
    const fromMeta = doc.querySelector('meta[property="og:title"],meta[name="twitter:title"]')?.content?.trim() || "";
    if (!fromMeta) return "";
    return fromMeta.replace(/\s*-\s*[^-]*갤러리\s*$/, "").trim();
  }

  function isLayerLikeText(value){
    return /^(최근 방문|즐겨찾기|자동 짤방 이미지|자동 짤방 이미지 개선|연관 갤러리|개념글 리스트|차단하기|댓글 영역|하단 갤러리 리스트 영역|왼쪽 컨텐츠 영역|오른쪽 컨텐츠 영역)$/i.test(String(value || "").trim());
  }

  function isUtilityContainer(node){
    if (!node?.closest) return false;
    return Boolean(node.closest([
      ".issuebox", ".right_content", ".left_content .issuebox",
      ".recently", ".visit_history", "#visit_history", "#recently_gallery",
      ".favorite", ".relation", ".related", ".concept_list",
      ".autoimg", ".auto_img", "[id*=auto]", "[class*=auto]",
      ".pop_wrap", ".layer", ".modal", ".ly_wrap", "[id*=layer]",
      "aside", "nav", "header", "footer"
    ].join(",")));
  }

  function htmlToPlain(html){
    const box = document.createElement("div");
    box.innerHTML = String(html || "");
    return box.textContent.replace(/\s+/g, " ").trim();
  }

  function isHashOnlyText(value){
    return /^[a-f0-9]{32,80}$/i.test(String(value || "").replace(/\s+/g, ""));
  }

  function plainBlockToHtml(text){
    const lines = String(text || "")
      .split(/\n+/)
      .map((line) => line.trim())
      .filter(Boolean);
    if (!lines.length) return "";
    return `<div class="dcbpv-text-comments">${lines.map((line) => `<p>${escapeText(line)}</p>`).join("")}</div>`;
  }

  function textBetweenMarkers(doc, startPattern, endPattern){
    const raw = doc.body?.innerText || doc.body?.textContent || "";
    const start = raw.search(startPattern);
    if (start < 0) return "";
    const rest = raw.slice(start);
    const end = rest.search(endPattern);
    return (end > 0 ? rest.slice(0, end) : rest).trim();
  }

  function findBestContent(doc, mode){
    const exactSelectors = mode === "desktop"
      ? ["#write_div", ".write_div", ".writing_view_box .write_div", ".gallview_contents .write_div", ".view_content .write_div", ".thum-txtin", ".view_txt"]
      : [".thum-txtin", ".view_txt", "#write_div", ".write_div", ".writing_view_box .write_div"];
    const broadSelectors = mode === "desktop"
      ? [".writing_view_box", ".gallview_contents", ".view_content", ".view_txt"]
      : [".gallview_contents", ".view_content", ".writing_view_box", "article", "section"];

    const unique = new Set();
    const collect = (selectors) => selectors.flatMap((selector) => Array.from(doc.querySelectorAll(selector)))
      .filter((node) => {
        if (unique.has(node)) return false;
        unique.add(node);
        return true;
      });

    const hasPayload = (node) => {
      const text = node.textContent.replace(/\s+/g, " ").trim();
      return Boolean(text || node.querySelector("img,video,iframe"));
    };

    let candidates = collect(exactSelectors).filter(hasPayload);
    if (!candidates.length) candidates = collect(broadSelectors).filter(hasPayload);

    let best = null;
    let bestScore = -Infinity;

    candidates.forEach((node, index) => {
      const text = node.textContent.replace(/\s+/g, " ").trim();
      let score = 0;
      score += Math.min(text.length, 1400) / 20;
      if (node.matches("#write_div,.write_div,.thum-txtin,.view_txt")) score += 90;
      if (node.matches(".writing_view_box,.gallview_contents")) score += 28;
      if (node.closest(".gallview,.gallview_wrap,.view_wrap,.view_content_wrap,.writing_view_box,article")) score += 24;
      if (node.querySelector("img,video,iframe")) score += 16;
      if (node.querySelector("#comment_wrap,.comment_wrap,.all-comment,.cmt_write_box,textarea,input[name=captcha],#recomm_btn,#nonrecomm_btn,.btn_recommend_box")) score -= 85;
      if (isUtilityContainer(node)) score -= 180;
      if (/자동\s*짤방|최근\s*방문|즐겨찾기|레이어\s*닫기|설정\s*저장|댓글돌이|댓글\s*입력/.test(text)) score -= 140;
      if (isHashOnlyText(text)) score -= 120;
      score -= index * 0.2;
      if (score > bestScore) {
        bestScore = score;
        best = node;
      }
    });

    if (best?.querySelector) {
      const inner = best.querySelector("#write_div,.write_div,.thum-txtin,.view_txt");
      if (inner && hasPayload(inner) && !isUtilityContainer(inner)) return inner;
    }

    return best;
  }

  function findArticleRoot(content, doc){
    return content?.closest?.(".view_content_wrap,.gallview_wrap,.gallview,.view_wrap,.writing_view_box,article,.view_box,.view_area,#container") || doc;
  }

  function pickTitle(doc, root, content){
    const metaTitle = getMetaTitle(doc);
    if (metaTitle && !isLayerLikeText(metaTitle)) return metaTitle;

    const titleSelectors = [
      ".gallview_head .tit", ".gallview_head .title", ".view_head .tit", ".view_head .title_subject",
      ".title_subject", ".tit_subject", "h1", "h2", "h3.tit", ".tit"
    ];

    const pools = [root, doc];
    for (const pool of pools) {
      for (const selector of titleSelectors) {
        const found = Array.from(pool.querySelectorAll?.(selector) || [])
          .map((el) => el.textContent.replace(/\s+/g, " ").trim())
          .find((text) => text && !isLayerLikeText(text));
        if (found) return found;
      }
    }

    if (content) {
      const before = Array.from(doc.querySelectorAll(".tit,.title_subject,h1,h2,h3"))
        .filter((el) => !isLayerLikeText(el.textContent))
        .filter((el) => Boolean(el.compareDocumentPosition(content) & Node.DOCUMENT_POSITION_FOLLOWING))
        .at(-1);
      const text = before?.textContent?.replace(/\s+/g, " ").trim();
      if (text) return text;
    }

    return "제목 없음";
  }

  function isCommentArea(node){
    return Boolean(node?.closest?.("#comment_wrap,.comment_wrap,.all-comment,.cmt_list,.reply_list,[id^='comment_li_'],.cmt_info,.cmt_write_box"));
  }

  function normalizePreviewNick(value){
    return String(value || "").normalize("NFKC").replace(/\s+/g, "").trim();
  }

  function cleanPreviewToken(value){
    return String(value || "")
      .trim()
      .replace(/^uid\s*[:=]\s*/i, "")
      .replace(/^ip\s*[:=]\s*/i, "")
      .replace(/^\(|\)$/g, "")
      .trim();
  }

  function previewIpPrefix(value){
    const found = cleanPreviewToken(value).match(/\b(\d{1,3}\.\d{1,3})(?:\.\d{1,3}){0,2}\b/);
    return found ? found[1] : "";
  }

  function previewUidToken(value){
    const uid = cleanPreviewToken(value).replace(/^@+/, "").replace(/[\s\)\]>'";]+$/g, "");
    if (!uid || /^\d{1,3}(?:\.\d{1,3}){1,3}$/.test(uid)) return "";
    return /^[A-Za-z0-9._-]{2,64}$/.test(uid) ? uid : "";
  }

  function gallogUidFromText(value){
    const text = String(value || "");
    const direct = text.match(/gallog\.dcinside\.com\/?([A-Za-z0-9._-]{2,64})/i);
    if (direct) return previewUidToken(direct[1]);
    const query = text.match(/[?&](?:id|user_id|userid|uid)=([A-Za-z0-9._-]{2,64})/i);
    if (query) return previewUidToken(query[1]);
    const call = text.match(/(?:gallog|go_?gallog|uid|userid|user_id)\s*(?:\(|=|:)\s*['"]?([A-Za-z0-9._-]{2,64})/i);
    return call ? previewUidToken(call[1]) : "";
  }

  function textFromPreviewAttrs(node){
    if (!node) return "";
    return ["data-full-uid", "data-uid", "data-user-id", "data-userid", "data-user_id", "data-memo-uid", "data-ip", "data-memo-ip", "onclick", "href", "title", "alt", "aria-label"]
      .map((name) => node.getAttribute?.(name) || "")
      .filter(Boolean)
      .join(" ");
  }

  function previewWriterMeta(node){
    if (!node) return { nick: "", uid: "", ip: "" };
    const writer = node.matches?.(".gall_writer,.ub-writer,.writer_info,.user_info,.cmt_nickbox") ? node : node.querySelector?.(".gall_writer,.ub-writer,.writer_info,.user_info,.cmt_nickbox");
    const refText = [textFromPreviewAttrs(node), textFromPreviewAttrs(writer), textFromPreviewAttrs(writer?.querySelector?.('.writer_nikcon,[onclick*="gallog"],a[href*="gallog"],.dcb-uid-badge'))].join(" ");
    const nick = writer?.getAttribute?.("data-nick")
      || node.getAttribute?.("data-nick")
      || writer?.querySelector?.(".nickname em,.nickname,.nick_name,em")?.textContent?.trim()
      || writer?.textContent?.replace(/메모\s*추가|삭제|수정|답글/g, "").replace(/\s+/g, " ").trim()
      || "";
    const uid = previewUidToken(writer?.getAttribute?.("data-uid"))
      || previewUidToken(node.getAttribute?.("data-uid"))
      || previewUidToken(writer?.getAttribute?.("data-memo-uid"))
      || gallogUidFromText(refText)
      || "";
    const ip = previewIpPrefix(writer?.getAttribute?.("data-ip"))
      || previewIpPrefix(node.getAttribute?.("data-ip"))
      || previewIpPrefix(writer?.getAttribute?.("data-memo-ip"))
      || previewIpPrefix(writer?.querySelector?.(".ip,.writer_ip")?.textContent || "")
      || "";
    return { nick, uid, ip };
  }

  function previewWriterBadge(meta = {}){
    const nick = meta.nick || "익명";
    const uid = previewUidToken(meta.uid);
    const ip = previewIpPrefix(meta.ip);
    const loc = meta.loc || "preview";
    const nickHtml = `<span class="nickname in" title="${escapeText(nick)}"><em>${escapeText(nick)}</em></span>`;
    const mark = uid ? `<span class="writer_nikcon" aria-hidden="true"></span>` : "";
    const ipHtml = ip ? ` <span class="ip">(${escapeText(ip)})</span>` : "";
    return `<span class="gall_writer ub-writer dcbpv-writer-ref" data-loc="${escapeText(loc)}" data-nick="${escapeText(nick)}" data-uid="${escapeText(uid)}" data-ip="${escapeText(ip)}">${nickHtml}${mark}${ipHtml}</span>`;
  }

  function commentMetaFromElement(item){
    const writer = item?.querySelector?.(".gall_writer,.ub-writer,.cmt_nickbox,.nickname,.nick_name");
    return previewWriterMeta(writer || item);
  }

  function commentMetaFromRecord(record){
    const nick = recordText(record, ["name", "nick", "nickname", "user_name", "user_id", "ip"]) || "익명";
    const uid = previewUidToken(recordText(record, ["user_id", "userId", "uid", "member_id", "memberId", "gallog_id", "gallogId"]));
    const ip = previewIpPrefix(recordText(record, ["ip", "ip_addr", "ipaddr", "user_ip"]));
    return { nick, uid, ip };
  }

  function commentLooksAutomated(item, nick){
    return normalizePreviewNick(nick) === "댓글돌이" || !!item?.querySelector?.(".nickname.cmtboy,.comment_dory,.dory_txt") || item?.classList?.contains("dory");
  }

  function buildWriterHTML(doc, root, baseUrl){
    const writerSelectors = [
      ".gallview_head .gall_writer", ".view_head .gall_writer", ".gallview_head .ub-writer", ".view_head .ub-writer",
      ".gallview_head .btm", ".view_head .btm", ".btm", ".writer_info", ".user_info", ".gall_writer", ".ub-writer"
    ];
    const direct = writerSelectors
      .flatMap((selector) => Array.from((root || doc).querySelectorAll?.(selector) || []).concat(Array.from(doc.querySelectorAll(selector))))
      .find((node, index, arr) => arr.indexOf(node) === index && !isCommentArea(node));

    const date = asText(doc, ".gallview_head .gall_date,.view_head .gall_date,.gallview_head .date,.view_head .date,.gall_date")
      || asText(root, ".gall_date,.date,.regdate,.time");
    const views = numberNear(asText(doc, ".gallview_head,.view_head") || "", /조회\s*([-+]?\d[\d,]*)/, "");

    const writerMeta = previewWriterMeta(direct);
    const nick = writerMeta.nick || "";
    const uid = writerMeta.uid || "";
    const ip = writerMeta.ip || "";

    const compact = [
      nick && `<span class="dcbpv-chip dcbpv-author-name">${previewWriterBadge({ nick, uid, ip, loc: "preview-author" })}</span>`,
      date && `<span class="dcbpv-chip">${escapeText(date)}</span>`,
      views && `<span class="dcbpv-chip">조회 ${views}</span>`
    ].filter(Boolean).join(" ");

    if (compact) return compact;

    const directHTML = cleanWriter(direct, baseUrl);
    if (directHTML) return directHTML;
    return "";
  }

  function articleHTMLFromElement(source, baseUrl){
    if (!source) return "";
    const clone = source.cloneNode(true);
    clone.querySelectorAll([
      "#comment_wrap", ".comment_wrap", ".all-comment", ".cmt_list", ".reply_list", ".cmt_write_box", ".comment_write",
      "#recomm_btn", "#recomm_btn_member", "#nonrecomm_btn", ".btn_recommend_box", ".recom_bottom_box", ".recommend_box",
      ".cmt_txt_cont", ".comment_box", ".reply_box", ".bottom_paging_box", ".array_tab", ".btn_sns", ".view_bottom_btnbox",
      "input", "textarea", "select", "button", "form", ".captcha", ".kcaptcha", ".code_input", ".appending_file_box"
    ].join(",")).forEach((node) => node.remove());
    normalizeDcMedia(clone, baseUrl);
    stripUnsafe(clone, baseUrl);
    return clone.innerHTML.trim();
  }

  function commentNick(item){
    const writer = item.querySelector(".gall_writer,.ub-writer,.cmt_nickbox,.nickname,.nick_name");
    return writer?.getAttribute?.("data-nick")
      || writer?.querySelector?.(".nickname em,.nickname,.nick_name,em")?.textContent?.trim()
      || writer?.textContent?.replace(/메모\s*추가|삭제|수정|답글/g, "").replace(/\s+/g, " ").trim()
      || "익명";
  }

  function commentDate(item){
    return item.querySelector(".date_time,.gall_date,.date,.regdate,.time")?.textContent?.replace(/\s+/g, " ").trim() || "";
  }

  function commentBodyHTML(item, baseUrl){
    const body = item.querySelector(".usertxt.ub-word,.usertxt,.cmt_txtbox,.comment_txt,.reply_txt,.comment_dccon,.txt") || item;
    const clone = body.cloneNode(true);
    clone.querySelectorAll([
      ".dcb-writer-tools", ".cmt_mdf_del", ".btn_cmt_delete", ".btn_cmt_modify", ".btn_reply", ".reply", ".comment_write",
      ".cmt_write_box", "input", "textarea", "select", "button", "form", ".captcha", ".kcaptcha", ".code_input"
    ].join(",")).forEach((node) => node.remove());
    normalizeDcMedia(clone, baseUrl);
    stripUnsafe(clone, baseUrl);
    const html = clone.innerHTML.trim();
    if (html) return html;
    return escapeText(body.textContent.replace(/\s+/g, " ").trim());
  }

  function collectCommentItems(doc, root){
    const sources = [root, doc].filter(Boolean);
    const found = [];
    const seen = new Set();
    const add = (node) => {
      if (!node || seen.has(node)) return;
      seen.add(node);
      const text = node.textContent.replace(/\s+/g, " ").trim();
      if (!text && !node.querySelector("img,video")) return;
      if (node.closest(".cmt_write_box,.comment_write,form")) return;
      if (!node.querySelector(".cmt_info,.usertxt,.cmt_txtbox,.comment_txt,.reply_txt,.date_time,.gall_writer,.ub-writer")) return;
      found.push(node);
    };

    sources.forEach((scope) => {
      scope.querySelectorAll?.("li[id^='comment_li_'],li.ub-content").forEach((node) => {
        if (node.id?.startsWith("comment_li_") || node.querySelector(".cmt_info,.usertxt,.cmt_txtbox")) add(node);
      });
      scope.querySelectorAll?.(".cmt_info,.comment_info,.reply_info").forEach((node) => add(node.closest("li") || node));
    });

    return found;
  }

  function buildCommentsHTML(doc, root, baseUrl){
    const items = collectCommentItems(doc, root);
    if (items.length) {
      const rows = items.map((item) => {
        const meta = commentMetaFromElement(item);
        const nick = meta.nick || commentNick(item);
        const date = commentDate(item);
        const body = commentBodyHTML(item, baseUrl);
        const plain = htmlToPlain(body);
        if (!plain && !/<(?:img|video)\b/i.test(body)) return "";
        if (/^(등록순|최신순|답글순|댓글닫기|새로고침|본문 보기|전체 댓글)/.test(plain)) return "";
        const depthClass = item.classList?.contains("reply") || item.classList?.contains("reply_line") || item.querySelector?.(".reply_info") ? " reply" : "";
        const deletedClass = /삭제된 댓글|운영자에 의해/.test(plain) ? " deleted" : "";
        const doryClass = commentLooksAutomated(item, nick) ? " dory" : "";
        return `<div class="dcbpv-comment-item${depthClass}${deletedClass}${doryClass}" data-dcbpv-comment="1" data-nick="${escapeText(nick)}" data-uid="${escapeText(meta.uid)}" data-ip="${escapeText(meta.ip)}"><div class="dcbpv-comment-meta">${previewWriterBadge({ nick, uid: meta.uid, ip: meta.ip, loc: "preview-comment" })}${date ? `<span>${escapeText(date)}</span>` : ""}</div><div class="dcbpv-comment-body">${body}</div></div>`;
      }).filter(Boolean);
      if (rows.length) return `<div class="dcbpv-comment-list">${rows.join("")}</div>`;
    }

    const box = pickCommentElement(doc, root);
    if (!box) return "";
    const clone = box.cloneNode(true);
    clone.querySelectorAll([
      ".cmt_write_box", ".comment_write", ".reply_write", ".dccon_insertbox", ".comment_paging", ".bottom_paging_box",
      ".array_tab", ".cmt_mdf_del", ".btn_cmt_delete", ".btn_cmt_modify", "input", "textarea", "select", "button", "form", ".captcha", ".kcaptcha", ".code_input"
    ].join(",")).forEach((node) => node.remove());
    normalizeDcMedia(clone, baseUrl);
    stripUnsafe(clone, baseUrl);
    return clone.innerHTML.trim();
  }

  function pickCommentElement(doc, root){
    const selectors = [
      ".all-comment", "#all-comment", "#comment_wrap", ".comment_wrap",
      ".cmt_list", "#cmt_list", ".comment_box", ".reply_box", ".view_comment", "#comments"
    ].join(",");
    const candidates = Array.from(root.querySelectorAll?.(selectors) || []).concat(Array.from(doc.querySelectorAll(selectors)));
    let best = null;
    let bestScore = -Infinity;

    candidates.forEach((node, index) => {
      const text = node.textContent.replace(/\s+/g, " ").trim();
      let score = Math.min(text.length, 1400) / 24;
      if (node.querySelector("li[id^='comment_li_'],li.ub-content .cmt_info,.usertxt")) score += 80;
      if (/전체\s*댓글|등록순|최신순|답글순|댓글/.test(text)) score += 24;
      if (node.matches(".all-comment,#all-comment,#comment_wrap,.comment_wrap")) score += 26;
      if (node.querySelector("textarea,input[name=captcha],.cmt_write_box,.comment_write")) score -= 35;
      if (isUtilityContainer(node)) score -= 120;
      score -= index * 0.1;
      if (score > bestScore) {
        bestScore = score;
        best = node;
      }
    });

    return best;
  }

  function voteInner(doc, root, selectors, fallback = "0"){
    const candidates = [];
    for (const selector of selectors) {
      const node = root.querySelector?.(selector) || doc.querySelector(selector);
      if (!node) continue;
      candidates.push(node);
      node.querySelectorAll?.(".num,.up_num,.down_num,.recom_num,.recommend_num,em,strong,span").forEach((child) => candidates.push(child));
    }

    for (const node of candidates) {
      const text = node.textContent?.replace(/\s+/g, " ").trim() || "";
      if (!text) continue;
      const exact = text.match(/^[-+]?\d[\d,]*$/);
      if (exact) return escapeText(exact[0]);
    }

    for (const node of candidates) {
      const text = node.textContent?.replace(/\s+/g, " ").trim() || "";
      const found = text.match(/[-+]?\d[\d,]*/);
      if (found) return escapeText(found[0]);
    }

    return fallback;
  }

  function numberNear(text, pattern, fallback = "0"){
    const compact = String(text || "").replace(/\s+/g, " ");
    const found = compact.match(pattern);
    return found?.[1] ? escapeText(found[1]) : fallback;
  }

  function extractCounts(doc, root, title){
    const headText = [
      asText(doc, ".gallview_head"),
      asText(doc, ".view_head"),
      asText(root, ".gallview_head,.view_head")
    ].join(" ");
    const full = doc.body?.innerText || doc.body?.textContent || "";
    const titleIndex = title && title !== "제목 없음" ? full.indexOf(title) : -1;
    const slice = titleIndex >= 0 ? full.slice(titleIndex, titleIndex + 3200) : (root.textContent || full).slice(0, 3200);

    let up = voteInner(doc, root, [
      "#recomm_btn .up_num", "#recomm_btn .num", "#recomm_btn em", "#recomm_btn strong", "#recomm_btn",
      "#recommend_view_up .up_num", "#recommend_view_up .num", ".btn_recommend_box .up_num", ".up_num", ".recommend_num"
    ], "");
    let upMember = voteInner(doc, root, ["#recomm_btn_member .num", "#recomm_btn_member", ".recomm_btn_member", ".member_recommend", ".gall_recom_member"], "");
    let down = voteInner(doc, root, [
      "#nonrecomm_btn .down_num", "#nonrecomm_btn .num", "#nonrecomm_btn em", "#nonrecomm_btn strong", "#nonrecomm_btn",
      "#recommend_view_down .down_num", "#recommend_view_down .num", ".btn_recommend_box .down_num", ".down_num", ".nonrecommend_num"
    ], "");

    if (!up || up === "0") up = numberNear(headText, /추천\s*([-+]?\d[\d,]*)/, up || "0");
    if (!down) down = numberNear(slice, /비추\s*([-+]?\d[\d,]*)/, "0");

    return { up: up || "0", upMember: upMember || "", down: down || "0" };
  }

  function buildReportUrl(originalUrl, gallId, articleNo, title){
    return articleNo && gallId
      ? `https://gall.dcinside.com/singo/?id=singo&singo_id=${encodeURIComponent(gallId)}&singo_no=${encodeURIComponent(articleNo)}&ko_name=${encodeURIComponent(title)}&s_url=${encodeURIComponent(originalUrl)}&gall_type=G`
      : "";
  }

  function parsePreviewDocument(html, originalUrl, fetchedUrl, mode){
    const doc = new DOMParser().parseFromString(html, "text/html");
    const baseUrl = fetchedUrl || originalUrl;
    normalizeDcMedia(doc, baseUrl);

    const content = findBestContent(doc, mode);
    const root = content ? findArticleRoot(content, doc) : doc;
    const title = pickTitle(doc, root, content);
    const writerHTML = buildWriterHTML(doc, root, baseUrl);
    const articleNo = articleNumberFrom(originalUrl, doc);
    const gallId = galleryIdFrom(originalUrl);
    let commentsHTML = buildCommentsHTML(doc, root, baseUrl);

    if (!commentsHTML) {
      const plainComments = textBetweenMarkers(doc, /댓글\s*영역|전체\s*댓글/, /하단\s*갤러리\s*리스트\s*영역|전체글\s*개념글|글쓰기\s*\n|갤러리\s*리스트\s*번호/);
      commentsHTML = plainBlockToHtml(plainComments);
    }

    const commentCount = collectCommentItems(doc, root).length;
    const expectedComments = commentCountFromText(doc, root);

    return {
      url: originalUrl,
      fetchedUrl: baseUrl,
      title,
      writerHTML,
      articleHTML: content ? articleHTMLFromElement(content, baseUrl) : "",
      commentsHTML,
      commentTitle: commentsHTML ? `댓글${commentCount ? ` ${commentCount}개` : expectedComments ? ` ${expectedComments}개` : ""}` : (expectedComments ? `댓글 ${expectedComments}개` : "댓글 없음"),
      counts: extractCounts(doc, root, title),
      gallId,
      articleNo,
      rawHtml: html,
      desktopRawHtml: mode === "desktop" ? html : "",
      reportUrl: buildReportUrl(originalUrl, gallId, articleNo, title)
    };
  }

  function parseMobilePreview(html, originalUrl, fetchedUrl){
    return parsePreviewDocument(html, originalUrl, fetchedUrl, "mobile");
  }

  function parseDesktopFallback(html, originalUrl, fetchedUrl = originalUrl){
    return parsePreviewDocument(html, originalUrl, fetchedUrl, "desktop");
  }

  function isWeakPreviewData(data){
    if (!data) return true;
    const title = String(data.title || "").trim();
    const articleText = htmlToPlain(data.articleHTML);
    if (!data.articleHTML || !articleText) return true;
    if (isLayerLikeText(title)) return true;
    if (isHashOnlyText(articleText)) return true;
    if (/자동\s*짤방|최근\s*방문|즐겨찾기|레이어\s*닫기/.test(articleText) && articleText.length < 160) return true;
    return false;
  }

  function mergePreviewData(primary, backup){
    if (!backup) return primary;
    const articleText = htmlToPlain(primary?.articleHTML);
    const backupArticleText = htmlToPlain(backup.articleHTML);
    const result = { ...primary };

    if (!result.title || isLayerLikeText(result.title)) result.title = backup.title;
    if (!result.writerHTML && backup.writerHTML) result.writerHTML = backup.writerHTML;
    if ((!result.articleHTML || isHashOnlyText(articleText)) && backup.articleHTML) result.articleHTML = backup.articleHTML;
    if (!result.commentsHTML && backup.commentsHTML) {
      result.commentsHTML = backup.commentsHTML;
      result.commentTitle = backup.commentTitle;
    }

    const currentCounts = result.counts || {};
    const backupCounts = backup.counts || {};
    result.counts = {
      up: currentCounts.up && currentCounts.up !== "0" ? currentCounts.up : (backupCounts.up || currentCounts.up || "0"),
      upMember: currentCounts.upMember || backupCounts.upMember || "",
      down: currentCounts.down && currentCounts.down !== "0" ? currentCounts.down : (backupCounts.down || currentCounts.down || "0")
    };

    if (!result.reportUrl && backup.reportUrl) result.reportUrl = backup.reportUrl;
    if (!result.rawHtml && backup.rawHtml) result.rawHtml = backup.rawHtml;
    if (!result.desktopRawHtml && backup.desktopRawHtml) result.desktopRawHtml = backup.desktopRawHtml;
    if (backupArticleText.length > articleText.length * 1.8 && isWeakPreviewData(result)) return backup;
    return result;
  }

  function sendRuntimeFetchMessage(payload){
    return new Promise((resolve, reject) => {
      try {
        chrome.runtime.sendMessage(payload, (response) => {
          const runtimeError = chrome.runtime.lastError;
          if (runtimeError) {
            reject(new Error(runtimeError.message || "백그라운드 fetch 브릿지가 응답하지 않았습니다."));
            return;
          }
          resolve(response);
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  async function fetchText(url, signal, request = {}){
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");

    const options = typeof request === "string" ? { cache: request } : (request || {});
    const response = await sendRuntimeFetchMessage({
      type: "dcb.fetchText",
      url,
      cache: options.cache || "default",
      method: options.method || "GET",
      body: options.body || "",
      headers: options.headers || undefined,
      accept: options.accept || undefined,
      referrer: options.referrer || undefined
    });

    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    if (response?.ok) {
      return {
        text: response.text || "",
        finalUrl: response.finalUrl || response.url || url,
        status: response.status || 200
      };
    }

    const errorMessage = response?.error || "백그라운드 fetch 브릿지에서 빈 응답을 받았습니다.";
    throw new Error(errorMessage);
  }

  async function fetchTextDirect(url, signal, request = {}){
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");

    const options = typeof request === "string" ? { cache: request } : (request || {});
    const method = String(options.method || "GET").toUpperCase();
    const headers = new Headers();
    if (options.accept) headers.set("Accept", String(options.accept));
    const extraHeaders = options.headers && typeof options.headers === "object" ? options.headers : {};
    Object.entries(extraHeaders).forEach(([name, value]) => {
      const key = String(name || "").toLowerCase();
      // 브라우저가 허용하는 AJAX 핵심 헤더만 사용한다.
      if (!["content-type", "x-requested-with", "accept", "accept-language"].includes(key)) return;
      headers.set(name, String(value));
    });

    const init = {
      method,
      credentials: "include",
      cache: options.cache === "reload" ? "reload" : "default",
      redirect: "follow",
      headers
    };

    if (method === "POST") init.body = String(options.body || "");
    if (options.referrer) {
      try {
        const ref = new URL(String(options.referrer), location.href);
        // 같은 origin으로 referrer를 맞춰야 디시 댓글 AJAX가 실제 페이지 요청처럼 처리된다.
        if (ref.origin === location.origin) init.referrer = ref.href;
      } catch (_) {}
    }

    const response = await fetch(url, init);
    const text = await response.text();

    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    return {
      text,
      finalUrl: response.url || url,
      status: response.status || 200
    };
  }

  function textValueBySelector(doc, selectors){
    for (const selector of selectors) {
      const node = doc.querySelector(selector);
      const value = node?.value || node?.getAttribute?.("value") || node?.textContent;
      if (String(value || "").trim()) return String(value).trim();
    }
    return "";
  }

  function securityTokenFromHtml(doc){
    const direct = textValueBySelector(doc, ["#e_s_n_o", "input[name='e_s_n_o']"]);
    if (direct) return direct;

    const html = doc?.documentElement?.innerHTML || doc?.body?.innerHTML || "";
    const patterns = [
      /["']e_s_n_o["']\s*[:=]\s*["']([^"']+)["']/i,
      /e_s_n_o\s*[:=]\s*["']([^"']+)["']/i,
      /name=["']e_s_n_o["'][^>]*value=["']([^"']+)["']/i,
      /id=["']e_s_n_o["'][^>]*value=["']([^"']+)["']/i,
      /value=["']([^"']+)["'][^>]*(?:name|id)=["']e_s_n_o["']/i
    ];

    for (const pattern of patterns) {
      const found = html.match(pattern);
      if (found?.[1]) return found[1].trim();
    }

    return "";
  }

  function previewRequestInfo(originalUrl, doc){
    let parsed = null;
    try { parsed = new URL(originalUrl, location.href); } catch (_) {}

    const id = parsed?.searchParams.get("id")
      || textValueBySelector(doc, ["input[name='id']", "#id", "input[name='gallery_id']"])
      || textValueBySelector(document, ["input[name='id']", "#id", "input[name='gallery_id']"]);
    const no = parsed?.searchParams.get("no")
      || textValueBySelector(doc, ["#no", "input[name='no']", "input[name='article_no']"]);
    const securityToken = securityTokenFromHtml(doc) || securityTokenFromHtml(document);
    const cmtId = textValueBySelector(doc, ["#cmt_id", "input[name='cmt_id']"])
      || textValueBySelector(document, ["#cmt_id", "input[name='cmt_id']"])
      || id;
    const cmtNo = textValueBySelector(doc, ["#cmt_no", "input[name='cmt_no']"])
      || textValueBySelector(document, ["#cmt_no", "input[name='cmt_no']"])
      || no;
    const galleryType = previewGalleryTypeFromUrl(originalUrl);

    return { id, no, cmtId, cmtNo, securityToken, galleryType };
  }

  function commentCountFromText(doc, root){
    const sample = [
      asText(doc, ".gallview_head,.view_head"),
      asText(root, ".gallview_head,.view_head"),
      doc.body?.innerText || doc.body?.textContent || ""
    ].join(" ").replace(/\s+/g, " ");
    const found = sample.match(/댓글\s*([-+]?\d[\d,]*)/);
    return found?.[1] ? Number(found[1].replace(/,/g, "")) : 0;
  }

  function parseLooseJson(text){
    const raw = String(text || "").trim();
    if (!raw) return null;
    const direct = (() => { try { return JSON.parse(raw); } catch (_) { return null; } })();
    if (direct) return direct;
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start < 0 || end <= start) return null;
    try { return JSON.parse(raw.slice(start, end + 1)); } catch (_) { return null; }
  }

  function looksLikeHtml(value){
    return /<\s*(li|div|span|p|img|video|em|strong|a)\b/i.test(String(value || ""));
  }

  function commentHtmlFragments(value, depth = 0){
    if (depth > 5 || value == null) return [];
    if (typeof value === "string") return looksLikeHtml(value) ? [value] : [];
    if (Array.isArray(value)) return value.flatMap((item) => commentHtmlFragments(item, depth + 1));
    if (typeof value !== "object") return [];

    const priority = ["comments", "comment", "list", "comment_list", "html", "content", "data", "result"];
    const out = [];
    priority.forEach((key) => {
      if (Object.prototype.hasOwnProperty.call(value, key)) out.push(...commentHtmlFragments(value[key], depth + 1));
    });
    Object.keys(value).forEach((key) => {
      if (!priority.includes(key)) out.push(...commentHtmlFragments(value[key], depth + 1));
    });
    return out;
  }

  function recordText(record, keys){
    for (const key of keys) {
      const value = record?.[key];
      if (value == null) continue;
      const text = String(value).trim();
      if (text) return text;
    }
    return "";
  }

  function collectCommentRecords(value, depth = 0){
    if (depth > 6 || value == null) return [];
    if (Array.isArray(value)) return value.flatMap((item) => collectCommentRecords(item, depth + 1));
    if (typeof value !== "object") return [];

    const body = recordText(value, ["memo", "contents", "content", "comment", "comment_memo", "text", "body"]);
    const hasIdentity = recordText(value, ["name", "nick", "nickname", "user_name", "user_id", "ip", "reg_date", "date_time"]);
    if (body && hasIdentity) return [value];

    const priority = ["comments", "comment", "list", "comment_list", "data", "result"];
    const out = [];
    priority.forEach((key) => {
      if (Object.prototype.hasOwnProperty.call(value, key)) out.push(...collectCommentRecords(value[key], depth + 1));
    });
    Object.keys(value).forEach((key) => {
      if (!priority.includes(key)) out.push(...collectCommentRecords(value[key], depth + 1));
    });
    return out;
  }

  function commentRecordBody(record, baseUrl){
    const raw = recordText(record, ["memo", "contents", "content", "comment", "comment_memo", "text", "body"]);
    if (!raw) return "";
    if (!looksLikeHtml(raw)) return escapeText(raw).replace(/\n/g, "<br>");

    const doc = new DOMParser().parseFromString(`<div>${raw}</div>`, "text/html");
    normalizeDcMedia(doc, baseUrl);
    return htmlFromElement(doc.body.firstElementChild || doc.body, baseUrl);
  }

  function commentRecordsToHtml(records, baseUrl){
    const rows = records.map((record) => {
      const body = commentRecordBody(record, baseUrl);
      const plain = htmlToPlain(body);
      if (!plain && !/<(?:img|video)\b/i.test(body)) return "";
      const meta = commentMetaFromRecord(record);
      const nick = meta.nick || "익명";
      const date = recordText(record, ["reg_date", "date_time", "date", "time"]);
      const replyClass = String(record.depth || record.c_depth || record.reply || "") !== "0" && String(record.depth || record.c_depth || record.reply || "") !== "" ? " reply" : "";
      const deletedClass = /삭제|차단|운영자/.test(plain) || /Y/i.test(String(record.del_yn || record.is_delete || "")) ? " deleted" : "";
      const doryClass = normalizePreviewNick(nick) === "댓글돌이" ? " dory" : "";
      return `<div class="dcbpv-comment-item${replyClass}${deletedClass}${doryClass}" data-dcbpv-comment="1" data-nick="${escapeText(nick)}" data-uid="${escapeText(meta.uid)}" data-ip="${escapeText(meta.ip)}"><div class="dcbpv-comment-meta">${previewWriterBadge({ nick, uid: meta.uid, ip: meta.ip, loc: "preview-comment" })}${date ? `<span>${escapeText(date)}</span>` : ""}</div><div class="dcbpv-comment-body">${body}</div></div>`;
    }).filter(Boolean);
    return rows.length ? `<div class="dcbpv-comment-list">${rows.join("")}</div>` : "";
  }

  function commentDataToHtml(payload, baseUrl){
    if (!payload) return "";

    const records = collectCommentRecords(payload);
    if (records.length) return commentRecordsToHtml(records, baseUrl);

    const fragments = commentHtmlFragments(payload);
    if (!fragments.length) return "";
    const doc = new DOMParser().parseFromString(`<div id="dcbpv-comment-source">${fragments.join("\n")}</div>`, "text/html");
    normalizeDcMedia(doc, baseUrl);
    return buildCommentsHTML(doc, doc, baseUrl);
  }

  function commentResponseToHtml(text, baseUrl){
    const payload = parseLooseJson(text);
    const fromJson = commentDataToHtml(payload, baseUrl);
    if (fromJson) return fromJson;

    const raw = String(text || "").trim();
    if (!looksLikeHtml(raw)) return "";

    const doc = new DOMParser().parseFromString(`<div id="dcbpv-comment-raw">${raw}</div>`, "text/html");
    normalizeDcMedia(doc, baseUrl);
    return buildCommentsHTML(doc, doc, baseUrl);
  }

  function commentEndpointCandidates(articleUrl){
    let protocol = "https:";
    let path = "";
    try {
      const u = new URL(articleUrl, location.href);
      protocol = /^https?:$/.test(u.protocol) ? u.protocol : "https:";
      path = u.pathname || "";
    } catch (_) {}

    const endpoints = [
      `${protocol}//gall.dcinside.com/board/comment`,
      `${protocol}//gall.dcinside.com/board/comment/`
    ];

    // 메인/마이너에서 성공하던 기본 endpoint를 먼저 쓰고,
    // 미니/인물 전용 endpoint는 실패 시 fallback으로만 시도한다.
    if (/\/mini\//i.test(path)) {
      endpoints.push(`${protocol}//gall.dcinside.com/mini/board/comment`);
      endpoints.push(`${protocol}//gall.dcinside.com/mini/board/comment/`);
    }
    if (/\/person\//i.test(path)) {
      endpoints.push(`${protocol}//gall.dcinside.com/person/board/comment`);
      endpoints.push(`${protocol}//gall.dcinside.com/person/board/comment/`);
    }

    return Array.from(new Set(endpoints));
  }

  function commentRequestBodies(info){
    const base = {
      comment_page: "1",
      id: info.id,
      no: info.no,
      cmt_id: info.cmtId || info.id,
      cmt_no: info.cmtNo || info.no,
      sort: "D"
    };

    const baseVariants = [base, { ...base, sort: "N" }];

    if (info.galleryType === "mini") {
      baseVariants.push(
        { ...base, board_type: "MI" },
        { ...base, gall_type: "MI" },
        { ...base, gallery_type: "MI" },
        { ...base, mini: "Y" }
      );
    }

    if (info.galleryType === "person") {
      baseVariants.push(
        { ...base, board_type: "P" },
        { ...base, gall_type: "P" },
        { ...base, gallery_type: "P" },
        { ...base, person: "Y" }
      );
    }

    const bodies = [];
    const seen = new Set();
    const add = (params) => {
      const body = new URLSearchParams(params).toString();
      if (!seen.has(body)) {
        seen.add(body);
        bodies.push(body);
      }
    };

    for (const item of baseVariants) {
      if (info.securityToken) add({ ...item, e_s_n_o: info.securityToken });
      add(item);
      add({ ...item, e_s_n_o: "" });
    }

    return bodies;
  }

  function commentDebugSummaryItem(entry){
    if (!entry) return "";
    const status = entry.status ? `HTTP ${entry.status}` : (entry.error ? "ERR" : "OK");
    const endpoint = String(entry.endpoint || "").replace(/^https?:\/\/gall\.dcinside\.com/i, "");
    return `${entry.method || "POST"} ${endpoint} → ${status}${entry.length != null ? ` / ${entry.length}자` : ""}${entry.snippet ? ` / ${entry.snippet}` : ""}`;
  }

  function actualCommentItemCountFromHtml(html){
    if (!html) return 0;
    try {
      const doc = new DOMParser().parseFromString(`<div>${html}</div>`, "text/html");
      return doc.querySelectorAll(".dcbpv-comment-item,[data-dcbpv-comment='1']").length;
    } catch (_) {
      return 0;
    }
  }

  function expectedCommentCountFromData(data){
    const sample = [data?.commentTitle || "", htmlToPlain(data?.articleHTML || "")].join(" ");
    const found = sample.match(/댓글\s*([-+]?\d[\d,]*)/);
    return found?.[1] ? Number(found[1].replace(/,/g, "")) : 0;
  }

  function waitMs(ms, signal){
    return new Promise((resolve, reject) => {
      if (signal?.aborted) {
        reject(new DOMException("Aborted", "AbortError"));
        return;
      }
      const timer = setTimeout(resolve, ms);
      if (signal) {
        signal.addEventListener("abort", () => {
          clearTimeout(timer);
          reject(new DOMException("Aborted", "AbortError"));
        }, { once: true });
      }
    });
  }

  async function fetchCommentsViaRenderedFrame(articleUrl, signal){
    const type = previewGalleryTypeFromUrl(articleUrl);
    if (type !== "mini" && type !== "person") return { html: "", debug: [{ method: "IFRAME", endpoint: articleUrl, error: "iframe 대상 아님" }] };

    const debug = [];
    let frame = null;
    const started = Date.now();

    try {
      const parsed = new URL(articleUrl, location.href);
      if (parsed.origin !== location.origin) {
        return { html: "", debug: [{ method: "IFRAME", endpoint: articleUrl, error: "origin 다름" }] };
      }

      frame = document.createElement("iframe");
      frame.src = parsed.href;
      frame.loading = "eager";
      frame.referrerPolicy = "strict-origin-when-cross-origin";
      frame.setAttribute("aria-hidden", "true");
      frame.setAttribute("data-dcbpv-comment-frame", "1");
      Object.assign(frame.style, {
        position: "fixed",
        left: "-12000px",
        top: "-12000px",
        width: "980px",
        height: "1200px",
        opacity: "0.001",
        pointerEvents: "none",
        zIndex: "-1"
      });

      const loadPromise = new Promise((resolve) => {
        frame.addEventListener("load", resolve, { once: true });
      });

      (document.documentElement || document.body).appendChild(frame);

      await Promise.race([loadPromise, waitMs(2600, signal)]).catch((error) => {
        if (error?.name === "AbortError") throw error;
      });

      const deadlines = [0, 350, 800, 1400, 2300, 3400, 4800];
      let lastText = "";

      for (const delay of deadlines) {
        if (delay) await waitMs(delay, signal);
        if (signal?.aborted) throw new DOMException("Aborted", "AbortError");

        let doc = null;
        try {
          doc = frame.contentDocument || frame.contentWindow?.document;
        } catch (accessError) {
          debug.push({ method: "IFRAME", endpoint: articleUrl, error: accessError?.message || String(accessError) });
          break;
        }
        if (!doc?.body) continue;

        normalizeDcMedia(doc, articleUrl);
        const content = findBestContent(doc, "desktop");
        const root = content ? findArticleRoot(content, doc) : doc;
        const html = buildCommentsHTML(doc, root, articleUrl) || buildCommentsHTML(doc, doc, articleUrl);
        const count = actualCommentItemCountFromHtml(html);
        lastText = (doc.body.innerText || doc.body.textContent || "").replace(/\s+/g, " ").slice(0, 240);

        if (count) {
          const item = {
            method: "IFRAME",
            endpoint: parsed.href,
            via: "rendered-frame",
            status: 200,
            length: html.length,
            tookMs: Date.now() - started,
            snippet: `렌더링 iframe 댓글 ${count}개 추출 성공`
          };
          debug.push(item);
          previewCommentLog(articleUrl, "success", item);
          return { html, debug };
        }
      }

      const item = {
        method: "IFRAME",
        endpoint: parsed.href,
        via: "rendered-frame",
        status: 200,
        length: 0,
        tookMs: Date.now() - started,
        snippet: lastText ? `iframe 댓글 DOM 없음 / ${lastText}` : "iframe 댓글 DOM 없음"
      };
      debug.push(item);
      previewCommentLog(articleUrl, "miss", item);
      return { html: "", debug };
    } catch (error) {
      const item = { method: "IFRAME", endpoint: articleUrl, error: error?.message || String(error), tookMs: Date.now() - started };
      debug.push(item);
      previewCommentLog(articleUrl, "error", item);
      return { html: "", debug };
    } finally {
      try { frame?.remove?.(); } catch (_) {}
    }
  }

  async function fetchCommentsFromEndpoint(articleUrl, articleDoc, signal, cacheMode){
    const info = previewRequestInfo(articleUrl, articleDoc);
    if (!info.id || !info.no) return { html: "", debug: [{ error: "id/no 없음", info }] };

    const endpoints = commentEndpointCandidates(articleUrl);
    const bodies = commentRequestBodies(info);
    const debug = [];
    let lastError = null;

    previewCommentLog(articleUrl, "start", {
      galleryType: info.galleryType,
      id: info.id,
      no: info.no,
      hasToken: !!info.securityToken,
      endpoints,
      bodyCount: bodies.length
    });

    const tryRequest = async (method, endpoint, body) => {
      const requestUrl = method === "GET" ? `${endpoint}${endpoint.includes("?") ? "&" : "?"}${body}` : endpoint;
      const started = Date.now();
      const requestOptions = {
        cache: cacheMode,
        method,
        body: method === "POST" ? body : "",
        referrer: articleUrl,
        accept: "application/json,text/javascript,text/html,*/*;q=0.8",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
          "X-Requested-With": "XMLHttpRequest",
          "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7"
        }
      };

      const useDirectFirst = info.galleryType === "mini" || info.galleryType === "person";
      let response;
      let fetchVia = useDirectFirst ? "direct" : "background";

      try {
        response = useDirectFirst
          ? await fetchTextDirect(requestUrl, signal, requestOptions)
          : await fetchText(requestUrl, signal, requestOptions);
      } catch (firstError) {
        // 미니/인물 댓글은 background service worker fetch가 페이지 내부 AJAX와 다르게 보일 수 있다.
        // direct가 실패하면 기존 background 브릿지로, background가 실패하면 direct로 교차 fallback한다.
        try {
          fetchVia = useDirectFirst ? "background-after-direct" : "direct-after-background";
          response = useDirectFirst
            ? await fetchText(requestUrl, signal, requestOptions)
            : await fetchTextDirect(requestUrl, signal, requestOptions);
        } catch (secondError) {
          secondError.message = `${secondError.message || secondError} / first:${firstError?.message || firstError}`;
          throw secondError;
        }
      }

      const html = commentResponseToHtml(response.text, response.finalUrl || endpoint);
      const item = {
        method,
        endpoint,
        via: fetchVia,
        status: response.status,
        length: String(response.text || "").length,
        tookMs: Date.now() - started,
        body: safeCommentBodyForLog(body),
        snippet: html ? "댓글 HTML 추출 성공" : responseSnippet(response.text)
      };
      debug.push(item);
      previewCommentLog(articleUrl, html ? "success" : "miss", item);
      return html;
    };

    for (const endpoint of endpoints) {
      for (const body of bodies) {
        try {
          const html = await tryRequest("POST", endpoint, body);
          if (html) return { html, debug };
        } catch (error) {
          lastError = error;
          const item = { method: "POST", endpoint, error: error?.message || String(error), body: safeCommentBodyForLog(body) };
          debug.push(item);
          previewCommentLog(articleUrl, "error", item);
        }
      }
    }

    // 일부 응답은 같은 파라미터를 GET query로 받을 때 HTML fragment를 반환한다.
    // POST가 전부 비었을 때만 제한적으로 GET fallback을 시도한다.
    for (const endpoint of endpoints.slice(0, 2)) {
      for (const body of bodies.slice(0, 6)) {
        try {
          const html = await tryRequest("GET", endpoint, body);
          if (html) return { html, debug };
        } catch (error) {
          lastError = error;
          const item = { method: "GET", endpoint, error: error?.message || String(error), body: safeCommentBodyForLog(body) };
          debug.push(item);
          previewCommentLog(articleUrl, "error", item);
        }
      }
    }

    if (lastError) {
      lastError.commentDebug = debug;
      throw lastError;
    }
    return { html: "", debug };
  }

  async function loadPreview(url, { force = false } = {}){
    const cached = cache.get(url);
    if (!force && cached && Date.now() - cached.time < CACHE_TTL) return cached.data;

    if (activeAbort) activeAbort.abort();
    activeAbort = new AbortController();

    const mobileUrl = toMobileUrl(url);
    const cacheMode = force ? "reload" : "default";
    let data = null;
    let desktopCandidate = null;
    let mobileError = null;

    if (mobileUrl) {
      try {
        const mobileResponse = await fetchText(mobileUrl, activeAbort.signal, cacheMode);
        const finalMobileUrl = mobileResponse.finalUrl || mobileUrl;
        const finalHost = (() => {
          try { return new URL(finalMobileUrl).hostname; }
          catch (_) { return ""; }
        })();

        if (finalHost && finalHost !== "m.dcinside.com") {
          desktopCandidate = parseDesktopFallback(mobileResponse.text, url, finalMobileUrl);
          data = desktopCandidate;
        } else {
          data = parseMobilePreview(mobileResponse.text, url, finalMobileUrl);
        }
      } catch (error) {
        mobileError = error;
      }
    }

    if (!data || isWeakPreviewData(data) || !data.writerHTML || !data.commentsHTML) {
      try {
        const desktopResponse = await fetchText(url, activeAbort.signal, cacheMode);
        const desktopData = parseDesktopFallback(desktopResponse.text, url, desktopResponse.finalUrl || url);
        data = data ? mergePreviewData(data, desktopData) : desktopData;
      } catch (desktopError) {
        if (!data) throw desktopError;
        if (mobileError) data.mobileError = mobileError.message || String(mobileError);
      }
    }

    try {
      const galleryType = previewGalleryTypeFromUrl(url);
      const expectedComments = expectedCommentCountFromData(data);
      const needsRenderedFrame = (galleryType === "mini" || galleryType === "person")
        && expectedComments > 0
        && actualCommentItemCountFromHtml(data?.commentsHTML || "") === 0;

      let endpointResult = null;

      if (needsRenderedFrame) {
        const frameResult = await fetchCommentsViaRenderedFrame(url, activeAbort.signal);
        if (frameResult?.debug?.length) data.commentDebug = [...(data.commentDebug || []), ...frameResult.debug];
        if (frameResult?.html) {
          data.commentsHTML = frameResult.html;
          const count = actualCommentItemCountFromHtml(frameResult.html);
          data.commentTitle = `댓글${count ? ` ${count}개` : ""}`;
        }
      }

      if (!data?.commentsHTML || actualCommentItemCountFromHtml(data.commentsHTML) === 0) {
        const commentSourceHtml = data?.desktopRawHtml || data?.rawHtml || "";
        const articleDoc = new DOMParser().parseFromString(commentSourceHtml, "text/html");
        endpointResult = await fetchCommentsFromEndpoint(url, articleDoc, activeAbort.signal, cacheMode);
        if (endpointResult?.debug) data.commentDebug = [...(data.commentDebug || []), ...endpointResult.debug];
        if (endpointResult?.html) {
          data.commentsHTML = endpointResult.html;
          const count = actualCommentItemCountFromHtml(endpointResult.html);
          data.commentTitle = `댓글${count ? ` ${count}개` : ""}`;
        }
      }
    } catch (commentError) {
      data.commentError = commentError?.message || String(commentError);
      if (commentError?.commentDebug) data.commentDebug = [...(data.commentDebug || []), ...commentError.commentDebug];
    }

    if (isWeakPreviewData(data) && !data.commentsHTML) {
      throw new Error("본문/댓글 영역을 정확히 찾지 못했습니다. 디시 페이지 구조가 바뀌었거나 접근이 제한된 글일 수 있습니다.");
    }

    if (isWeakPreviewData(data) && data.commentsHTML) {
      data.articleHTML = data.articleHTML || `<div class="dcbpv-empty">본문 영역을 표시할 수 없습니다.</div>`;
    }

    cache.set(url, { time: Date.now(), data });
    return data;
  }

  function settlePreviewMedia(root, baseUrl){
    const run = () => normalizeDcMedia(root, baseUrl);
    run();
    requestAnimationFrame(run);
    [80, 260, 760, 1500].forEach((delay) => setTimeout(run, delay));
  }

  const PREVIEW_FILTER_DEFAULTS = {
    userBlockEnabled: true,
    includeGray: true,
    hideDCGray: undefined,
    hideComment: false,
    hideImgComment: false,
    hideDccon: false,
    showUidBadge: false,
    showMemberIpInfo: true,
    hideAnonymousEnabled: false,
    doryBlockEnabled: true,
    keywordBlockEnabled: false,
    blockedKeywords: [],
    keywordBlockTargets: { listTitle: true, viewTitle: true, viewBody: true, comments: true },
    keywordHideEnabled: false,
    hiddenKeywords: [],
    keywordHideTargets: { listTitle: true, viewTitle: true, viewBody: true, comments: true }
  };

  function storageGet(area, defaults){
    return new Promise((resolve) => {
      try {
        chrome.storage[area].get(defaults, (value) => resolve(value || defaults));
      } catch (_) {
        resolve(defaults);
      }
    });
  }

  async function previewSettings(){
    const [sync, local] = await Promise.all([
      storageGet("sync", PREVIEW_FILTER_DEFAULTS),
      storageGet("local", { blockedUids: [] })
    ]);

    let storeTokens = [];
    try {
      if (globalThis.DCBUserBlockStore?.getAllTokens) {
        storeTokens = await globalThis.DCBUserBlockStore.getAllTokens();
      }
    } catch (_) {}

    const mergedBlocked = [
      ...(Array.isArray(sync.blockedUids) ? sync.blockedUids : []),
      ...(Array.isArray(local.blockedUids) ? local.blockedUids : []),
      ...(Array.isArray(storeTokens) ? storeTokens : [])
    ];

    return { ...PREVIEW_FILTER_DEFAULTS, ...sync, blockedUids: Array.from(new Set(mergedBlocked.map((v) => String(v || "").trim()).filter(Boolean))) };
  }

  function ensurePreviewFilterStyle(){
    const styleId = `${STYLE_ID}-filters`;
    let style = document.getElementById(styleId);
    if (!style) {
      style = document.createElement("style");
      style.id = styleId;
      (document.head || document.documentElement).appendChild(style);
    }
    style.textContent = `
      #${OVERLAY_ID} .dcbpv-filter-hidden{display:none!important}
      #${OVERLAY_ID} .dcbpv-filter-note{margin:10px 0;padding:10px 12px;border:1px dashed rgba(37,99,235,.35);border-radius:12px;background:rgba(37,99,235,.06);color:#475569;font-size:12px;font-weight:700;line-height:1.5}
      #${OVERLAY_ID} .dcbpv-filter-note.danger{border-color:rgba(239,68,68,.35);background:rgba(239,68,68,.06);color:#b91c1c}
      #${OVERLAY_ID} .dcbpv-filter-chip{display:inline-flex;max-width:220px;vertical-align:middle;margin-left:4px;padding:2px 7px;border-radius:999px;background:rgba(37,99,235,.1);border:1px solid rgba(37,99,235,.18);font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      #${OVERLAY_ID} .dcbpv-filter-reveal{margin-left:8px;border:1px solid #cbd5e1;border-radius:8px;background:#fff;color:#334155;font-size:12px;font-weight:800;padding:3px 8px;cursor:pointer}
      #${OVERLAY_ID} .dcbpv-writer-ref{display:inline-flex!important;align-items:center!important;gap:4px!important;max-width:100%;vertical-align:middle;white-space:normal}
      #${OVERLAY_ID} .dcbpv-writer-ref .writer_nikcon{width:12px;height:11px;display:inline-block;background:linear-gradient(135deg,#93c5fd,#2563eb);border-radius:3px;opacity:.85;flex:0 0 auto}
      #${OVERLAY_ID} .dcbpv-writer-ref .ip{color:#64748b;font-size:12px}
      #${OVERLAY_ID} .dcb-uid-badge,#${OVERLAY_ID} .dcbpv-uid-badge{display:inline-flex;align-items:center;flex:0 0 auto;font-size:11px;color:#64748b;background:rgba(100,116,139,.12);padding:1px 6px;border-radius:10px;line-height:1.2;white-space:nowrap}
      #${OVERLAY_ID} .dcbpv-article .dcb-dccon-content-hidden,#${OVERLAY_ID} .dcbpv-article .dcbpv-dccon-hidden{display:none!important}
    `;
  }

  function previewKeywords(list){
    const seen = new Set();
    return (Array.isArray(list) ? list : []).map((raw) => {
      const label = String(raw || "").normalize("NFKC").trim();
      const needle = label.toLowerCase().replace(/\s+/g, " ").trim();
      if (!label || !needle || seen.has(needle)) return null;
      seen.add(needle);
      return { label, needle };
    }).filter(Boolean);
  }

  function findPreviewKeyword(text, prepared){
    const haystack = String(text || "").normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();
    if (!haystack) return null;
    return prepared.find((keyword) => haystack.includes(keyword.needle)) || null;
  }

  function previewWriterFromNode(node){
    const writer = node?.matches?.(".gall_writer,.ub-writer") ? node : node?.querySelector?.(".gall_writer,.ub-writer");
    return {
      nick: writer?.getAttribute?.("data-nick") || node?.getAttribute?.("data-nick") || writer?.textContent?.replace(/\([^)]*\)/g, "").trim() || "",
      uid: previewUidToken(writer?.getAttribute?.("data-uid") || node?.getAttribute?.("data-uid") || writer?.querySelector?.(".dcb-uid-badge")?.dataset?.fullUid || ""),
      ip: previewIpPrefix(writer?.getAttribute?.("data-ip") || node?.getAttribute?.("data-ip") || writer?.querySelector?.(".ip")?.textContent || "")
    };
  }

  function previewBlockMatcher(tokens){
    const uids = new Set();
    const ips = new Set();
    (Array.isArray(tokens) ? tokens : []).forEach((raw) => {
      const clean = cleanPreviewToken(raw);
      if (!clean) return;
      const ip = previewIpPrefix(clean);
      if (ip && /^\d{1,3}(?:\.\d{1,3}){1,3}$/.test(clean)) {
        ips.add(ip);
        return;
      }
      const uid = previewUidToken(clean);
      if (uid) uids.add(uid.toLowerCase());
    });
    return { uids, ips, empty: !uids.size && !ips.size };
  }

  function previewWriterBlocked(meta, matcher){
    if (!meta || matcher.empty) return false;
    const uid = previewUidToken(meta.uid);
    const ip = previewIpPrefix(meta.ip);
    return !!(uid && matcher.uids.has(uid.toLowerCase())) || !!(ip && matcher.ips.has(ip));
  }

  function previewIsAnonymous(meta, node){
    if (!meta) return false;
    if (previewUidToken(meta.uid)) return false;
    const writer = node?.matches?.(".gall_writer,.ub-writer") ? node : node?.querySelector?.(".gall_writer,.ub-writer");
    if (writer?.querySelector?.(".writer_nikcon,[onclick*=gallog],[href*=gallog]")) return false;
    return !!previewIpPrefix(meta.ip);
  }

  function filterNote(kind, label, revealKey = ""){
    const isDanger = kind === "user" || kind === "keyword-block";
    const title = kind === "user" ? "차단한 사용자 콘텐츠" : kind === "anonymous" ? "비회원 콘텐츠 숨김" : kind === "dccon" ? "디시콘 댓글 숨김" : kind === "dory" ? "댓글돌이 댓글 숨김" : kind === "keyword-hide" ? "숨김 키워드가 포함된 콘텐츠" : "차단 키워드가 포함된 콘텐츠";
    const chip = label ? `<span class="dcbpv-filter-chip" title="${escapeText(label)}">${escapeText(label)}</span>` : "";
    const reveal = revealKey ? `<button type="button" class="dcbpv-filter-reveal" data-dcbpv-reveal="${escapeText(revealKey)}">이번만 보기</button>` : "";
    return `<div class="dcbpv-filter-note${isDanger ? " danger" : ""}"><span>${title}</span>${chip}${reveal}</div>`;
  }

  function replaceSectionWithNote(section, noteHtml){
    const body = section?.querySelector?.(".dcbpv-html");
    if (!body || body.dataset.dcbpvFiltered === "1") return;
    body.dataset.dcbpvOriginalHtml = body.innerHTML;
    body.dataset.dcbpvFiltered = "1";
    body.innerHTML = noteHtml;
  }

  function addUidBadges(root){
    root.querySelectorAll(".gall_writer,.ub-writer").forEach((writer) => {
      const meta = previewWriterFromNode(writer);
      if (!meta.uid || writer.querySelector(":scope .dcb-uid-badge,.dcbpv-uid-badge")) return;
      const badge = document.createElement("span");
      badge.className = "dcbpv-uid-badge dcb-uid-badge";
      badge.dataset.fullUid = meta.uid;
      badge.title = meta.uid;
      badge.textContent = `(${meta.uid})`;
      writer.appendChild(badge);
    });
  }

  function applyDcconFilter(overlay){
    overlay.querySelectorAll(".dcbpv-article .dcbpv-dccon,.dcbpv-article .written_dccon,.dcbpv-article .comment_dccon,.dcbpv-article img[src*='dccon.php'],.dcbpv-article video[src*='dccon']").forEach((node) => {
      node.classList.add("dcbpv-dccon-hidden", "dcb-dccon-content-hidden");
      node.setAttribute("data-dcb-dccon-hidden", "true");
    });

    overlay.querySelectorAll(".dcbpv-comment-item").forEach((row) => {
      if (!row.querySelector(".dcbpv-dccon,.written_dccon,.comment_dccon,img[src*='dccon.php'],video[src*='dccon']")) return;
      row.classList.add("dcbpv-filter-hidden");
      row.dataset.dcbpvBlockedReason = "dccon";
    });
  }

  function applyCommentUiFilter(overlay){
    overlay.querySelectorAll("a.reply_numbox,span.reply_num,button.btn_cmt_delete,.btn_cmt_delete,input.article_chkbox,.cmt_mdf_del,.btn_cmt_modify,.btn_reply").forEach((node) => {
      node.classList.add("dcbpv-filter-hidden");
    });
  }

  function applyImageCommentFilter(overlay){
    overlay.querySelectorAll(".img_comment,.img_comment.fold,.img_comment.getMoreComment,.btn_imgcmtopen").forEach((node) => {
      node.classList.add("dcbpv-filter-hidden");
    });
  }

  function commentText(row){
    return row.querySelector(".dcbpv-comment-body")?.innerText || row.textContent || "";
  }

  function summarizeHiddenComments(overlay){
    const list = overlay.querySelector(".dcbpv-comment-list");
    if (!list) return;
    list.querySelectorAll(".dcbpv-filter-summary").forEach((node) => node.remove());
    const hidden = list.querySelectorAll(":scope > .dcbpv-comment-item.dcbpv-filter-hidden").length;
    if (!hidden) return;
    const note = document.createElement("div");
    note.className = "dcbpv-filter-note dcbpv-filter-summary";
    note.textContent = `차단 설정에 따라 댓글 ${hidden}개를 숨겼습니다.`;
    list.prepend(note);
  }


  function refreshPreviewMemberIpBadges(root){
    try {
      globalThis.DCMemberIpView?.refresh?.(root || document);
    } catch (_) {}
    try {
      document.dispatchEvent(new CustomEvent("dc-member-ip-view:refresh", { detail: { root: root || document } }));
    } catch (_) {}
  }

  async function applyPreviewFeatureBridge(overlay, data){
    if (!overlay || !data) return;
    ensurePreviewFilterStyle();
    const conf = await previewSettings();
    if (!document.documentElement.contains(overlay)) return;

    const articleSection = overlay.querySelector(".dcbpv-article")?.closest(".dcbpv-section");
    const commentsSection = overlay.querySelector(".dcbpv-comments");
    const authorMeta = previewWriterFromNode(overlay.querySelector(".dcbpv-author-name .gall_writer,.dcbpv-writer .gall_writer"));
    const matcher = previewBlockMatcher(conf.blockedUids || []);

    if (conf.showUidBadge) addUidBadges(overlay);
    if (conf.showMemberIpInfo !== false) refreshPreviewMemberIpBadges(overlay);
    if (conf.hideComment) applyCommentUiFilter(overlay);
    if (conf.hideImgComment) applyImageCommentFilter(overlay);
    if (conf.hideDccon) applyDcconFilter(overlay);

    if (conf.userBlockEnabled !== false && previewWriterBlocked(authorMeta, matcher)) {
      replaceSectionWithNote(articleSection, filterNote("user", authorMeta.uid || authorMeta.ip || authorMeta.nick));
      replaceSectionWithNote(commentsSection, filterNote("user", authorMeta.uid || authorMeta.ip || authorMeta.nick));
    }

    if (conf.hideAnonymousEnabled && previewIsAnonymous(authorMeta, overlay.querySelector(".dcbpv-author-name .gall_writer,.dcbpv-writer .gall_writer"))) {
      replaceSectionWithNote(articleSection, filterNote("anonymous", authorMeta.ip || authorMeta.nick));
      replaceSectionWithNote(commentsSection, filterNote("anonymous", authorMeta.ip || authorMeta.nick));
    }

    const blockKeywords = previewKeywords(conf.blockedKeywords);
    const hideKeywords = previewKeywords(conf.hiddenKeywords);
    const blockTargets = conf.keywordBlockTargets || PREVIEW_FILTER_DEFAULTS.keywordBlockTargets;
    const hideTargets = conf.keywordHideTargets || PREVIEW_FILTER_DEFAULTS.keywordHideTargets;
    const titleText = data.title || "";
    const articleText = overlay.querySelector(".dcbpv-article")?.innerText || "";

    if (conf.keywordBlockEnabled) {
      const titleKw = blockTargets.viewTitle ? findPreviewKeyword(titleText, blockKeywords) : null;
      const bodyKw = blockTargets.viewBody ? findPreviewKeyword(articleText, blockKeywords) : null;
      if (titleKw || bodyKw) replaceSectionWithNote(articleSection, filterNote("keyword-block", (titleKw || bodyKw).label));
    }

    if (conf.keywordHideEnabled) {
      const titleKw = hideTargets.viewTitle ? findPreviewKeyword(titleText, hideKeywords) : null;
      const bodyKw = hideTargets.viewBody ? findPreviewKeyword(articleText, hideKeywords) : null;
      if (titleKw || bodyKw) replaceSectionWithNote(articleSection, filterNote("keyword-hide", (titleKw || bodyKw).label, "article"));
    }

    overlay.querySelectorAll(".dcbpv-comment-item").forEach((row, index) => {
      const meta = previewWriterFromNode(row);
      if (conf.doryBlockEnabled !== false && (row.classList.contains("dory") || normalizePreviewNick(meta.nick || row.dataset.nick) === "댓글돌이")) {
        row.classList.add("dcbpv-filter-hidden");
        row.dataset.dcbpvBlockedReason = "dory";
      }
      if (conf.userBlockEnabled !== false && previewWriterBlocked(meta, matcher)) {
        row.classList.add("dcbpv-filter-hidden");
        row.dataset.dcbpvBlockedReason = "user";
      }
      if (conf.hideAnonymousEnabled && previewIsAnonymous(meta, row)) {
        row.classList.add("dcbpv-filter-hidden");
        row.dataset.dcbpvBlockedReason = "anonymous";
      }
      const text = commentText(row);
      if (conf.keywordBlockEnabled && blockTargets.comments) {
        const kw = findPreviewKeyword(text, blockKeywords);
        if (kw) {
          row.classList.add("dcbpv-filter-hidden");
          row.dataset.dcbpvBlockedReason = "keyword";
          row.dataset.dcbpvBlockedLabel = kw.label;
        }
      }
      if (conf.keywordHideEnabled && hideTargets.comments) {
        const kw = findPreviewKeyword(text, hideKeywords);
        if (kw) {
          row.dataset.dcbpvSoftKey = `comment-${index}`;
          row.classList.add("dcbpv-filter-hidden");
          row.insertAdjacentHTML("afterend", filterNote("keyword-hide", kw.label, row.dataset.dcbpvSoftKey));
        }
      }
    });

    summarizeHiddenComments(overlay);
  }

  function renderPreview(data){
    currentPreviewData = data;
    installPreviewCss();
    closePreview();
    currentPreviewData = data;

    const commentDebugLines = Array.isArray(data.commentDebug)
      ? data.commentDebug.slice(-4).map(commentDebugSummaryItem).filter(Boolean)
      : [];
    const commentEmptyHtml = data.commentsHTML || `<div class="dcbpv-empty">댓글이 없거나 댓글 영역을 찾지 못했습니다.${data.commentError ? `<br><small>오류: ${escapeText(data.commentError)}</small>` : ""}${commentDebugLines.length ? `<br><small>콘솔에서 [DCB Preview Comment] 로그를 확인하세요.<br>${escapeText(commentDebugLines.join(" | "))}</small>` : ""}</div>`;

    const overlay = document.createElement("div");
    overlay.id = OVERLAY_ID;
    overlay.innerHTML = `
      <section class="dcbpv-panel" role="dialog" aria-modal="true" aria-label="디시 게시글 미리보기">
        <header class="dcbpv-header">
          <div style="min-width:0;flex:1">
            <div class="dcbpv-title"><a href="${escapeText(data.url)}" target="_blank" rel="noreferrer noopener">${escapeText(data.title)}</a></div>
            <div class="dcbpv-writer">${data.writerHTML || "작성자 정보 없음"}</div>
          </div>
          <div class="dcbpv-icons">
            <button class="dcbpv-icon" type="button" data-act="reload" title="새로 불러오기">↻</button>
            <button class="dcbpv-icon" type="button" data-act="close" title="닫기">×</button>
          </div>
        </header>
        <main class="dcbpv-scroll">
          <section class="dcbpv-section">
            <h3 class="dcbpv-section-title">본문</h3>
            <article class="dcbpv-html dcbpv-article">${data.articleHTML || `<div class="dcbpv-empty">본문을 표시할 수 없습니다.</div>`}</article>
          </section>
          <div class="dcbpv-vote">
            개추 : <span class="dcbpv-vote-up">${data.counts.up || "0"}</span>
            ${data.counts.upMember ? `<span class="dcbpv-vote-member">${data.counts.upMember}</span>` : ""}
            &nbsp; 비추 : <span class="dcbpv-vote-down">${data.counts.down || "0"}</span>
          </div>
          <section class="dcbpv-section dcbpv-comments">
            <h3 class="dcbpv-section-title">${escapeText(data.commentTitle || "댓글")}</h3>
            <article class="dcbpv-html dcbpv-comment-html">${commentEmptyHtml}</article>
          </section>
          <nav class="dcbpv-actions">
            <button class="dcbpv-btn primary" type="button" data-act="open">원문 보기</button>
            <button class="dcbpv-btn" type="button" data-act="share">공유</button>
            ${data.reportUrl ? `<button class="dcbpv-btn warn" type="button" data-act="report">신고</button>` : ""}
          </nav>
        </main>
      </section>`;

    overlay.addEventListener("click", (event) => {
      const revealButton = event.target.closest("[data-dcbpv-reveal]");
      if (revealButton) {
        const key = revealButton.dataset.dcbpvReveal;
        if (key === "article") {
          const body = overlay.querySelector(".dcbpv-article");
          if (body?.dataset.dcbpvOriginalHtml) body.innerHTML = body.dataset.dcbpvOriginalHtml;
          revealButton.closest(".dcbpv-filter-note")?.remove();
          settlePreviewMedia(overlay, data.fetchedUrl || data.url);
          return;
        }
        const row = overlay.querySelector(`.dcbpv-comment-item[data-dcbpv-soft-key="${CSS.escape ? CSS.escape(key) : key}"]`);
        row?.classList.remove("dcbpv-filter-hidden");
        revealButton.closest(".dcbpv-filter-note")?.remove();
        summarizeHiddenComments(overlay);
        return;
      }
      if (event.target === overlay) return closePreview();
      const act = event.target.closest("[data-act]")?.dataset.act;
      if (!act) return;
      if (act === "close") return closePreview();
      if (act === "open") return window.open(data.url, "_blank", "noopener");
      if (act === "report" && data.reportUrl) return window.open(data.reportUrl, "_blank", "noopener");
      if (act === "reload") return openPreview(data.url, { force: true });
      if (act === "share") return showShare(data);
    });

    document.documentElement.appendChild(overlay);
    settlePreviewMedia(overlay, data.fetchedUrl || data.url);
    applyPreviewFeatureBridge(overlay, data);
    emitPreviewState(true);
  }

  function showShare(data){
    if (document.getElementById(SHARE_ID)) return;
    const overlay = document.getElementById(OVERLAY_ID);
    if (!overlay) return;
    const box = document.createElement("div");
    box.id = SHARE_ID;
    box.className = "dcbpv-share-popup";
    box.innerHTML = `
      <button class="dcbpv-share-close" type="button" aria-label="닫기">×</button>
      <h3>공유하기</h3>
      <div class="dcbpv-share-row">
        <button type="button" data-share="x">X</button>
        <button type="button" data-share="facebook">Facebook</button>
      </div>
      <div class="dcbpv-copy">
        <input type="text" readonly value="${escapeText(data.url)}">
        <button type="button" data-share="copy">복사</button>
      </div>`;
    box.addEventListener("click", async (event) => {
      if (event.target.closest(".dcbpv-share-close")) return box.remove();
      const share = event.target.closest("[data-share]")?.dataset.share;
      if (!share) return;
      if (share === "x") window.open(`https://twitter.com/intent/tweet?url=${encodeURIComponent(data.url)}&text=${encodeURIComponent(data.title)}`, "_blank", "noopener");
      if (share === "facebook") window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(data.url)}`, "_blank", "noopener");
      if (share === "copy") {
        try { await navigator.clipboard.writeText(data.url); }
        catch (_) {
          const input = box.querySelector("input");
          input.select();
          document.execCommand("copy");
        }
        event.target.textContent = "복사됨";
        setTimeout(() => { event.target.textContent = "복사"; }, 1300);
      }
    });
    overlay.appendChild(box);
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (!currentPreviewData || area !== "sync" && area !== "local") return;
    const keys = new Set([
      "userBlockEnabled", "includeGray", "hideDCGray", "blockedUids", "hideComment", "hideImgComment", "hideDccon",
      "showUidBadge", "hideAnonymousEnabled", "doryBlockEnabled", "keywordBlockEnabled", "blockedKeywords", "keywordBlockTargets",
      "keywordHideEnabled", "hiddenKeywords", "keywordHideTargets"
    ]);
    if (!Object.keys(changes || {}).some((key) => keys.has(key))) return;
    const data = currentPreviewData;
    setTimeout(() => {
      if (currentPreviewData === data && document.getElementById(OVERLAY_ID)) renderPreview(data);
    }, 40);
  });

  async function openPreview(url, options = {}){
    if (!url) return;
    renderLoading();
    try {
      const data = await loadPreview(url, options);
      renderPreview(data);
    } catch (error) {
      if (error?.name === "AbortError") return;
      renderError(error?.message || "알 수 없는 오류", url);
    }
  }

  function previewUrlFromTarget(target){
    const cell = target.closest?.(".gall_tit");
    const link = target.closest?.("a[href*='board/view']") || cell?.querySelector?.("a[href*='board/view']");
    return link?.href || "";
  }

  document.addEventListener("contextmenu", (event) => {
    if (!previewEnabled) return;
    const url = previewUrlFromTarget(event.target);
    if (!url) return;
    event.preventDefault();
    event.stopPropagation();
    openPreview(url);
  }, true);

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && document.getElementById(OVERLAY_ID)) closePreview();
  });
})();


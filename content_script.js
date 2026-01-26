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

// 미리보기 창 상태 (window 객체에 추가하여 다른 스크립트에서도 접근 가능)
if (!window.isPreviewOpen) {
  window.isPreviewOpen = false;
}

// 미리보기 기능 활성화 상태
let previewEnabled = false;

/* ───── storage → 메모리 ───── */
function syncSettings(cb){
  chrome.storage.sync.get(
    {
      galleryBlockEnabled: undefined,  // 신규 키
      enabled            : true,       // 구버전 호환
      blockMode          : "redirect",
      blockedIds         : [],
      delay              : 5,
      previewEnabled     : false
    },
    ({ galleryBlockEnabled, enabled, blockMode:bm, blockedIds, delay, previewEnabled:pe })=>{
      const en = (typeof galleryBlockEnabled === "boolean") ? galleryBlockEnabled : !!enabled;
      gBlockEnabled = en;
      blockMode     = bm;
      blockedSet    = new Set([...BUILTIN_BLOCKID, ...blockedIds.map(x=>String(x).trim().toLowerCase())]);
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

/* ───── 뷰 페이지 프리뷰 (우클릭) ───── */
(function previewOverlay(){
  const STYLE_ID = "dcb-preview-style";
  const OVERLAY_ID = "dcb-preview-overlay";

  const createStyle = () => {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      #${OVERLAY_ID}{position:fixed;inset:0;z-index:2147483600;display:flex;align-items:center;justify-content:center;padding:20px;background:rgba(0,0,0,.6);backdrop-filter:blur(8px);animation:dcbpv-fade .2s ease-out;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif}
      #${OVERLAY_ID} .dcbpv-panel{width:min(680px,90vw);max-height:min(85vh,700px);background:#fff;box-shadow:0 20px 60px rgba(0,0,0,.25),0 0 0 1px rgba(0,0,0,.05);border-radius:16px;display:flex;flex-direction:column;overflow:hidden;animation:dcbpv-pop .25s cubic-bezier(0.34,1.56,0.64,1)}
      #${OVERLAY_ID} .dcbpv-header{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;padding:20px 24px;border-bottom:1px solid #f0f0f0;background:#fff}
      #${OVERLAY_ID} .dcbpv-meta{flex:1;min-width:0}
      #${OVERLAY_ID} .dcbpv-title{font-size:18px;font-weight:600;color:#1a1a1a;line-height:1.4;margin-bottom:10px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
      #${OVERLAY_ID} .dcbpv-sub{display:flex;flex-wrap:wrap;gap:6px;font-size:12px;color:#6b7280}
      #${OVERLAY_ID} .dcbpv-chip{display:inline-flex;align-items:center;gap:4px;color:#6b7280;font-size:12px;line-height:1.5}
      #${OVERLAY_ID} .dcbpv-chip::before{content:'';width:4px;height:4px;background:#d1d5db;border-radius:50%}
      #${OVERLAY_ID} .dcbpv-chip:first-child::before{display:none}
      #${OVERLAY_ID} .dcbpv-close{border:none;background:transparent;color:#9ca3af;font-size:20px;cursor:pointer;padding:4px;transition:.15s;display:flex;align-items:center;justify-content:center;width:32px;height:32px;border-radius:8px;flex-shrink:0}
      #${OVERLAY_ID} .dcbpv-close:hover{background:#f3f4f6;color:#374151}
      #${OVERLAY_ID} .dcbpv-body{flex:1;overflow-y:auto;background:#fff;padding:20px 24px}
      #${OVERLAY_ID} .dcbpv-body::-webkit-scrollbar{width:6px}
      #${OVERLAY_ID} .dcbpv-body::-webkit-scrollbar-track{background:transparent}
      #${OVERLAY_ID} .dcbpv-body::-webkit-scrollbar-thumb{background:#d1d5db;border-radius:3px}
      #${OVERLAY_ID} .dcbpv-body::-webkit-scrollbar-thumb:hover{background:#9ca3af}
      #${OVERLAY_ID} .dcbpv-content{font-size:14px;line-height:1.7;color:#374151;max-height:400px;overflow-y:auto;padding-right:8px}
      #${OVERLAY_ID} .dcbpv-content::-webkit-scrollbar{width:4px}
      #${OVERLAY_ID} .dcbpv-content::-webkit-scrollbar-track{background:transparent}
      #${OVERLAY_ID} .dcbpv-content::-webkit-scrollbar-thumb{background:#d1d5db;border-radius:2px}
      #${OVERLAY_ID} .dcbpv-content img{max-width:100%;border-radius:8px;margin:12px 0;box-shadow:0 2px 8px rgba(0,0,0,.1)}
      #${OVERLAY_ID} .dcbpv-content video{max-width:100%;border-radius:8px;margin:12px 0}
      #${OVERLAY_ID} .dcbpv-content pre{white-space:pre-wrap;background:#f9fafb;padding:12px;border-radius:8px;border:1px solid #e5e7eb;font-size:13px;color:#374151;overflow-x:auto;margin:8px 0}
      #${OVERLAY_ID} .dcbpv-content p{margin:8px 0}
      #${OVERLAY_ID} .dcbpv-imggrid{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 12px 0}
      #${OVERLAY_ID} .dcbpv-thumb{width:calc(50% - 4px);border-radius:10px;overflow:hidden;border:1px solid #e5e7eb;background:#f9fafb;text-decoration:none;color:inherit}
      #${OVERLAY_ID} .dcbpv-thumb img{width:100%;height:140px;object-fit:cover;display:block;margin:0;border-radius:0;box-shadow:none}
      #${OVERLAY_ID} .dcbpv-thumb.more{display:flex;align-items:center;justify-content:center;height:140px;font-size:13px;color:#6b7280;font-weight:600}
      @media (max-width: 520px){ #${OVERLAY_ID} .dcbpv-thumb{width:100%} }
      #${OVERLAY_ID} .dcbpv-attachments{margin-top:16px;padding-top:16px;border-top:1px solid #f0f0f0}
      #${OVERLAY_ID} .dcbpv-attachments-title{font-size:12px;font-weight:600;color:#6b7280;margin-bottom:8px;text-transform:uppercase;letter-spacing:0.5px}
      #${OVERLAY_ID} .dcbpv-attachment{display:inline-flex;align-items:center;gap:6px;padding:6px 10px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:6px;font-size:12px;color:#374151;text-decoration:none;transition:.15s;margin-right:6px;margin-bottom:6px}
      #${OVERLAY_ID} .dcbpv-attachment:hover{background:#f3f4f6;border-color:#d1d5db;color:#111827}
      #${OVERLAY_ID} .dcbpv-actions{display:flex;gap:8px;padding-top:16px;margin-top:16px;border-top:1px solid #f0f0f0}
      #${OVERLAY_ID} .dcbpv-btn{display:flex;align-items:center;justify-content:center;gap:6px;padding:8px 14px;border-radius:8px;border:1px solid #e5e7eb;background:#fff;color:#374151;font-weight:500;font-size:13px;cursor:pointer;transition:.15s;flex:1}
      #${OVERLAY_ID} .dcbpv-btn:hover{background:#f9fafb;border-color:#d1d5db;transform:translateY(-1px);box-shadow:0 2px 4px rgba(0,0,0,.05)}
      #${OVERLAY_ID} .dcbpv-btn:active{transform:translateY(0)}
      #${OVERLAY_ID} .dcbpv-btn-icon{font-size:16px;line-height:1}
      #${OVERLAY_ID} .dcbpv-btn-text{font-size:13px;color:inherit}
      #${OVERLAY_ID} .dcbpv-btn.primary{background:#3b82f6;border-color:#3b82f6;color:#fff}
      #${OVERLAY_ID} .dcbpv-btn.primary:hover{background:#2563eb;border-color:#2563eb}
      #${OVERLAY_ID} .dcbpv-btn.warn{background:#fee2e2;border-color:#fecaca;color:#dc2626}
      #${OVERLAY_ID} .dcbpv-btn.warn:hover{background:#fecaca;border-color:#fca5a5}
      #${OVERLAY_ID} .dcbpv-empty{padding:32px 16px;text-align:center;color:#9ca3af;font-size:14px}
      #${OVERLAY_ID} .dcbpv-share-popup{position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:24px;box-shadow:0 20px 60px rgba(0,0,0,.2);z-index:2147483650;min-width:320px;max-width:90vw}
      #${OVERLAY_ID} .dcbpv-share-popup h3{margin:0 0 16px 0;font-size:18px;color:#1a1a1a;font-weight:600}
      #${OVERLAY_ID} .dcbpv-share-popup .share-btns{display:flex;gap:8px;margin-bottom:16px}
      #${OVERLAY_ID} .dcbpv-share-popup .share-btn{flex:1;padding:10px;border:1px solid #e5e7eb;border-radius:8px;background:#f9fafb;color:#374151;text-align:center;cursor:pointer;transition:.15s;font-size:13px;font-weight:500}
      #${OVERLAY_ID} .dcbpv-share-popup .share-btn:hover{background:#f3f4f6;border-color:#d1d5db}
      #${OVERLAY_ID} .dcbpv-share-popup .url-copy{display:flex;gap:8px;align-items:center}
      #${OVERLAY_ID} .dcbpv-share-popup .url-copy input{flex:1;padding:10px 12px;border:1px solid #e5e7eb;border-radius:8px;background:#f9fafb;color:#374151;font-size:12px;outline:none}
      #${OVERLAY_ID} .dcbpv-share-popup .url-copy input:focus{border-color:#3b82f6;background:#fff}
      #${OVERLAY_ID} .dcbpv-share-popup .url-copy button{padding:10px 16px;border:1px solid #3b82f6;border-radius:8px;background:#3b82f6;color:#fff;cursor:pointer;font-weight:500;font-size:13px;transition:.15s}
      #${OVERLAY_ID} .dcbpv-share-popup .url-copy button:hover{background:#2563eb;border-color:#2563eb}
      #${OVERLAY_ID} .dcbpv-share-close{position:absolute;top:12px;right:12px;border:none;background:transparent;color:#9ca3af;font-size:20px;cursor:pointer;padding:4px;transition:.15s;display:flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:6px}
      #${OVERLAY_ID} .dcbpv-share-close:hover{color:#374151;background:#f3f4f6}
      @keyframes dcbpv-fade{from{opacity:0} to{opacity:1}}
      @keyframes dcbpv-pop{from{transform:translateY(10px) scale(.98);opacity:0} to{transform:translateY(0) scale(1);opacity:1}}
    `;
    document.head.appendChild(style);
  };

  function sanitizeContent(node){
    if (!node) return null;
    const cloned = node.cloneNode(true);

    // 실행/스타일/버튼류 제거 (원본 페이지 JS 의존도를 낮춤)
    cloned.querySelectorAll("script, style, button").forEach(el => el.remove());

    // lazy 이미지가 data-original/data-src에 실제 URL을 들고 있는 경우가 많아서 src로 강제 반영
    const imgs = Array.from(cloned.querySelectorAll("img"));
    const normalized = [];
    imgs.forEach(img => {
      const dataOriginal = img.getAttribute("data-original");
      const dataSrc = img.getAttribute("data-src");
      const dataLazy = img.getAttribute("data-lazy");
      const dataUrl = img.getAttribute("data-url");
      const srcAttr = img.getAttribute("src");
      const currentSrc = img.currentSrc || img.src;

      const realSrc = dataOriginal || dataSrc || dataLazy || dataUrl || currentSrc || srcAttr;
      if (realSrc) {
        // src가 비었거나 lazy 클래스가 있으면 실 URL로 강제 치환
        if (!srcAttr || img.classList.contains("lazy") || srcAttr === "about:blank") {
          img.setAttribute("src", realSrc);
        }
        img.classList.remove("lazy");
        img.setAttribute("loading", "eager");
        img.setAttribute("decoding", "async");
        normalized.push({ src: img.getAttribute("src") || realSrc, alt: img.getAttribute("alt") || "" });
      }
    });

    // 텍스트 요약 (최대 500자)
    const text = (cloned.innerText || cloned.textContent || "").replace(/\s+/g, " ").trim();
    const maxLength = 500;
    const summary = text.length > maxLength ? (text.slice(0, maxLength).trim() + "...") : text;

    // “요약 버전” 컨테이너: 썸네일(최대 4장) + 요약 텍스트
    const out = document.createElement("div");

    const MAX_THUMBS = 4;
    if (normalized.length) {
      const grid = document.createElement("div");
      grid.className = "dcbpv-imggrid";

      const toShow = normalized.slice(0, MAX_THUMBS);
      toShow.forEach(({ src, alt }) => {
        const a = document.createElement("a");
        a.className = "dcbpv-thumb";
        a.href = src;
        a.target = "_blank";
        a.rel = "noreferrer noopener";

        const im = document.createElement("img");
        im.src = src;
        im.alt = alt;
        im.loading = "eager";
        im.decoding = "async";
        a.appendChild(im);
        grid.appendChild(a);
      });

      if (normalized.length > MAX_THUMBS) {
        const more = document.createElement("div");
        more.className = "dcbpv-thumb more";
        more.textContent = `+${normalized.length - MAX_THUMBS} more`;
        grid.appendChild(more);
      }

      out.appendChild(grid);
    }

    if (summary) {
      const div = document.createElement("div");
      div.textContent = summary;
      out.appendChild(div);
    } else if (!normalized.length) {
      out.innerHTML = '<div class="dcbpv-empty">본문을 불러오지 못했습니다.</div>';
    }

    return out;
  }

  function openOverlay(){
    if (document.getElementById(OVERLAY_ID)) return;
    const wrap = document.querySelector(".view_content_wrap");
    if (!wrap) return;
    createStyle();

    const title = wrap.querySelector(".title_subject")?.textContent?.trim() || "";
    const head  = wrap.querySelector(".title_headtext")?.textContent?.trim() || "";
    const writer = wrap.querySelector(".gall_writer, .ub-writer");
    const nick = writer?.querySelector(".nickname em, .nickname")?.textContent?.trim() || "";
    const ip   = writer?.getAttribute("data-ip") || writer?.querySelector(".ip")?.textContent?.trim() || "";
    const uid  = writer?.getAttribute("data-uid") || "";
    const date = writer?.querySelector(".gall_date")?.textContent?.trim() || "";
    const views = wrap.querySelector(".gall_count")?.textContent?.trim() || "";

    const article = sanitizeContent(wrap.querySelector(".write_div"));
    const overlay = document.createElement("div");
    overlay.id = OVERLAY_ID;

    const rec = {
      up: wrap.querySelector(".up_num")?.textContent?.trim() || "0",
      down: wrap.querySelector(".down_num")?.textContent?.trim() || "0"
    };

    const recomBtns = {
      up: document.querySelector(".btn_recom_up"),
      down: document.querySelector(".btn_recom_down"),
      share: document.querySelector(".btn_snsmore"),
      report: document.querySelector(".btn_report")
    };

    const articleNo = wrap.querySelector(".btn_recom_up, .btn_recom_down")?.dataset?.no || "";
    const currentUrl = location.href;
    const urlObj = new URL(currentUrl);
    const gallId = urlObj.searchParams.get("id") || "";
    const reportUrl = articleNo && gallId ? `https://gall.dcinside.com/singo/?id=singo&singo_id=${gallId}&singo_no=${articleNo}&ko_name=${encodeURIComponent(document.title)}&s_url=${encodeURIComponent(currentUrl)}&gall_type=G` : "";

    function renderActions(){
      const actionsBox = overlay.querySelector("#dcbpv-actions");
      if (!actionsBox) return;
      actionsBox.innerHTML = `
        <button class="dcbpv-btn primary" data-act="open">
          <span class="dcbpv-btn-icon">🔗</span>
          <span class="dcbpv-btn-text">원문 보기</span>
        </button>
        <button class="dcbpv-btn" data-act="up">
          <span class="dcbpv-btn-icon">👍</span>
          <span class="dcbpv-btn-text">${rec.up}</span>
        </button>
        <button class="dcbpv-btn" data-act="down">
          <span class="dcbpv-btn-icon">👎</span>
          <span class="dcbpv-btn-text">${rec.down}</span>
        </button>
        <button class="dcbpv-btn" data-act="share">
          <span class="dcbpv-btn-icon">📤</span>
          <span class="dcbpv-btn-text">공유</span>
        </button>
        ${reportUrl ? `<button class="dcbpv-btn warn" data-act="report">
          <span class="dcbpv-btn-icon">🚨</span>
          <span class="dcbpv-btn-text">신고</span>
        </button>` : ''}
      `;
    }

    const handleAction = (act) => {
      if (act === "report" && reportUrl) {
        window.open(reportUrl, "_blank");
        return;
      }
      if (act === "share") {
        showSharePopup();
        return;
      }
      if (act === "open") {
        window.open(currentUrl, "_blank");
        return;
      }
      const btn = recomBtns[act];
      if (!btn) {
        console.warn("[DCB] 버튼을 찾을 수 없습니다:", act);
        return;
      }
      try {
        btn.click();
        setTimeout(() => {
          rec.up = wrap.querySelector(".up_num")?.textContent?.trim() || rec.up;
          rec.down = wrap.querySelector(".down_num")?.textContent?.trim() || rec.down;
          renderActions();
        }, 600);
      } catch (error) {
        console.error("[DCB] 버튼 클릭 오류:", error);
      }
    };

    function showSharePopup(){
      if (document.getElementById("dcbpv-share-popup")) return;
      const popup = document.createElement("div");
      popup.id = "dcbpv-share-popup";
      popup.className = "dcbpv-share-popup";
      popup.innerHTML = `
        <button class="dcbpv-share-close" aria-label="닫기">×</button>
        <h3>공유하기</h3>
        <div class="share-btns">
          <div class="share-btn" data-share="x">트위터</div>
          <div class="share-btn" data-share="facebook">페이스북</div>
        </div>
        <div style="margin-top:16px;padding-top:16px;border-top:1px solid #e5e7eb">
          <div class="url-copy">
            <input type="text" readonly value="${currentUrl}" id="dcbpv-url-input">
            <button id="dcbpv-copy-btn">복사</button>
          </div>
        </div>
      `;
      overlay.appendChild(popup);
      
      popup.querySelector(".dcbpv-share-close").onclick = () => popup.remove();
      popup.querySelector("#dcbpv-copy-btn").onclick = () => {
        const inp = popup.querySelector("#dcbpv-url-input");
        inp.select();
        document.execCommand("copy");
        const btn = popup.querySelector("#dcbpv-copy-btn");
        const orig = btn.textContent;
        btn.textContent = "복사됨";
        setTimeout(() => btn.textContent = orig, 1500);
      };
      
      popup.querySelectorAll(".share-btn[data-share]").forEach(btn => {
        btn.onclick = () => {
          const type = btn.dataset.share;
          if (type === "x") {
            window.open(`https://twitter.com/intent/tweet?url=${encodeURIComponent(currentUrl)}&text=${encodeURIComponent(title)}`, "_blank");
          } else if (type === "facebook") {
            window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(currentUrl)}`, "_blank");
          }
        };
      });
    }

    // 첨부파일 수집
    const fileBox = wrap.querySelector(".appending_file_box");
    const attachments = [];
    if (fileBox) {
      const fileLinks = fileBox.querySelectorAll(".appending_file a");
      fileLinks.forEach(link => {
        const fileName = link.textContent.trim();
        const fileUrl = link.href;
        if (fileName && fileUrl) attachments.push({ name: fileName, url: fileUrl });
      });
    }

    overlay.innerHTML = `
      <div class="dcbpv-panel">
        <div class="dcbpv-header">
          <div class="dcbpv-meta">
            <div class="dcbpv-title">${title || "제목 없음"}</div>
            <div class="dcbpv-sub">
              ${head ? `<span class="dcbpv-chip">${head}</span>` : ""}
              ${nick ? `<span class="dcbpv-chip">${nick}${ip ? ` (${ip})` : ""}</span>` : ""}
              ${date ? `<span class="dcbpv-chip">${date}</span>` : ""}
              ${views ? `<span class="dcbpv-chip">${views}</span>` : ""}
            </div>
          </div>
          <button class="dcbpv-close" aria-label="닫기">×</button>
        </div>
        <div class="dcbpv-body">
          <div class="dcbpv-content" id="dcbpv-article"></div>
          ${attachments.length > 0 ? `
            <div class="dcbpv-attachments">
              <div class="dcbpv-attachments-title">첨부파일</div>
              ${attachments.map(f => `<a href="${f.url}" target="_blank" class="dcbpv-attachment">📎 ${f.name}</a>`).join('')}
            </div>
          ` : ''}
          <div class="dcbpv-actions" id="dcbpv-actions"></div>
        </div>
      </div>
    `;

    document.documentElement.appendChild(overlay);

    renderActions();
    overlay.addEventListener("click", (e) => {
      const actBtn = e.target.closest(".dcbpv-btn[data-act]");
      if (actBtn) {
        handleAction(actBtn.dataset.act);
        return;
      }
      if (e.target.classList.contains("dcbpv-close") || e.target.closest(".dcbpv-close")) {
        overlay.remove();
      }
    });

    overlay.addEventListener("click", (e)=>{
      if (e.target.id === OVERLAY_ID) overlay.remove();
    });

    const artHost = overlay.querySelector("#dcbpv-article");
    if (article) artHost.appendChild(article);
    else artHost.innerHTML = '<div class="dcbpv-empty">본문을 불러오지 못했습니다.</div>';
  }

  function shouldOpen(target){
    // 게시글 목록(.gall_tit)만 지원 (뷰 페이지 우클릭 미리보기 제거)
    return !!(target.closest && target.closest(".gall_tit"));
  }

  document.addEventListener("contextmenu", (e) => {
    if (!shouldOpen(e.target)) return;
    
    // 미리보기 기능이 활성화되지 않았으면 기본 컨텍스트 메뉴 사용
    if (!previewEnabled) return;
    
    e.preventDefault();
    
    // 목록에서 우클릭 시: 해당 게시글 정보를 불러와 현재 창에서 오버레이
    const listItem = e.target.closest(".gall_tit");
    if (listItem) {
      const link = listItem.querySelector("a[href*='/board/view/']");
      if (link && link.href) {
        // 새 탭에서 컨텐츠를 가져와 현재 창 오버레이에 표시
        fetchAndShowPreview(link.href);
      }
      return;
    }
  }, true);
  
  // 외부 URL의 게시글을 가져와 미리보기
  async function fetchAndShowPreview(url){
    if (document.getElementById(OVERLAY_ID)) return;
    
    // 로딩 오버레이 표시
    const loadingOverlay = document.createElement("div");
    loadingOverlay.id = OVERLAY_ID;
    loadingOverlay.innerHTML = `
      <div class="dcbpv-panel" style="justify-content:center;align-items:center;min-height:200px;">
        <div style="text-align:center;color:#6b7280;">
          <div style="font-size:32px;margin-bottom:12px;">⏳</div>
          <div style="font-size:14px;font-weight:500;">불러오는 중...</div>
        </div>
      </div>
    `;
    createStyle();
    document.documentElement.appendChild(loadingOverlay);
    window.isPreviewOpen = true;
    
    try {
      const response = await fetch(url);
      const html = await response.text();
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, "text/html");
      
      // 임시로 DOM에 마운트해서 데이터 추출
      const tempWrap = doc.querySelector(".view_content_wrap");
      if (!tempWrap) {
        throw new Error("게시글을 찾을 수 없습니다.");
      }
      
      // 기존 로딩 제거 후 실제 컨텐츠 표시
      loadingOverlay.remove();
      window.isPreviewOpen = false;
      showPreviewFromDOM(tempWrap, doc, url);
    } catch (err) {
      loadingOverlay.innerHTML = `
        <div class="dcbpv-panel" style="justify-content:center;align-items:center;min-height:200px;">
          <div style="text-align:center;color:#6b7280;">
            <div style="font-size:32px;margin-bottom:12px;">❌</div>
            <div style="font-size:14px;font-weight:500;margin-bottom:8px;">게시글을 불러올 수 없습니다</div>
            <div style="font-size:12px;color:#9ca3af;margin-bottom:16px;">${err.message}</div>
            <button style="padding:8px 16px;border:1px solid #e5e7eb;border-radius:8px;background:#fff;color:#374151;cursor:pointer;font-size:13px;font-weight:500;transition:.15s;" onmouseover="this.style.background='#f9fafb'" onmouseout="this.style.background='#fff'" onclick="this.closest('#${OVERLAY_ID}').remove()">닫기</button>
          </div>
        </div>
      `;
    }
  }
  
  // DOM에서 추출한 데이터로 미리보기 표시
  function showPreviewFromDOM(wrap, doc, sourceUrl){
    const overlay = document.createElement("div");
    overlay.id = OVERLAY_ID;
    
    const title = wrap.querySelector(".title_subject")?.textContent?.trim() || "";
    const head  = wrap.querySelector(".title_headtext")?.textContent?.trim() || "";
    const writer = wrap.querySelector(".gall_writer, .ub-writer");
    const nick = writer?.querySelector(".nickname em, .nickname")?.textContent?.trim() || "";
    const ip   = writer?.getAttribute("data-ip") || writer?.querySelector(".ip")?.textContent?.trim() || "";
    const date = writer?.querySelector(".gall_date")?.textContent?.trim() || "";
    const views = wrap.querySelector(".gall_count")?.textContent?.trim() || "";
    
    const article = sanitizeContent(wrap.querySelector(".write_div"));
    
    const rec = {
      up: wrap.querySelector(".up_num")?.textContent?.trim() || "0",
      down: wrap.querySelector(".down_num")?.textContent?.trim() || "0"
    };
    
    // 첨부파일 수집
    const fileBox = wrap.querySelector(".appending_file_box");
    const attachments = [];
    if (fileBox) {
      const fileLinks = fileBox.querySelectorAll(".appending_file a");
      fileLinks.forEach(link => {
        const fileName = link.textContent.trim();
        const fileUrl = link.href;
        if (fileName && fileUrl) attachments.push({ name: fileName, url: fileUrl });
      });
    }
    
    const urlObj = new URL(sourceUrl);
    const gallId = urlObj.searchParams.get("id") || "";
    const articleNo = sourceUrl.match(/no=(\d+)/)?.[1] || "";
    const reportUrl = articleNo && gallId ? `https://gall.dcinside.com/singo/?id=singo&singo_id=${gallId}&singo_no=${articleNo}&ko_name=${encodeURIComponent(title)}&s_url=${encodeURIComponent(sourceUrl)}&gall_type=G` : "";
    
    function renderActions(){
      const actionsBox = overlay.querySelector("#dcbpv-actions");
      if (!actionsBox) return;
      actionsBox.innerHTML = `
        <button class="dcbpv-btn primary" data-act="open">
          <span class="dcbpv-btn-icon">🔗</span>
          <span class="dcbpv-btn-text">원문 보기</span>
        </button>
        <button class="dcbpv-btn" data-act="up-preview">
          <span class="dcbpv-btn-icon">👍</span>
          <span class="dcbpv-btn-text">${rec.up}</span>
        </button>
        <button class="dcbpv-btn" data-act="down-preview">
          <span class="dcbpv-btn-icon">👎</span>
          <span class="dcbpv-btn-text">${rec.down}</span>
        </button>
        <button class="dcbpv-btn" data-act="share-preview">
          <span class="dcbpv-btn-icon">📤</span>
          <span class="dcbpv-btn-text">공유</span>
        </button>
        ${reportUrl ? `<button class="dcbpv-btn warn" data-act="report-preview">
          <span class="dcbpv-btn-icon">🚨</span>
          <span class="dcbpv-btn-text">신고</span>
        </button>` : ''}
      `;
    }
    
    overlay.innerHTML = `
      <div class="dcbpv-panel">
        <div class="dcbpv-header">
          <div class="dcbpv-meta">
            <div class="dcbpv-title">${title || "제목 없음"}</div>
            <div class="dcbpv-sub">
              ${head ? `<span class="dcbpv-chip">${head}</span>` : ""}
              ${nick ? `<span class="dcbpv-chip">${nick}${ip ? ` (${ip})` : ""}</span>` : ""}
              ${date ? `<span class="dcbpv-chip">${date}</span>` : ""}
              ${views ? `<span class="dcbpv-chip">${views}</span>` : ""}
            </div>
          </div>
          <button class="dcbpv-close" aria-label="닫기">×</button>
        </div>
        <div class="dcbpv-body">
          <div class="dcbpv-content" id="dcbpv-article"></div>
          ${attachments.length > 0 ? `
            <div class="dcbpv-attachments">
              <div class="dcbpv-attachments-title">첨부파일</div>
              ${attachments.map(f => `<a href="${f.url}" target="_blank" class="dcbpv-attachment">📎 ${f.name}</a>`).join('')}
            </div>
          ` : ''}
          <div class="dcbpv-actions" id="dcbpv-actions"></div>
        </div>
      </div>
    `;
    
    document.documentElement.appendChild(overlay);
    window.isPreviewOpen = true;
    
    renderActions();
    
    overlay.querySelector(".dcbpv-close").onclick = () => {
      overlay.remove();
      window.isPreviewOpen = false;
    };
    overlay.addEventListener("click", (e)=>{
      if (e.target.id === OVERLAY_ID) {
        overlay.remove();
        window.isPreviewOpen = false;
      }
      if (e.target.classList.contains("dcbpv-close") || e.target.closest(".dcbpv-close")) {
        overlay.remove();
        window.isPreviewOpen = false;
      }
    });
    
    // 본문 표시
    const artHost = overlay.querySelector("#dcbpv-article");
    if (article) artHost.appendChild(article);
    else artHost.innerHTML = '<div class="dcbpv-empty">본문을 불러오지 못했습니다.</div>';
    
    // 버튼 클릭 이벤트
    const actionsBox = overlay.querySelector("#dcbpv-actions");
    if (actionsBox) {
      actionsBox.addEventListener("click", (e) => {
        const btn = e.target.closest("[data-act]");
        if (!btn) return;
        const act = btn.dataset.act;
        
        if (act === "open") {
          window.open(sourceUrl, "_blank");
        } else if (act === "up-preview") {
          handleRecommendPreview(sourceUrl, "up", btn);
        } else if (act === "down-preview") {
          handleRecommendPreview(sourceUrl, "down", btn);
        } else if (act === "share-preview") {
          showSharePopupForPreview(sourceUrl, title);
        } else if (act === "report-preview" && reportUrl) {
          window.open(reportUrl, "_blank");
        }
      });
    }
  }
  
  async function handleRecommendPreview(url, type, btn) {
    try {
      // URL에서 갤러리 ID와 게시글 번호 추출
      const urlObj = new URL(url);
      const gallId = urlObj.searchParams.get("id") || "";
      const articleNo = url.match(/no=(\d+)/)?.[1] || "";
      
      if (!gallId || !articleNo) {
        console.error("[DCB] 갤러리 ID 또는 게시글 번호를 찾을 수 없습니다.");
        alert("❌ 게시글 정보를 찾을 수 없습니다.");
        return;
      }
      
      console.log("[DCB] 추천/비추천 요청:", { gallId, articleNo, type });
      
      const isUp = type === "up";
      const mode = isUp ? "U" : "D";
      
      // Background service worker에 API 호출 위임
      const result = await chrome.runtime.sendMessage({
        type: "DCB_RECOMMEND_VOTE",
        gallId,
        articleNo,
        mode
      });
      
      console.log("[DCB] API 응답:", result);
      
      if (result.success) {
        // 원본 페이지에서 최신 수치 가져오기
        try {
          const pageResponse = await fetch(url);
          const pageHtml = await pageResponse.text();
          const parser = new DOMParser();
          const doc = parser.parseFromString(pageHtml, "text/html");
          
          const countSelector = isUp ? ".up_num" : ".down_num";
          const countEl = doc.querySelector(countSelector);
          let newCount = "0";
          
          if (countEl) {
            newCount = countEl.textContent.trim();
          }
          
          // 버튼 UI 업데이트
          const btnIcon = isUp ? "👍" : "👎";
          btn.innerHTML = `<span class="dcbpv-btn-icon">${btnIcon}</span><span class="dcbpv-btn-text">${newCount}</span>`;
        } catch (e) {
          console.log("[DCB] 최신 수치 가져오기 실패");
          const btnIcon = isUp ? "👍" : "👎";
          btn.innerHTML = `<span class="dcbpv-btn-icon">${btnIcon}</span><span class="dcbpv-btn-text">+1</span>`;
        }
        
        alert(isUp ? "✅ 추천이 완료되었습니다!" : "✅ 비추천이 완료되었습니다!");
        
      } else {
        const errorMsg = result.error || "알 수 없는 오류";
        console.error("[DCB] 추천/비추천 실패:", result);
        
        if (result.code === "ALREADY_VOTED") {
          alert("⚠️ 이미 투표하셨습니다.");
        } else if (result.code === "INVALID_ACCESS") {
          alert("❌ 잘못된 접근입니다.\n원본 페이지에서 직접 추천해주세요.");
        } else {
          alert("❌ 추천/비추천 처리에 실패했습니다.\n" + errorMsg);
        }
      }
      
    } catch (error) {
      console.error("[DCB] 추천/비추천 요청 오류:", error);
      alert("❌ 요청 중 오류가 발생했습니다:\n" + error.message);
    }
  }
  
  function showSharePopupForPreview(url, title){
    if (document.getElementById("dcbpv-share-popup")) return;
    const popup = document.createElement("div");
    popup.id = "dcbpv-share-popup";
    popup.className = "dcbpv-share-popup";
    popup.innerHTML = `
      <button class="dcbpv-share-close" aria-label="닫기">×</button>
      <h3>공유하기</h3>
      <div class="share-btns">
        <div class="share-btn" data-share="x">트위터</div>
        <div class="share-btn" data-share="facebook">페이스북</div>
      </div>
      <div style="margin-top:16px;padding-top:16px;border-top:1px solid #e5e7eb">
        <div class="url-copy">
          <input type="text" readonly value="${url}" id="dcbpv-url-input-preview">
          <button id="dcbpv-copy-btn-preview">복사</button>
        </div>
      </div>
    `;
    const overlay = document.getElementById(OVERLAY_ID);
    if (overlay) overlay.appendChild(popup);
    
    popup.querySelector(".dcbpv-share-close").onclick = () => popup.remove();
    popup.querySelector("#dcbpv-copy-btn-preview").onclick = () => {
      const inp = popup.querySelector("#dcbpv-url-input-preview");
      inp.select();
      document.execCommand("copy");
      const btn = popup.querySelector("#dcbpv-copy-btn-preview");
      const orig = btn.textContent;
      btn.textContent = "복사됨";
      setTimeout(() => btn.textContent = orig, 1500);
    };
    
    popup.querySelectorAll(".share-btn[data-share]").forEach(btn => {
      btn.onclick = () => {
        const type = btn.dataset.share;
        if (type === "x") {
          window.open(`https://twitter.com/intent/tweet?url=${encodeURIComponent(url)}&text=${encodeURIComponent(title)}`, "_blank");
        } else if (type === "facebook") {
          window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`, "_blank");
        }
      };
    });
  }
})();

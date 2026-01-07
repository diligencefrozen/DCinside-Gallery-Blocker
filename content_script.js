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
      #${OVERLAY_ID}{position:fixed;inset:0;z-index:2147483600;display:flex;align-items:center;justify-content:center;padding:32px;background:rgba(0,0,0,.75);backdrop-filter:blur(12px);animation:dcbpv-fade .18s ease-out}
      #${OVERLAY_ID} .dcbpv-panel{width:min(1600px,96vw);height:min(92vh,950px);background:#0f141c;border:1px solid rgba(255,255,255,.05);box-shadow:0 20px 80px rgba(0,0,0,.45);border-radius:18px;display:flex;flex-direction:column;overflow:hidden;animation:dcbpv-pop .22s ease-out}
      #${OVERLAY_ID} .dcbpv-header{display:flex;align-items:flex-start;gap:16px;padding:18px 20px;border-bottom:1px solid rgba(255,255,255,.06);background:linear-gradient(120deg, rgba(79,124,255,.08), transparent)}
      #${OVERLAY_ID} .dcbpv-meta{flex:1;min-width:0}
      #${OVERLAY_ID} .dcbpv-title{font-size:22px;font-weight:700;color:#e6edf3;line-height:1.35;margin-bottom:6px}
      #${OVERLAY_ID} .dcbpv-sub{display:flex;flex-wrap:wrap;gap:10px;font-size:13px;color:#9fb1c7;opacity:.9}
      #${OVERLAY_ID} .dcbpv-chip{padding:4px 8px;border-radius:999px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.04);display:inline-flex;align-items:center;gap:6px}
      #${OVERLAY_ID} .dcbpv-close{border:none;background:transparent;color:#9fb1c7;font-size:18px;cursor:pointer;padding:6px 10px;border-radius:10px;transition:.15s}
      #${OVERLAY_ID} .dcbpv-close:hover{background:rgba(255,255,255,.08);color:#fff}
      #${OVERLAY_ID} .dcbpv-body{flex:1;display:flex;flex-direction:column;background:rgba(255,255,255,.04);overflow:hidden}
      #${OVERLAY_ID} .dcbpv-col{background:#0b0f15;overflow-y:auto;padding:18px;flex:1}
      #${OVERLAY_ID} .dcbpv-article{display:flex;flex-direction:column;gap:14px}
      #${OVERLAY_ID} .dcbpv-content{font-size:15px;line-height:1.66;color:#d7e1ee}
      #${OVERLAY_ID} .dcbpv-content img, #${OVERLAY_ID} .dcbpv-content video{max-width:100%;border-radius:12px;box-shadow:0 10px 30px rgba(0,0,0,.35);margin:10px 0}
      #${OVERLAY_ID} .dcbpv-content pre{white-space:pre-wrap;background:#121926;padding:12px;border-radius:10px;border:1px solid rgba(255,255,255,.05)}
      #${OVERLAY_ID} .dcbpv-actions{display:flex;flex-wrap:wrap;gap:10px;padding:12px;border:1px solid rgba(255,255,255,.06);border-radius:12px;background:rgba(255,255,255,.03)}
      #${OVERLAY_ID} .dcbpv-btn{display:inline-flex;align-items:center;gap:8px;padding:10px 14px;border-radius:12px;border:1px solid rgba(255,255,255,.08);background:rgba(255,255,255,.04);color:#e6edf3;font-weight:600;font-size:14px;cursor:pointer;transition:.16s}
      #${OVERLAY_ID} .dcbpv-btn:hover{transform:translateY(-1px);background:rgba(79,124,255,.12);border-color:rgba(79,124,255,.4)}
      #${OVERLAY_ID} .dcbpv-btn.warn{background:rgba(231,76,60,.12);border-color:rgba(231,76,60,.4)}
      #${OVERLAY_ID} .dcbpv-btn.secondary{background:rgba(255,255,255,.02)}
      #${OVERLAY_ID} .dcbpv-comments{display:flex;flex-direction:column;gap:12px;height:100%}
      #${OVERLAY_ID} .dcbpv-comments h4{margin:0;font-size:15px;color:#e6edf3;font-weight:700}
      #${OVERLAY_ID} .dcbpv-commentlist{flex:1;overflow:auto;display:flex;flex-direction:column;gap:10px;padding-right:4px}
      #${OVERLAY_ID} .dcbpv-comment{padding:10px 12px;border-radius:10px;border:1px solid rgba(255,255,255,.05);background:rgba(255,255,255,.02);color:#d7e1ee;font-size:14px;line-height:1.5}
      #${OVERLAY_ID} .dcbpv-reply{padding-left:28px;background:rgba(255,255,255,.04);border-left:3px solid rgba(79,124,255,.3)}
      #${OVERLAY_ID} .dcbpv-comment .meta{display:flex;gap:8px;flex-wrap:wrap;font-size:12px;color:#9fb1c7;margin-bottom:4px}
      #${OVERLAY_ID} .dcbpv-empty{padding:14px;border:1px dashed rgba(255,255,255,.08);border-radius:12px;color:#9fb1c7;text-align:center}
      #${OVERLAY_ID} .dcbpv-share-popup{position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:#1a1f28;border:1px solid rgba(255,255,255,.1);border-radius:14px;padding:20px;box-shadow:0 20px 60px rgba(0,0,0,.6);z-index:2147483650;min-width:320px}
      #${OVERLAY_ID} .dcbpv-share-popup h3{margin:0 0 16px 0;font-size:18px;color:#e6edf3;font-weight:700}
      #${OVERLAY_ID} .dcbpv-share-popup .share-btns{display:flex;gap:10px;margin-bottom:14px}
      #${OVERLAY_ID} .dcbpv-share-popup .share-btn{flex:1;padding:12px;border:1px solid rgba(255,255,255,.08);border-radius:10px;background:rgba(255,255,255,.04);color:#e6edf3;text-align:center;cursor:pointer;transition:.15s;font-size:14px}
      #${OVERLAY_ID} .dcbpv-share-popup .share-btn:hover{background:rgba(79,124,255,.12);border-color:rgba(79,124,255,.4)}
      #${OVERLAY_ID} .dcbpv-share-popup .url-copy{display:flex;gap:8px;align-items:center}
      #${OVERLAY_ID} .dcbpv-share-popup .url-copy input{flex:1;padding:10px;border:1px solid rgba(255,255,255,.08);border-radius:8px;background:#0b0f15;color:#e6edf3;font-size:13px}
      #${OVERLAY_ID} .dcbpv-share-popup .url-copy button{padding:10px 16px;border:1px solid rgba(79,124,255,.4);border-radius:8px;background:rgba(79,124,255,.12);color:#e6edf3;cursor:pointer;font-weight:600;font-size:14px}
      #${OVERLAY_ID} .dcbpv-share-popup .url-copy button:hover{background:rgba(79,124,255,.2)}
      #${OVERLAY_ID} .dcbpv-share-close{position:absolute;top:12px;right:12px;border:none;background:transparent;color:#9fb1c7;font-size:20px;cursor:pointer;padding:4px 8px}
      @keyframes dcbpv-fade{from{opacity:0} to{opacity:1}}
      @keyframes dcbpv-pop{from{transform:translateY(12px) scale(.98);opacity:0} to{transform:translateY(0) scale(1);opacity:1}}
    `;
    document.head.appendChild(style);
  };

  function sanitizeClone(node){
    if (!node) return null;
    const cloned = node.cloneNode(true);
    cloned.querySelectorAll("script, style").forEach(el => el.remove());
    return cloned;
  }

  function collectComments(){
    const wrap = document.querySelector(".comment_wrap[id^='comment_wrap_']");
    if (!wrap) return null;
    const cmtList = wrap.querySelector(".cmt_list");
    if (!cmtList) return null;
    
    const list = [];
    // 일반 댓글
    const topLevelComments = cmtList.querySelectorAll(":scope > li.ub-content:not(.dory)");
    topLevelComments.forEach(li => {
      const info = li.querySelector(".cmt_info");
      if (info) {
        const nickEl = info.querySelector(".nickname em");
        const nick = nickEl ? nickEl.textContent.trim() : (info.querySelector(".nickname")?.textContent?.trim() || "");
        const ip   = info.querySelector(".ip")?.textContent?.trim() || "";
        const date = info.querySelector(".date_time")?.textContent?.trim() || "";
        const txt  = info.querySelector(".usertxt");
        const body = txt ? txt.textContent.trim() : "";
        if (nick || body) list.push({ meta: nick, ip, date, body, isReply: false });
      }
      
      // 답글
      const replies = li.querySelectorAll(".reply_list > li.ub-content");
      replies.forEach(reply => {
        const rInfo = reply.querySelector(".reply_info");
        if (rInfo) {
          const rNickEl = rInfo.querySelector(".nickname em");
          const rNick = rNickEl ? rNickEl.textContent.trim() : (rInfo.querySelector(".nickname")?.textContent?.trim() || "");
          const rIp   = rInfo.querySelector(".ip")?.textContent?.trim() || "";
          const rDate = rInfo.querySelector(".date_time")?.textContent?.trim() || "";
          const rTxt  = rInfo.querySelector(".usertxt");
          const rBody = rTxt ? rTxt.textContent.trim() : "";
          if (rNick || rBody) list.push({ meta: rNick, ip: rIp, date: rDate, body: rBody, isReply: true });
        }
      });
    });
    
    if (!list.length) return null;
    return list;
  }

  function renderComments(container){
    const comments = collectComments();
    if (!comments){
      container.innerHTML = '<div class="dcbpv-empty">댓글이 없습니다.</div>';
      return;
    }
    container.innerHTML = "";
    comments.forEach(c => {
      const el = document.createElement("div");
      el.className = c.isReply ? "dcbpv-comment dcbpv-reply" : "dcbpv-comment";
      el.innerHTML = `
        <div class="meta">
          <span>${c.meta || "익명"}</span>
          ${c.ip ? `<span>${c.ip}</span>` : ""}
          ${c.date ? `<span>${c.date}</span>` : ""}
        </div>
        <div>${c.body || ""}</div>
      `;
      container.appendChild(el);
    });
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

    const article = sanitizeClone(wrap.querySelector(".write_div"));
    const overlay = document.createElement("div");
    overlay.id = OVERLAY_ID;

    const rec = {
      up: wrap.querySelector(".up_num")?.textContent?.trim() || "0",
      upFix: wrap.querySelector(".sup_num .font_blue")?.textContent?.trim() || "0",
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

    const refreshCounts = () => {
      rec.up = wrap.querySelector(".up_num")?.textContent?.trim() || rec.up;
      rec.upFix = wrap.querySelector(".sup_num .font_blue")?.textContent?.trim() || rec.upFix;
      rec.down = wrap.querySelector(".down_num")?.textContent?.trim() || rec.down;
      renderCounts();
    };

    let countsBox;
    function renderCounts(){
      if (!countsBox) return;
      countsBox.innerHTML = `
        <button class="dcbpv-btn" data-act="up">👍 추천 ${rec.up}</button>
        <button class="dcbpv-btn" data-act="down">👎 비추천 ${rec.down}</button>
        <button class="dcbpv-btn secondary" data-act="share">🔗 공유</button>
        <button class="dcbpv-btn warn" data-act="report">🚨 신고</button>
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
      const btn = recomBtns[act];
      if (!btn) return;
      btn.click();
      setTimeout(refreshCounts, 600);
    };

    function showSharePopup(){
      if (document.getElementById("dcbpv-share-popup")) return;
      const popup = document.createElement("div");
      popup.id = "dcbpv-share-popup";
      popup.className = "dcbpv-share-popup";
      popup.innerHTML = `
        <button class="dcbpv-share-close">✕</button>
        <h3>공유하기</h3>
        <div class="share-btns">
          <div class="share-btn" data-share="kakao">카카오톡</div>
          <div class="share-btn" data-share="x">X</div>
          <div class="share-btn" data-share="facebook">페이스북</div>
        </div>
        <div class="url-copy">
          <input type="text" readonly value="${currentUrl}" id="dcbpv-url-input">
          <button id="dcbpv-copy-btn">URL 복사</button>
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
        btn.textContent = "✓ 복사됨";
        setTimeout(() => btn.textContent = orig, 1500);
      };
      
      popup.querySelectorAll(".share-btn[data-share]").forEach(btn => {
        btn.onclick = () => {
          const type = btn.dataset.share;
          if (type === "kakao") {
            alert("카카오톡 공유는 원본 페이지에서 이용하세요.");
          } else if (type === "x") {
            window.open(`https://twitter.com/intent/tweet?url=${encodeURIComponent(currentUrl)}&text=${encodeURIComponent(title)}`, "_blank", "width=600,height=400");
          } else if (type === "facebook") {
            window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(currentUrl)}`, "_blank", "width=600,height=400");
          }
        };
      });
    }

    overlay.innerHTML = `
      <div class="dcbpv-panel">
        <div class="dcbpv-header">
          <div class="dcbpv-meta">
            <div class="dcbpv-title">${title || "제목 없음"}</div>
            <div class="dcbpv-sub">
              ${head ? `<span class="dcbpv-chip">${head}</span>` : ""}
              ${nick ? `<span class="dcbpv-chip">작성자 ${nick}${uid ? ` (${uid})` : ""}</span>` : ""}
              ${ip ? `<span class="dcbpv-chip">IP ${ip}</span>` : ""}
              ${date ? `<span class="dcbpv-chip">${date}</span>` : ""}
              ${views ? `<span class="dcbpv-chip">${views}</span>` : ""}
            </div>
          </div>
          <button class="dcbpv-close" aria-label="닫기">✕</button>
        </div>
        <div class="dcbpv-body">
          <div class="dcbpv-col">
            <div class="dcbpv-article">
              <div class="dcbpv-actions" id="dcbpv-actions"></div>
              <div class="dcbpv-content" id="dcbpv-article"></div>
            </div>
          </div>
          <div class="dcbpv-col">
            <div class="dcbpv-comments">
              <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;">
                <h4>댓글 미리보기</h4>
                <span style="font-size:12px;color:#9fb1c7">원본 댓글 UI를 그대로 불러옵니다</span>
              </div>
              <div class="dcbpv-commentlist" id="dcbpv-commentlist"></div>
            </div>
          </div>
        </div>
      </div>
    `;

    document.documentElement.appendChild(overlay);

    countsBox = overlay.querySelector("#dcbpv-actions");
    renderCounts();
    overlay.addEventListener("click", (e) => {
      const actBtn = e.target.closest(".dcbpv-btn[data-act]");
      if (actBtn) {
        handleAction(actBtn.dataset.act);
        return;
      }
      if (e.target.classList.contains("dcbpv-close")) {
        overlay.remove();
      }
    });

    overlay.addEventListener("click", (e)=>{
      if (e.target.id === OVERLAY_ID) overlay.remove();
    });

    const artHost = overlay.querySelector("#dcbpv-article");
    if (article) artHost.appendChild(article);
    else artHost.innerHTML = '<div class="dcbpv-empty">본문을 불러오지 못했습니다.</div>';

    const commentHost = overlay.querySelector("#dcbpv-commentlist");
    renderComments(commentHost);
  }

  function shouldOpen(target){
    // 게시글 목록(.gall_tit)이나 뷰 페이지(.view_content_wrap) 모두 지원
    return !!(target.closest && (target.closest(".view_content_wrap") || target.closest(".gall_tit")));
  }

  document.addEventListener("contextmenu", (e) => {
    if (!shouldOpen(e.target)) return;
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
    
    // 뷰 페이지에서 우클릭 시: 바로 오버레이
    openOverlay();
  }, true);
  
  // 외부 URL의 게시글을 가져와 미리보기
  async function fetchAndShowPreview(url){
    if (document.getElementById(OVERLAY_ID)) return;
    
    // 로딩 오버레이 표시
    const loadingOverlay = document.createElement("div");
    loadingOverlay.id = OVERLAY_ID;
    loadingOverlay.innerHTML = `
      <div class="dcbpv-panel" style="justify-content:center;align-items:center;">
        <div style="text-align:center;color:#e6edf3;">
          <div style="font-size:48px;margin-bottom:16px;">⏳</div>
          <div style="font-size:18px;font-weight:600;">게시글 불러오는 중...</div>
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
        <div class="dcbpv-panel" style="justify-content:center;align-items:center;">
          <div style="text-align:center;color:#e6edf3;">
            <div style="font-size:48px;margin-bottom:16px;">❌</div>
            <div style="font-size:18px;font-weight:600;margin-bottom:8px;">게시글을 불러올 수 없습니다</div>
            <div style="font-size:14px;color:#9fb1c7;">${err.message}</div>
            <button style="margin-top:16px;padding:10px 20px;border:1px solid #4f7cff;border-radius:8px;background:rgba(79,124,255,.12);color:#e6edf3;cursor:pointer;font-size:14px;font-weight:600;" onclick="this.closest('#${OVERLAY_ID}').remove()">닫기</button>
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
    const uid  = writer?.getAttribute("data-uid") || "";
    const date = writer?.querySelector(".gall_date")?.textContent?.trim() || "";
    const views = wrap.querySelector(".gall_count")?.textContent?.trim() || "";
    
    const article = sanitizeClone(wrap.querySelector(".write_div"));
    
    const rec = {
      up: wrap.querySelector(".up_num")?.textContent?.trim() || "0",
      upFix: wrap.querySelector(".sup_num .font_blue")?.textContent?.trim() || "0",
      down: wrap.querySelector(".down_num")?.textContent?.trim() || "0"
    };
    // 댓글 수집
    const cmtWrap = doc.querySelector(".comment_wrap[id^='comment_wrap_']");
    const comments = [];
    console.log('[DCB Preview] 댓글 컨테이너:', cmtWrap);
    if (cmtWrap) {
      // .comment_box > .cmt_list 구조 확인
      const commentBox = cmtWrap.querySelector(".comment_box");
      console.log('[DCB Preview] comment_box:', commentBox);
      
      if (commentBox) {
        const cmtList = commentBox.querySelector(".cmt_list");
        console.log('[DCB Preview] cmt_list:', cmtList);
        
        if (cmtList) {
          // 일반 댓글 수집
          const topLevelComments = cmtList.querySelectorAll(":scope > li.ub-content:not(.dory)");
          console.log('[DCB Preview] 상위 댓글 개수:', topLevelComments.length);
          
          topLevelComments.forEach(li => {
            const info = li.querySelector(".cmt_info");
            if (info) {
              const nickEl = info.querySelector(".nickname em");
              const nickText = nickEl ? nickEl.textContent.trim() : (info.querySelector(".nickname")?.textContent?.trim() || "");
              const ipEl   = info.querySelector(".ip")?.textContent?.trim() || "";
              const dateEl = info.querySelector(".date_time")?.textContent?.trim() || "";
              const txt  = info.querySelector(".usertxt");
              const body = txt ? txt.textContent.trim() : "";
              console.log('[DCB Preview] 댓글:', { nickText, ipEl, dateEl, body });
              if (nickText || body) comments.push({ meta: nickText, ip: ipEl, date: dateEl, body, isReply: false });
            }
            
            // 답글 수집
            const replies = li.querySelectorAll(".reply_list > li.ub-content");
            replies.forEach(reply => {
              const rInfo = reply.querySelector(".reply_info");
              if (rInfo) {
                const rNickEl = rInfo.querySelector(".nickname em");
                const rNickText = rNickEl ? rNickEl.textContent.trim() : (rInfo.querySelector(".nickname")?.textContent?.trim() || "");
                const rIpEl   = rInfo.querySelector(".ip")?.textContent?.trim() || "";
                const rDateEl = rInfo.querySelector(".date_time")?.textContent?.trim() || "";
                const rTxt  = rInfo.querySelector(".usertxt");
                const rBody = rTxt ? rTxt.textContent.trim() : "";
                if (rNickText || rBody) comments.push({ meta: rNickText, ip: rIpEl, date: rDateEl, body: rBody, isReply: true });
              }
            });
          });
        }
      }
    }
    console.log('[DCB Preview] 총 수집된 댓글:', comments.length, comments);
    
    const urlObj = new URL(sourceUrl);
    const gallId = urlObj.searchParams.get("id") || "";
    const articleNo = sourceUrl.match(/no=(\d+)/)?.[1] || "";
    const reportUrl = articleNo && gallId ? `https://gall.dcinside.com/singo/?id=singo&singo_id=${gallId}&singo_no=${articleNo}&ko_name=${encodeURIComponent(title)}&s_url=${encodeURIComponent(sourceUrl)}&gall_type=G` : "";
    
    overlay.innerHTML = `
      <div class="dcbpv-panel">
        <div class="dcbpv-header">
          <div class="dcbpv-meta">
            <div class="dcbpv-title">${title || "제목 없음"}</div>
            <div class="dcbpv-sub">
              ${head ? `<span class="dcbpv-chip">${head}</span>` : ""}
              ${nick ? `<span class="dcbpv-chip">작성자 ${nick}${uid ? ` (${uid})` : ""}</span>` : ""}
              ${ip ? `<span class="dcbpv-chip">IP ${ip}</span>` : ""}
              ${date ? `<span class="dcbpv-chip">${date}</span>` : ""}
              ${views ? `<span class="dcbpv-chip">${views}</span>` : ""}
            </div>
          </div>
          <button class="dcbpv-close" aria-label="닫기">✕</button>
        </div>
        <div class="dcbpv-body">
          <div class="dcbpv-col">
            <div class="dcbpv-article">
              <div class="dcbpv-actions" id="dcbpv-actions">
                <button class="dcbpv-btn" data-act="open">🔗 원본 보기</button>
                <button class="dcbpv-btn" data-act="up-preview">👍 추천 ${rec.up}</button>
                <button class="dcbpv-btn" data-act="down-preview">👎 비추천 ${rec.down}</button>
                <button class="dcbpv-btn secondary" data-act="share-preview">🔗 공유</button>
                ${reportUrl ? `<button class="dcbpv-btn warn" data-act="report-preview">🚨 신고</button>` : ""}
              </div>
              <div class="dcbpv-content" id="dcbpv-article"></div>
            </div>
          </div>
        </div>
      </div>
    `;
    
    document.documentElement.appendChild(overlay);
    window.isPreviewOpen = true;
    
    overlay.querySelector(".dcbpv-close").onclick = () => {
      overlay.remove();
      window.isPreviewOpen = false;
    };
    overlay.addEventListener("click", (e)=>{
      if (e.target.id === OVERLAY_ID) {
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
      // 원본 페이지에서 해당 게시글을 새 탭에서 열고, 자동으로 추천/비추천 클릭
      const urlObj = new URL(url);
      const gallId = urlObj.searchParams.get("id") || "";
      const articleNo = url.match(/no=(\d+)/)?.[1] || "";
      
      if (!gallId || !articleNo) {
        alert("게시글 정보를 찾을 수 없습니다.");
        return;
      }
      
      // 원본 페이지 내용 가져오기
      const response = await fetch(url);
      const html = await response.text();
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, "text/html");
      
      // 실제 추천/비추천 버튼 찾기
      const isUp = type === "up";
      const recomBtn = doc.querySelector(isUp ? ".btn_recom_up" : ".btn_recom_down");
      
      if (!recomBtn) {
        alert("추천/비추천 버튼을 찾을 수 없습니다.");
        return;
      }
      
      // 버튼의 data-no 확인
      const btnNo = recomBtn.getAttribute("data-no");
      if (!btnNo) {
        alert("게시글 번호 정보가 없습니다.");
        return;
      }
      
      // 추천/비추천 API 호출
      const voteResponse = await fetch("https://gall.dcinside.com/board/recommend/vote", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8"
        },
        credentials: "include",
        body: new URLSearchParams({
          id: gallId,
          no: btnNo,
          mode: isUp ? "U" : "D",
          link_id: ""
        })
      });
      
      const result = await voteResponse.text();
      
      // 결과 처리
      if (result.includes('"success"') || result.includes('"True"')) {
        // 현재 수를 가져와서 업데이트
        const countSelector = isUp ? ".up_num" : ".down_num";
        const countEl = doc.querySelector(countSelector);
        if (countEl) {
          const currentCount = parseInt(countEl.textContent) || 0;
          btn.textContent = btn.textContent.replace(/\d+/, currentCount + 1);
        }
        alert(isUp ? "추천이 완료되었습니다." : "비추천이 완료되었습니다.");
      } else if (result.includes('중복') || result.includes('이미')) {
        alert("이미 투표하셨습니다.");
      } else {
        alert("추천/비추천 처리 중 오류가 발생했습니다.");
      }
    } catch (error) {
      console.error("Recommend error:", error);
      alert("요청 처리 중 오류가 발생했습니다: " + error.message);
    }
  }
  
  function showSharePopupForPreview(url, title){
    if (document.getElementById("dcbpv-share-popup")) return;
    const popup = document.createElement("div");
    popup.id = "dcbpv-share-popup";
    popup.className = "dcbpv-share-popup";
    popup.innerHTML = `
      <button class="dcbpv-share-close">✕</button>
      <h3>공유하기</h3>
      <div class="share-btns">
        <div class="share-btn" data-share="kakao">카카오톡</div>
        <div class="share-btn" data-share="x">X</div>
        <div class="share-btn" data-share="facebook">페이스북</div>
      </div>
      <div class="url-copy">
        <input type="text" readonly value="${url}" id="dcbpv-url-input-preview">
        <button id="dcbpv-copy-btn-preview">URL 복사</button>
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
      btn.textContent = "✓ 복사됨";
      setTimeout(() => btn.textContent = orig, 1500);
    };
    
    popup.querySelectorAll(".share-btn[data-share]").forEach(btn => {
      btn.onclick = () => {
        const type = btn.dataset.share;
        if (type === "kakao") {
          alert("카카오톡 공유는 원본 페이지에서 이용하세요.");
        } else if (type === "x") {
          window.open(`https://twitter.com/intent/tweet?url=${encodeURIComponent(url)}&text=${encodeURIComponent(title)}`, "_blank", "width=600,height=400");
        } else if (type === "facebook") {
          window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`, "_blank", "width=600,height=400");
        }
      };
    });
  }
})();

/* options.js */

/* ───── 상수 ───── */
const builtinBlocked = ["dcbest"];                // 기본 차단

const recommendedIds = [
  "4year_university","alliescon","asdf12","canada","centristconservatis",
  "colonialism","disease","divination_new1","ehxoeh","employment",
  "escapekorea","escapekoreagall","foreversolo","immovables","iphone",
  "jpjobngm","leejaemyung","m_entertainer_new1","minjudang","neostock",
  "newtheory","nobirthgall","singlebungle1472","smartphone",
  "thesingularity","w_entertainer","loveconsultation"
].map(s => s.toLowerCase());

/* 👉 메인 페이지 추천 셀렉터(롤백 버전) */
const recSelectors = [
  "div.content.concept_con",
  "div.content_box.new_gall",
  "div.content_box.tab",
  "div.time_best"
];

/* 갤러리(게시글,목록) 추천 셀렉터 */
const recGallSelectors = [
  "article > div > div > div[style]",
  "div.ad_bottom_list",
  "div.content_box.r_timebest",
  "div.rightbanner1",
  "div[data-rand]",
  "img[src][width][height][title][style]"
];

/* ───── DOM 캐시 ───── */
/* 갤러리 ID */
const newIdInput = document.getElementById("newId");
const addBtn     = document.getElementById("addBtn");
const listEl     = document.getElementById("list");
const recList    = document.getElementById("recList");
const addAllRec  = document.getElementById("addAllRec");
/* 메인 셀렉터 */
const newSel     = document.getElementById("newSel");
const addSelBtn  = document.getElementById("addSelBtn");
const addRecSel  = document.getElementById("addRecSel");
const selList    = document.getElementById("selList");
/* 갤러리 셀렉터 */
const newGallSel     = document.getElementById("newGallSel");
const addGallSelBtn  = document.getElementById("addGallSelBtn");
const addRecGallSel  = document.getElementById("addRecGallSel");
const gallSelList    = document.getElementById("gallSelList");

/* ───── 유틸 ───── */
const norm = s => s.trim().toLowerCase();

/* ───── 렌더 함수 ───── */
function renderUser(ids){
  listEl.innerHTML = "";
  const vis = ids.filter(id => !builtinBlocked.includes(id));
  if (!vis.length){
    listEl.innerHTML = '<p class="note">아직 추가된 갤러리가 없습니다.</p>'; return;
  }
  vis.sort().forEach(id=>{
    const li=document.createElement("li"), span=document.createElement("span");
    span.textContent=id;
    const del=document.createElement("button"); del.textContent="삭제";
    del.onclick=()=>chrome.storage.sync.get({blockedIds:[]},({blockedIds})=>{
      updateBlocked(blockedIds.filter(x=>norm(x)!==id));
    });
    li.append(span,del); listEl.appendChild(li);
  });
}

function renderRec(blocked){
  recList.innerHTML="";
  recommendedIds.forEach(id=>{
    const li=document.createElement("li"), btn=document.createElement("button");
    const already=blocked.includes(id);
    btn.textContent = already?"✓ 추가됨":"추가";
    btn.disabled=already; btn.className=already?"added":"";
    if(!already) btn.onclick=()=>updateBlocked([...blocked,id]);
    li.textContent=id+" "; li.appendChild(btn); recList.appendChild(li);
  });
}

function renderSel(arr,targetUl,key){
  targetUl.innerHTML="";
  if(!arr.length){
    targetUl.innerHTML='<p class="note">숨길 영역이 없습니다.</p>'; return;
  }
  arr.forEach(sel=>{
    const li=document.createElement("li"), span=document.createElement("span");
    span.textContent=sel;
    const del=document.createElement("button"); del.textContent="삭제";
    del.onclick=()=>chrome.storage.sync.get({[key]:[]},store=>{
      updateSel(store[key].filter(s=>s!==sel),key,targetUl);
    });
    li.append(span,del); targetUl.appendChild(li);
  });
}

/* ───── 저장 ───── */
function updateBlocked(next){
  const uniq=[...new Set(next.map(norm))];
  chrome.storage.sync.set({blockedIds:uniq},()=>{renderUser(uniq);renderRec(uniq);});
}
function updateSel(list,key,targetUl){
  const uniq=[...new Set(list.map(s=>s.trim()).filter(Boolean))];
  chrome.storage.sync.set({[key]:uniq},()=>renderSel(uniq,targetUl,key));
}

/* ───── 이벤트 바인딩 ───── */
/* 갤러리 ID */
addBtn.onclick=()=>{
  const id=norm(newIdInput.value); if(!id||builtinBlocked.includes(id))return;
  chrome.storage.sync.get({blockedIds:[]},({blockedIds})=>{
    if(!blockedIds.map(norm).includes(id))updateBlocked([...blockedIds,id]);
    newIdInput.value="";
  });
};
newIdInput.addEventListener("keyup",e=>{if(e.key==="Enter")addBtn.onclick();});
addAllRec.onclick=()=>chrome.storage.sync.get({blockedIds:[]},({blockedIds})=>
  updateBlocked([...new Set([...blockedIds,...recommendedIds])]));

/* 메인 셀렉터 */
addSelBtn.onclick=()=>{
  const sel=newSel.value.trim(); if(!sel)return;
  chrome.storage.sync.get({removeSelectors:[]},({removeSelectors})=>{
    if(!removeSelectors.includes(sel))
      updateSel([...removeSelectors,sel],"removeSelectors",selList);
    newSel.value="";
  });
};
newSel.addEventListener("keyup",e=>{if(e.key==="Enter")addSelBtn.onclick();});
addRecSel.onclick=()=>chrome.storage.sync.get({removeSelectors:[]},({removeSelectors})=>
  updateSel([...new Set([...removeSelectors,...recSelectors])],"removeSelectors",selList));

/* 갤러리 셀렉터 */
addGallSelBtn.onclick=()=>{
  const sel=newGallSel.value.trim(); if(!sel)return;
  chrome.storage.sync.get({removeSelectorsGall:[]},({removeSelectorsGall})=>{
    if(!removeSelectorsGall.includes(sel))
      updateSel([...removeSelectorsGall,sel],"removeSelectorsGall",gallSelList);
    newGallSel.value="";
  });
};
newGallSel.addEventListener("keyup",e=>{if(e.key==="Enter")addGallSelBtn.onclick();});
addRecGallSel.onclick=()=>chrome.storage.sync.get({removeSelectorsGall:[]},({removeSelectorsGall})=>
  updateSel([...new Set([...removeSelectorsGall,...recGallSelectors])],"removeSelectorsGall",gallSelList));

/* ───── 초기 로드 ───── */
chrome.storage.sync.get(
  {blockedIds:[],removeSelectors:[],removeSelectorsGall:[]},
  ({blockedIds,removeSelectors,removeSelectorsGall})=>{
    renderUser(blockedIds.map(norm));
    renderRec(blockedIds.map(norm));
    renderSel(removeSelectors,selList,"removeSelectors");
    renderSel(removeSelectorsGall,gallSelList,"removeSelectorsGall");
  }
);

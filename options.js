/* options.js  

/* ────────── 상수 ────────── */
/* 1) 기본으로 항상 차단되는 갤러리(사용자 목록에 안 보임) */
const builtinBlocked = ["dcbest"];

/* 2) 추천 차단 갤러리 목록 */
const recommendedIds = [
  "4year_university","alliescon","asdf12","canada","centristconservatis",
  "colonialism","disease","divination_new1","ehxoeh","employment",
  "escapekorea","escapekoreagall","foreversolo","immovables","iphone",
  "jpjobngm","leejaemyung","m_entertainer_new1","minjudang","neostock",
  "newtheory","nobirthgall","singlebungle1472","smartphone",
  "thesingularity","w_entertainer"
].map(x => x.toLowerCase());

/* ────────── DOM 캐시 ────────── */
const newIdInput = document.getElementById("newId");
const addBtn     = document.getElementById("addBtn");
const listEl     = document.getElementById("list");

const recList    = document.getElementById("recList");
const addAllRec  = document.getElementById("addAllRec");

/* ────────── 유틸 ────────── */
const norm = s => s.trim().toLowerCase();

/* ────────── 사용자 차단 목록 렌더 ────────── */
function renderUser(ids){
  listEl.innerHTML = "";
  ids
    .filter(id => !builtinBlocked.includes(id))   // 기본 차단 숨김
    .sort()
    .forEach(id=>{
      const li   = document.createElement("li");
      const span = document.createElement("span");
      span.textContent = id;

      const del  = document.createElement("button");
      del.textContent = "삭제";
      del.onclick = () => removeId(id);

      li.appendChild(span);
      li.appendChild(del);
      listEl.appendChild(li);
    });
}

/* ────────── 추천 목록 렌더 ────────── */
function renderRec(blocked){
  recList.innerHTML = "";
  recommendedIds.forEach(id=>{
    const li  = document.createElement("li");
    const btn = document.createElement("button");

    const already = blocked.includes(id);
    btn.textContent = already ? "✓ 추가됨" : "추가";
    btn.disabled   = already;
    btn.className  = already ? "added" : "";
    btn.onclick    = () => addId(id);

    li.textContent = id + " ";
    li.appendChild(btn);
    recList.appendChild(li);
  });
}

/* ────────── 차단 ID 추가 ────────── */
function addId(rawVal = null){
  const raw = rawVal ? norm(rawVal) : norm(newIdInput.value);
  if(!raw || builtinBlocked.includes(raw)) return;

  chrome.storage.sync.get({blockedIds:[]}, ({blockedIds})=>{
    const set = new Set(blockedIds.map(norm));
    if(set.has(raw)) return;

    set.add(raw);
    const next = Array.from(set);
    chrome.storage.sync.set({blockedIds:next}, ()=>{
      if(!rawVal) newIdInput.value = "";
      renderUser(next);
      renderRec(next);
    });
  });
}

/* ────────── 차단 ID 삭제 ────────── */
function removeId(id){
  chrome.storage.sync.get({blockedIds:[]}, ({blockedIds})=>{
    const next = blockedIds.map(norm).filter(x=>x!==norm(id));
    chrome.storage.sync.set({blockedIds:next}, ()=>{
      renderUser(next);
      renderRec(next);
    });
  });
}

/* ────────── 추천 전부 추가 ────────── */
addAllRec.onclick = () =>{
  chrome.storage.sync.get({blockedIds:[]}, ({blockedIds})=>{
    const set = new Set(blockedIds.map(norm));
    recommendedIds.forEach(id=>set.add(id));
    const next = Array.from(set);
    chrome.storage.sync.set({blockedIds:next}, ()=>{
      renderUser(next);
      renderRec(next);
    });
  });
};

/* ────────── 이벤트 바인딩 ────────── */
addBtn.onclick = () => addId();
newIdInput.addEventListener("keyup", e=>{
  if(e.key==="Enter") addId();
});

/* ────────── 초기 렌더 ────────── */
chrome.storage.sync.get({blockedIds:[]}, ({blockedIds})=>{
  const normed = blockedIds.map(norm);
  renderUser(normed);
  renderRec(normed);
});

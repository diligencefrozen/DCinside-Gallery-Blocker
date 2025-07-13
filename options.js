/* options.js
*/

/* ────────────── 상수 ────────────── */
/* 1️⃣ 항상 차단되는 기본 갤러리(목록에 표시하지 않음) */
const builtinBlocked = ["dcbest"];

/* 2️⃣ 추천 차단 갤러리 ID */
const recommendedIds = [
  "4year_university","alliescon","asdf12","canada","centristconservatis",
  "colonialism","disease","divination_new1","ehxoeh","employment",
  "escapekorea","escapekoreagall","foreversolo","immovables","iphone",
  "jpjobngm","leejaemyung","m_entertainer_new1","minjudang","neostock",
  "newtheory","nobirthgall","singlebungle1472","smartphone",
  "thesingularity","w_entertainer"
].map(s => s.toLowerCase());

/* 3️⃣ 메인 페이지 추천 ‘숨김’ 셀렉터 */
const recSelectors = [
  // 기존 추천
  "div.content.concept_con",
  "div.content_box.new_gall",
  "div.content_box.tab",
  "div.time_best",
  // 광고·배너
  "#ad-layer",
  "#ad-pop-layer",
  "#gall_top_recom",
  "div.banner_box > a",
  "div.content_box.r_timebest",
  "div[data-rand]",
  "img[src][width][height][title][style]",
  "div.rightbanner1",
  "div.content_box.r_only_daum",
  "div.content_box.r_recommend"
];

/* ────────────── DOM 캐시 ────────────── */
/* 갤러리 ID 관련 */
const newIdInput = document.getElementById("newId");
const addBtn     = document.getElementById("addBtn");
const listEl     = document.getElementById("list");
const recList    = document.getElementById("recList");
const addAllRec  = document.getElementById("addAllRec");

/* 셀렉터 관련 */
const newSel     = document.getElementById("newSel");
const addSelBtn  = document.getElementById("addSelBtn");
const addRecSel  = document.getElementById("addRecSel");
const selList    = document.getElementById("selList");

/* ────────────── 유틸 ────────────── */
const norm = s => s.trim().toLowerCase();

/* ────────────── 갤러리 차단 목록 영역 ────────────── */
function renderUser(ids){
  listEl.innerHTML = "";
  const visible = ids.filter(id => !builtinBlocked.includes(id));
  if (visible.length === 0){
    listEl.innerHTML = '<p class="note">아직 추가된 갤러리가 없습니다.</p>';
    return;
  }

  visible.sort().forEach(id => {
    const li   = document.createElement("li");
    const span = document.createElement("span");
    span.textContent = id;

    const del = document.createElement("button");
    del.textContent = "삭제";
    del.onclick = () => updateBlocked(ids.filter(x => x !== id));

    li.appendChild(span);
    li.appendChild(del);
    listEl.appendChild(li);
  });
}

/* ────────────── 추천 갤러리 영역 ────────────── */
function renderRec(blocked){
  recList.innerHTML = "";
  recommendedIds.forEach(id => {
    const li  = document.createElement("li");
    const btn = document.createElement("button");
    const already = blocked.includes(id);
    btn.textContent = already ? "✓ 추가됨" : "추가";
    btn.disabled   = already;
    btn.className  = already ? "added" : "";
    if (!already) btn.onclick = () => updateBlocked([...blocked, id]);

    li.textContent = id + " ";
    li.appendChild(btn);
    recList.appendChild(li);
  });
}

/* ────────────── 셀렉터 목록 영역 ────────────── */
function renderSel(arr){
  selList.innerHTML = "";
  if (arr.length === 0){
    selList.innerHTML = '<p class="note">숨길 영역이 없습니다.</p>';
    return;
  }

  arr.forEach(sel => {
    const li   = document.createElement("li");
    const span = document.createElement("span");
    span.textContent = sel;

    const del  = document.createElement("button");
    del.textContent = "삭제";
    del.onclick = () => updateSel(arr.filter(s => s !== sel));

    li.appendChild(span);
    li.appendChild(del);
    selList.appendChild(li);
  });
}

/* ────────────── 저장(갤러리) ────────────── */
function updateBlocked(next){
  const uniq = Array.from(new Set(next.map(norm)));
  chrome.storage.sync.set({ blockedIds: uniq }, () => {
    renderUser(uniq);
    renderRec(uniq);
  });
}

/* ────────────── 저장(셀렉터) ────────────── */
function updateSel(list){
  const uniq = Array.from(new Set(list.map(s => s.trim()).filter(Boolean)));
  chrome.storage.sync.set({ removeSelectors: uniq }, () => renderSel(uniq));
}

/* ────────────── 이벤트 바인딩 ────────────── */
/* 개별 갤러리 추가 */
addBtn.onclick = () => {
  const id = norm(newIdInput.value);
  if (!id || builtinBlocked.includes(id)) return;

  chrome.storage.sync.get({ blockedIds: [] }, ({ blockedIds }) => {
    if (!blockedIds.map(norm).includes(id)) updateBlocked([...blockedIds, id]);
    newIdInput.value = "";
  });
};
newIdInput.addEventListener("keyup", e => { if (e.key === "Enter") addBtn.onclick(); });

/* 추천 전체 추가 */
addAllRec.onclick = () =>
  chrome.storage.sync.get({ blockedIds: [] }, ({ blockedIds }) =>
    updateBlocked(Array.from(new Set([...blockedIds, ...recommendedIds])))
  );

/* 셀렉터 개별 추가 */
addSelBtn.onclick = () => {
  const sel = newSel.value.trim();
  if (!sel) return;
  chrome.storage.sync.get({ removeSelectors: [] }, ({ removeSelectors }) => {
    if (!removeSelectors.includes(sel)) updateSel([...removeSelectors, sel]);
    newSel.value = "";
  });
};
newSel.addEventListener("keyup", e => { if (e.key === "Enter") addSelBtn.onclick(); });

/* 추천 셀렉터 전체 추가 */
addRecSel.onclick = () =>
  chrome.storage.sync.get({ removeSelectors: [] }, ({ removeSelectors }) => {
    updateSel(Array.from(new Set([...removeSelectors, ...recSelectors])));
  });

/* ────────────── 초기 영역 ────────────── */
chrome.storage.sync.get(
  { blockedIds: [], removeSelectors: [] },
  ({ blockedIds, removeSelectors }) => {
    const normed = blockedIds.map(norm);
    renderUser(normed);
    renderRec(normed);
    renderSel(removeSelectors);
  }
);

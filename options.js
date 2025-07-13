/* options.js */

/* ────────────── 상수 ────────────── */
/* 1️⃣  항상 차단되는 기본 갤러리 (숨김) */
const builtinBlocked = ["dcbest"];

/* 2️⃣  추천 차단 갤러리 ID */
const recommendedIds = [
  "4year_university","alliescon","asdf12","canada","centristconservatis",
  "colonialism","disease","divination_new1","ehxoeh","employment",
  "escapekorea","escapekoreagall","foreversolo","immovables","iphone",
  "jpjobngm","leejaemyung","m_entertainer_new1","minjudang","neostock",
  "newtheory","nobirthgall","singlebungle1472","smartphone",
  "thesingularity","w_entertainer"
].map(s => s.toLowerCase());

/* 3️⃣  메인 페이지 추천 ‘숨김’ 셀렉터
   도메인 접두사는 cleaner.js 가 www.dcinside.com 에서만 실행되므로 생략 */
const recSelectors = [
  /* 기존 추천 */
  "div.content.concept_con",
  "div.content_box.new_gall",
  "div.content_box.tab",
  "div.time_best",
  "#ad-layer",
  "#ad-pop-layer",
  "#gall_top_recom",
  "div.banner_box > a",
  "div.content_box.r_timebest",
  "div[data-rand]",
  "img[src][width][height][title][style]",
  "div.rightbanner1"
  "div.content_box.r_only_daum"
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

/* ────────────── 갤러리 차단 목록 렌더 ────────────── */
function renderUser(ids){
  listEl.innerHTML = "";
  ids
    .filter(id => !builtinBlocked.includes(id))
    .sort()
    .forEach(id => {
      const li = document.createElement("li");
      const span = document.createElement("span");
      span.textContent = id;

      const del = document.createElement("button");
      del.textContent = "삭제";
      del.onclick = () => updateBlocked(ids.filter(x =역 ────────────── */
chrome.storage.sync.get(
  { blockedIds: [], removeSelectors: [] },
  ({ blockedIds, removeSelectors }) => {
    const normed = blockedIds.map(norm);
    renderUser(normed);
    renderRec(normed);
    renderSel(removeSelectors);
  }
);

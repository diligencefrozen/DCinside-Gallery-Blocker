// 기본으로 항상 차단되는 갤러리
const builtinBlocked = ["dcbest"];

/* ────────── DOM 캐시 ────────── */
const newIdInput = document.getElementById("newId");
const addBtn     = document.getElementById("addBtn");
const listEl     = document.getElementById("list");

/* ────────── 렌더링 ────────── */
function render(ids) {
  listEl.innerHTML = "";

  // 기본 차단 목록은 옵션 화면에서 숨기고, 사전순 정렬
  ids
    .filter(id => !builtinBlocked.includes(id))
    .sort()
    .forEach(id => {
      const li   = document.createElement("li");
      const text = document.createElement("span");
      text.textContent = id;

      const del  = document.createElement("button");
      del.textContent = "삭제";
      del.onclick = () => removeId(id);

      li.appendChild(text);
      li.appendChild(del);
      listEl.appendChild(li);
    });
}

/* ────────── 차단 ID 추가 ────────── */
function addId() {
  const raw = newIdInput.value.trim().toLowerCase(); // 공백 제거 + 소문자화
  if (!raw || builtinBlocked.includes(raw)) return;  // 빈값·기본 차단 ID 무시

  chrome.storage.sync.get({ blockedIds: [] }, ({ blockedIds }) => {
    // 모두 소문자화해 중복 방지
    const set = new Set(blockedIds.map(x => x.toLowerCase()));
    if (set.has(raw)) return;

    set.add(raw);
    const next = Array.from(set);
    chrome.storage.sync.set({ blockedIds: next }, () => {
      newIdInput.value = "";
      render(next);
    });
  });
}

/* ────────── 차단 ID 삭제 ────────── */
function removeId(id) {
  chrome.storage.sync.get({ blockedIds: [] }, ({ blockedIds }) => {
    const next = blockedIds
      .map(x => x.toLowerCase())
      .filter(x => x !== id);      // 해당 ID 제거
    chrome.storage.sync.set({ blockedIds: next }, () => render(next));
  });
}

/* ────────── 이벤트 바인딩 ────────── */
addBtn.onclick = addId;
newIdInput.addEventListener("keyup", e => {
  if (e.key === "Enter") addId();
});

/* ────────── 초기 목록 표시 ────────── */
chrome.storage.sync.get({ blockedIds: [] }, ({ blockedIds }) => render(blockedIds));

const listEl = document.getElementById("list");
const formEl = document.getElementById("addForm");
const inputEl = document.getElementById("newId");

async function refreshList() {
  const { blockedIds = [] } = await chrome.storage.sync.get("blockedIds");
  listEl.innerHTML = "";
  blockedIds.forEach((id, idx) => {
    const li = document.createElement("li");
    li.innerHTML = `
      <span>${id}</span>
      <button data-idx="${idx}">삭제</button>
    `;
    listEl.appendChild(li);
  });
}

async function updateStorage(blockedIds) {
  await chrome.storage.sync.set({ blockedIds });
  // 백그라운드에도 알려서 다른 탭이 즉시 반영
  chrome.runtime.sendMessage({ type: "blockedIdsChanged", data: blockedIds });
}

formEl.addEventListener("submit", async (e) => {
  e.preventDefault();
  const newId = inputEl.value.trim();
  if (!newId) return;

  const { blockedIds = [] } = await chrome.storage.sync.get("blockedIds");
  if (blockedIds.includes(newId)) {
    alert("이미 차단 목록에 있습니다.");
  } else {
    blockedIds.push(newId);
    await updateStorage(blockedIds);
    inputEl.value = "";
    refreshList();
  }
});

listEl.addEventListener("click", async (e) => {
  if (e.target.tagName === "BUTTON") {
    const idx = Number(e.target.dataset.idx);
    const { blockedIds = [] } = await chrome.storage.sync.get("blockedIds");
    blockedIds.splice(idx, 1);
    await updateStorage(blockedIds);
    refreshList();
  }
});

refreshList();

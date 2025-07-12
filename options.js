const newIdInput = document.getElementById("newId");
const addBtn = document.getElementById("addBtn");
const listEl = document.getElementById("list");

function render(ids) {
  listEl.innerHTML = "";
  ids.forEach(id => {
    const li = document.createElement("li");
    const span = document.createElement("span");
    span.textContent = id;

    const del = document.createElement("button");
    del.textContent = "삭제";
    del.onclick = () => removeId(id);

    li.appendChild(span);
    li.appendChild(del);
    listEl.appendChild(li);
  });
}

function addId() {
  const id = newIdInput.value.trim();
  if (!id) return;

  chrome.storage.sync.get({ blockedIds: [] }, ({ blockedIds }) => {
    if (!blockedIds.includes(id)) {
      blockedIds.push(id);
      chrome.storage.sync.set({ blockedIds }, () => {
        newIdInput.value = "";
        render(blockedIds);
      });
    }
  });
}

function removeId(id) {
  chrome.storage.sync.get({ blockedIds: [] }, ({ blockedIds }) => {
    const next = blockedIds.filter(x => x !== id);
    chrome.storage.sync.set({ blockedIds: next }, () => render(next));
  });
}

addBtn.onclick = addId;
newIdInput.addEventListener("keyup", e => { if (e.key === "Enter") addId(); });

chrome.storage.sync.get({ blockedIds: [] }, ({ blockedIds }) => render(blockedIds));

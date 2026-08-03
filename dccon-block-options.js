/*****************************************************************
 * dccon-block-options.js - 숨길 디시콘 선택 및 목록 관리 UI
 *****************************************************************/
(() => {
  const Store = globalThis.DCBDcconBlockStore;
  if (!Store) return;

  const itemList = document.getElementById("blockedDcconItemList");
  const groupList = document.getElementById("blockedDcconGroupList");
  const itemCount = document.getElementById("dcconBlockedItemCount");
  const groupCount = document.getElementById("dcconBlockedGroupCount");
  const clearItemsButton = document.getElementById("clearBlockedDcconItems");
  const clearGroupsButton = document.getElementById("clearBlockedDcconGroups");
  const status = document.getElementById("dcconBlockManagerStatus");

  if (!itemList || !groupList) return;

  let statusTimer = 0;

  function setStatus(message, error = false) {
    if (!status) return;
    status.textContent = message;
    status.style.color = error ? "#fca5a5" : "#9dd6a5";
    if (statusTimer) clearTimeout(statusTimer);
    if (message) {
      statusTimer = setTimeout(() => {
        status.textContent = "";
      }, 3000);
    }
  }

  function appendEmpty(list, text) {
    const li = document.createElement("li");
    li.className = "dccon-block-empty";
    li.textContent = text;
    list.appendChild(li);
  }

  function appendRemoveButton(li, kind, key, label) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "dccon-block-remove";
    button.dataset.kind = kind;
    button.dataset.key = key;
    button.textContent = "해제";
    button.setAttribute("aria-label", `${label} 차단 해제`);
    li.appendChild(button);
  }

  function renderItem(record) {
    const li = document.createElement("li");
    const copy = document.createElement("div");
    const title = document.createElement("strong");
    const code = document.createElement("code");
    const packageName = record.packageTitle || "그룹 정보 확인 전";
    const itemName = record.label && record.label !== "개별 디시콘" ? ` · ${record.label}` : "";

    copy.className = "dccon-block-copy";
    title.textContent = `${packageName}${itemName}`;
    code.textContent = `${record.code.slice(0, 24)}…`;
    code.title = record.code;
    copy.append(title, code);
    li.appendChild(copy);
    appendRemoveButton(li, "item", record.code, title.textContent);
    itemList.appendChild(li);
  }

  function renderGroup(record) {
    const li = document.createElement("li");
    const copy = document.createElement("div");
    const title = document.createElement("strong");
    const meta = document.createElement("small");

    copy.className = "dccon-block-copy";
    title.textContent = record.title;
    meta.textContent = `${record.paths.length}개 디시콘 · 그룹 ${record.packageIdx}`;
    copy.append(title, meta);
    li.appendChild(copy);
    appendRemoveButton(li, "group", record.packageIdx, record.title);
    groupList.appendChild(li);
  }

  function render(value) {
    const state = Store.normalizeState(value);
    const items = Object.values(state.items).sort((a, b) => b.blockedAt - a.blockedAt);
    const groups = Object.values(state.groups).sort((a, b) => b.blockedAt - a.blockedAt);

    itemList.replaceChildren();
    groupList.replaceChildren();
    items.forEach(renderItem);
    groups.forEach(renderGroup);

    if (!items.length) appendEmpty(itemList, "차단한 개별 디시콘이 없습니다.");
    if (!groups.length) appendEmpty(groupList, "차단한 디시콘 그룹이 없습니다.");

    if (itemCount) itemCount.textContent = String(items.length);
    if (groupCount) groupCount.textContent = String(groups.length);
    if (clearItemsButton) clearItemsButton.disabled = !items.length;
    if (clearGroupsButton) clearGroupsButton.disabled = !groups.length;
  }

  async function refresh() {
    try {
      render(await Store.getState());
    } catch (error) {
      setStatus(error?.message || "차단 목록을 불러오지 못했습니다.", true);
    }
  }

  itemList.addEventListener("click", async (event) => {
    const button = event.target.closest("button[data-kind='item']");
    if (!button) return;

    try {
      render(await Store.removeItem(button.dataset.key));
      setStatus("개별 디시콘 차단을 해제했습니다.");
    } catch (error) {
      setStatus(error?.message || "차단을 해제하지 못했습니다.", true);
    }
  });

  groupList.addEventListener("click", async (event) => {
    const button = event.target.closest("button[data-kind='group']");
    if (!button) return;

    try {
      render(await Store.removeGroup(button.dataset.key));
      setStatus("디시콘 그룹 차단을 해제했습니다.");
    } catch (error) {
      setStatus(error?.message || "차단을 해제하지 못했습니다.", true);
    }
  });

  clearItemsButton?.addEventListener("click", async () => {
    if (!confirm("개별 디시콘 차단을 모두 해제할까요?")) return;
    try {
      render(await Store.clearItems());
      setStatus("개별 디시콘 차단을 모두 해제했습니다.");
    } catch (error) {
      setStatus(error?.message || "목록을 초기화하지 못했습니다.", true);
    }
  });

  clearGroupsButton?.addEventListener("click", async () => {
    if (!confirm("디시콘 그룹 차단을 모두 해제할까요?")) return;
    try {
      render(await Store.clearGroups());
      setStatus("디시콘 그룹 차단을 모두 해제했습니다.");
    } catch (error) {
      setStatus(error?.message || "목록을 초기화하지 못했습니다.", true);
    }
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes[Store.STATE_KEY]) {
      render(changes[Store.STATE_KEY].newValue || Store.emptyState());
    }
  });

  refresh();
})();

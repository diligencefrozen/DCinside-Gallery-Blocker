(() => {
  "use strict";
  const fieldset = document.getElementById("keywordBlockCategories");
  const choices = {
    profanity: ["욕설 차단", "비속어와 인신공격 표현"],
    politics: ["정치 차단", "정치인·정당·선거 관련 표현"],
    poll: ["투표 차단", "투표·설문 참여에 관한 표현"],
    promotion: ["광고·홍보 차단", "추천 코드·모집 등 홍보 표현"],
    hate: ["혐오 표현 차단", "집단을 비하하는 멸칭"]
  };
  const key = "keywordBlockCategories";
  const normalize = flags => Object.fromEntries(Object.keys(choices).map(id => [id, flags?.[id] === true]));
  globalThis.DCBKeywordCategoryUI = Object.freeze({ normalize });

  const pending = new Map();
  const inputs = new Map();
  const status = fieldset.querySelector('[role="status"]');
  function render(flags) {
    for (const [id, input] of inputs) {
      if (!pending.has(id)) input.checked = flags?.[id] === true;
    }
  }
  for (const [id, [name, description]] of Object.entries(choices)) {
    const label = document.createElement("label");
    label.className = "keyword-target-item";
    const text = document.createElement("span");
    const detail = document.createElement("small");
    detail.textContent = description;
    text.append(name, document.createElement("br"), detail);
    const input = document.createElement("input");
    input.type = "checkbox";
    input.value = id;
    label.append(text, input);
    fieldset.querySelector(".keyword-targets").append(label);
    inputs.set(id, input);
    input.addEventListener("change", async () => {
      const edit = Symbol();
      pending.set(id, edit);
      status.textContent = "";
      try {
        const response = await chrome.runtime.sendMessage({ type: "dcb.keywordSettings.patch", patch: { [key]: { [id]: input.checked } } });
        if (!response?.ok) throw new Error("save failed");
      } catch {
        if (pending.get(id) === edit) status.textContent = "카테고리 설정을 저장하지 못했습니다.";
      } finally {
        if (pending.get(id) === edit) {
          pending.delete(id);
          render(globalThis.DCBUiSettingsCache.read()[key]);
        }
      }
    });
  }
  const cache = globalThis.DCBUiSettingsCache;
  render(cache.read()[key]);
  cache.ready.then(() => render(cache.read()[key]));
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "sync" && changes[key]) render(changes[key].newValue);
  });
})();

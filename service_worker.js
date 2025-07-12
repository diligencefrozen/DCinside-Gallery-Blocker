const DEFAULT_BLOCKED = ["dcbest"];

/* install 시 규칙 세팅 */
chrome.runtime.onInstalled.addListener(async () => {
  await chrome.storage.sync.set({ blockedIds: DEFAULT_BLOCKED });
  await updateRules(DEFAULT_BLOCKED);
});

/* 옵션/팝업에서 리스트 바뀌면 규칙 갱신 */
chrome.runtime.onMessage.addListener((msg, _s, res) => {
  if (msg.type === "blockedIdsChanged") {
    updateRules(msg.data).then(() => res({ ok: true }));
    return true;
  }
});

async function updateRules(ids) {
  const rules = ids.map((id, i) => ({
    id: i + 1,
    priority: 1,
    action: {
      type: "redirect",
      redirect: { url: "https://www.dcinside.com" }
    },
    condition: {
      urlFilter: `||gall.dcinside.com/*id=${id}*`,
      resourceTypes: ["main_frame"]
    }
  }));

  /* 기존 규칙 모두 제거 후 새로 추가 */
  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: rules.map(r => r.id),
    addRules: rules
  });
}

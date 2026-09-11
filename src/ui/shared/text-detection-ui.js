(() => {
  "use strict";
  const config = globalThis.DCBTextDetection;
  const roots = [...document.querySelectorAll("[data-text-detection-settings]")];
  if (!config || !roots.length) return;
  const uiCache = globalThis.DCBUiSettingsCache;
  const cached = uiCache?.read?.({ [config.key]: config.defaults }) || { [config.key]: config.defaults };
  let settings = config.normalize(cached[config.key]);
  let status = { state: "idle" };
  let revision = 0;

  function render() {
    for (const root of roots) {
      for (const field of root.querySelectorAll("[data-detection-field]")) {
        const name = field.dataset.detectionField;
        if (field.type === "checkbox") field.checked = settings[name];
        else field.value = settings[name];
        field.disabled = name !== "enabled" && !settings.enabled;
      }
      const output = root.querySelector("[data-detection-status]");
      if (!output) continue;
      output.dataset.error = String(settings.enabled && status.state === "error");
      output.textContent = !settings.enabled ? "꺼짐 · 켜면 화면에 보이는 글과 댓글부터 확인합니다."
        : !settings.posts && !settings.comments ? "확인할 게시글 또는 댓글을 선택해 주세요."
        : status.state === "error" ? "감지 기능을 시작하지 못했습니다. 기능을 껐다 켜서 다시 시도해 주세요. 계속 안 되면 확장 프로그램과 페이지를 새로고침해 주세요."
        : status.state === "loading" ? "기기 안에서 감지 기능을 준비하고 있습니다. 처음에는 시간이 조금 걸릴 수 있습니다."
        : status.state === "analyzing" ? "현재 기기에서 공격적인 표현을 확인하고 있습니다."
        : status.state === "ready" ? "준비 완료 · 잘못 감지하거나 놓칠 수 있습니다."
        : "사용 중 · 글이나 미리보기를 열면 확인합니다.";
    }
  }

  roots.forEach(root => {
    root.addEventListener("change", async event => {
      if (!event.target.matches("[data-detection-field]")) return;
      const version = ++revision;
      const values = {};
      root.querySelectorAll("[data-detection-field]").forEach(field => {
        values[field.dataset.detectionField] = field.type === "checkbox" ? field.checked : field.value;
      });
      settings = config.normalize(values);
      render();
      try {
        uiCache?.merge?.({ [config.key]: settings });
        await chrome.storage.sync.set({ [config.key]: settings });
      } catch {
        if (version !== revision) return;
        const output = root.querySelector("[data-detection-status]");
        output.textContent = "설정을 저장하지 못했습니다. 다시 시도해 주세요.";
        output.dataset.error = "true";
      }
    });
  });
  render();

  const version = revision;
  const applyStoredSettings = (data) => {
    if (version !== revision) return;
    settings = config.normalize((data || {})[config.key]);
    render();
  };
  if (uiCache?.ready) uiCache.ready.then(applyStoredSettings).catch(() => {});
  else chrome.storage.sync.get({ [config.key]: config.defaults }, applyStoredSettings);
  chrome.runtime.sendMessage({ type: "DCB_DETECTION_STATUS" }).then(value => {
    status = value || status;
    render();
  }).catch(() => {});
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "sync" && changes[config.key]) {
      revision++;
      settings = config.normalize(changes[config.key].newValue);
      render();
    }
    if (area === "session" && changes.dcbDetectionStatus) {
      status = changes.dcbDetectionStatus.newValue || { state: "idle" };
      render();
    }
  });
})();

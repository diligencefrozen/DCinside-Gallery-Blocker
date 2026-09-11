(() => {
  "use strict";
  const config = globalThis.DCBTextDetection;
  const roots = [...document.querySelectorAll("[data-text-detection-settings]")];
  if (!config || !roots.length) return;
  let settings = config.normalize();
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
      output.textContent = !settings.enabled ? "꺼짐 · 켜면 화면에 보이는 문장부터 분석합니다."
        : !settings.posts && !settings.comments ? "분석할 게시글 또는 댓글을 선택해 주세요."
        : status.state === "error" ? "분석을 시작하지 못했습니다. 감지 기능을 껐다 켜서 다시 시도해 주세요. 계속 실패하면 확장과 페이지를 새로고침해 주세요."
        : status.state === "loading" ? "기기 내 모델을 준비하고 있습니다. 처음에는 시간이 걸릴 수 있어요."
        : status.state === "analyzing" ? "현재 기기에서 문장을 분석하고 있습니다."
        : status.state === "ready" ? "분석 준비 완료 · 표시가 없어도 정상 판정을 뜻하지 않습니다."
        : "사용 중 · 디시 게시글이나 미리보기를 열면 분석합니다.";
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
        await chrome.storage.sync.set({ [config.key]: settings });
      } catch {
        if (version !== revision) return;
        const output = root.querySelector("[data-detection-status]");
        output.textContent = "설정을 저장하지 못했습니다. 다시 시도해 주세요.";
        output.dataset.error = "true";
      }
    });
  });
  const version = revision;
  chrome.storage.sync.get({ [config.key]: config.defaults }, data => {
    if (version !== revision) return;
    settings = config.normalize(data[config.key]);
    render();
  });
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

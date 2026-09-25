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
  const STATES = Object.freeze({
    NOT_INSTALLED: "NOT_INSTALLED",
    DOWNLOADING: "DOWNLOADING",
    VERIFYING: "VERIFYING",
    READY: "READY",
    UPDATE_AVAILABLE: "UPDATE_AVAILABLE",
    ERROR: "ERROR",
    FALLBACK: "FALLBACK"
  });

  function machineState() {
    // 7.3.42 ships the reviewed graph, weights, tokenizer and runtime together.
    // Therefore NOT_INSTALLED/DOWNLOADING/UPDATE_AVAILABLE are defined states but
    // are not reachable until a safe data-only optional delivery pipeline exists.
    if (status.state === "error") return STATES.ERROR;
    if (status.state === "limited") return STATES.FALLBACK;
    if (status.state === "loading" || status.state === "analyzing") return STATES.VERIFYING;
    return STATES.READY;
  }

  function statusText() {
    if (!settings.enabled) return "꺼짐 · 모델은 설치되어 있으며, 켤 때만 로컬 분석 런타임을 시작합니다.";
    if (!settings.posts && !settings.comments) return "확인할 게시글 또는 댓글을 선택해 주세요.";
    if (status.state === "error") return "감지 기능을 시작하지 못했습니다. 기능을 껐다 켜거나 확장 프로그램을 새로고침한 뒤 다시 시도해 주세요.";
    if (status.state === "limited") return status.reason === "model-timeout"
      ? "기본 감지 사용 중(비-AI 규칙) · AI 준비 시간이 초과되어 명확한 표현만 임시 확인합니다. 잠시 뒤 다시 연결합니다."
      : "기본 감지 사용 중(비-AI 규칙) · AI 구성 요소 오류로 명확한 표현만 임시 확인합니다.";
    if (status.state === "loading") return "기기 내 AI 모델을 확인하고 준비하고 있습니다. 처음에는 시간이 조금 걸릴 수 있습니다.";
    if (status.state === "analyzing") return "현재 기기 안에서 공격적·모욕적·위협적 표현을 확인하고 있습니다.";
    if (status.state === "ready") return "준비 완료 · 결과는 표현 필터 보조 신호이며 작성자 판단이나 계정 조치에 사용하지 않습니다.";
    return "준비 완료 · 글이나 미리보기를 열면 기기 안에서만 확인합니다.";
  }

  function render() {
    for (const root of roots) {
      const currentState = machineState();
      root.dataset.detectionState = currentState;
      for (const field of root.querySelectorAll("[data-detection-field]")) {
        const name = field.dataset.detectionField;
        if (field.type === "checkbox") field.checked = settings[name];
        else field.value = settings[name];
        field.disabled = name !== "enabled" && !settings.enabled;
      }
      const output = root.querySelector("[data-detection-status]");
      if (!output) continue;
      output.dataset.error = String(settings.enabled && status.state === "error");
      output.textContent = statusText();
      const stateLabel = root.querySelector("[data-detection-state-label]");
      if (stateLabel) stateLabel.textContent = currentState;
      const modelLabel = root.querySelector("[data-detection-model]");
      if (modelLabel) {
        const size = (Number(config.model?.onnxBytes || 0) / 1024 / 1024).toFixed(2);
        modelLabel.textContent = `모델 ${config.model?.version || "-"} · ONNX ${size}MB · 확장에 포함됨`;
      }
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
    root.querySelector("[data-detection-retry]")?.addEventListener("click", async event => {
      const button = event.currentTarget;
      button.disabled = true;
      status = { state: "loading", mode: "model" };
      render();
      try {
        const result = await chrome.runtime.sendMessage({ type: "DCB_DETECTION_RETRY" });
        status = result?.ok ? { state: "ready", mode: "model" } : { state: "limited", mode: "basic", reason: result?.error };
      } catch {
        status = { state: "error", reason: "runtime-unavailable" };
      } finally {
        button.disabled = false;
        render();
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

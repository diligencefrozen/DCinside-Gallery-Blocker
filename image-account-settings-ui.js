(() => {
  "use strict";

  const STORAGE_KEY = "dcbImageAccountRules";
  const CACHE_KEY = "dcbImageAccountSignalCache";
  const DEFAULTS = Object.freeze({
    enabled: true,
    ageRuleEnabled: true,
    maxPublicAgeDays: 30,
    postRuleEnabled: true,
    minPostCount: 5,
    commentRuleEnabled: true,
    minCommentCount: 10,
    activityMatchMode: "both",
    holdWhileChecking: true,
    cacheHours: 24
  });

  const roots = Array.from(document.querySelectorAll("[data-image-account-settings]"));
  if (!roots.length) return;

  function integer(value, fallback, min, max) {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.min(max, Math.max(min, parsed));
  }

  function normalize(value = {}) {
    const source = value && typeof value === "object" ? value : {};
    return {
      enabled: source.enabled !== false,
      ageRuleEnabled: source.ageRuleEnabled !== false,
      maxPublicAgeDays: integer(source.maxPublicAgeDays, DEFAULTS.maxPublicAgeDays, 0, 3650),
      postRuleEnabled: source.postRuleEnabled !== false,
      minPostCount: integer(source.minPostCount, DEFAULTS.minPostCount, 0, 1_000_000),
      commentRuleEnabled: source.commentRuleEnabled !== false,
      minCommentCount: integer(source.minCommentCount, DEFAULTS.minCommentCount, 0, 1_000_000),
      activityMatchMode: source.activityMatchMode === "any" ? "any" : "both",
      holdWhileChecking: source.holdWhileChecking !== false,
      cacheHours: integer(source.cacheHours, DEFAULTS.cacheHours, 1, 168)
    };
  }

  function field(root, name) {
    return root.querySelector(`[data-account-field="${name}"]`);
  }

  function status(root, message, error = false) {
    const node = root.querySelector("[data-account-status]");
    if (!node) return;
    node.textContent = message || "";
    node.style.color = error ? "#ff9b9b" : "#9dd6a5";
  }

  function read(root) {
    return normalize({
      enabled: field(root, "enabled")?.checked === true,
      ageRuleEnabled: field(root, "ageRuleEnabled")?.checked === true,
      maxPublicAgeDays: field(root, "maxPublicAgeDays")?.value,
      postRuleEnabled: field(root, "postRuleEnabled")?.checked === true,
      minPostCount: field(root, "minPostCount")?.value,
      commentRuleEnabled: field(root, "commentRuleEnabled")?.checked === true,
      minCommentCount: field(root, "minCommentCount")?.value,
      activityMatchMode: field(root, "activityMatchMode")?.value,
      holdWhileChecking: field(root, "holdWhileChecking")?.checked === true,
      cacheHours: DEFAULTS.cacheHours
    });
  }

  function render(root, settings) {
    const value = normalize(settings);
    const assignments = {
      enabled: value.enabled,
      ageRuleEnabled: value.ageRuleEnabled,
      maxPublicAgeDays: value.maxPublicAgeDays,
      postRuleEnabled: value.postRuleEnabled,
      minPostCount: value.minPostCount,
      commentRuleEnabled: value.commentRuleEnabled,
      minCommentCount: value.minCommentCount,
      activityMatchMode: value.activityMatchMode,
      holdWhileChecking: value.holdWhileChecking
    };

    Object.entries(assignments).forEach(([name, next]) => {
      const node = field(root, name);
      if (!node) return;
      if (node.type === "checkbox") node.checked = next === true;
      else node.value = String(next);
    });

    const disabled = !value.enabled;
    root.querySelectorAll("[data-account-dependent]").forEach((node) => {
      node.disabled = disabled;
      node.closest("label")?.classList.toggle("is-disabled", disabled);
    });
  }

  function save(root) {
    const next = read(root);
    chrome.storage.sync.set({ [STORAGE_KEY]: next }, () => {
      if (chrome.runtime.lastError) {
        status(root, "자동 이미지 숨김 기준을 저장하지 못했어요.", true);
        return;
      }
      render(root, next);
      const mode = next.activityMatchMode === "any" ? "하나만 미달해도" : "글·댓글 모두 미달할 때";
      status(root, next.enabled ? `자동 판정 저장 완료 · ${mode}` : "자동 판정을 껐어요.");
    });
  }

  roots.forEach((root) => {
    root.addEventListener("change", (event) => {
      if (!event.target.closest("[data-account-field]")) return;
      save(root);
    });

    root.querySelector("[data-account-clear-cache]")?.addEventListener("click", () => {
      chrome.storage.local.set({ [CACHE_KEY]: {} }, () => {
        if (chrome.runtime.lastError) {
          status(root, "판정 캐시를 초기화하지 못했어요.", true);
          return;
        }
        status(root, "판정 캐시를 초기화했어요. 다음 게시글에서 다시 확인합니다.");
      });
    });
  });

  chrome.storage.sync.get({ [STORAGE_KEY]: DEFAULTS }, (data) => {
    roots.forEach((root) => {
      const settings = normalize(data[STORAGE_KEY]);
      render(root, settings);
      status(root, settings.enabled ? "신규·저활동 작성자 자동 판정 사용 중" : "자동 판정은 꺼져 있어요.");
    });
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "sync" || !changes[STORAGE_KEY]) return;
    roots.forEach((root) => render(root, changes[STORAGE_KEY].newValue));
  });
})();
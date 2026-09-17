// keyword-hide-ui.js
// popup.html / options.html에서 "키워드 숨기기(계속 보기)" 설정 UI를 저장하고 렌더링합니다.
// 실제 디시 페이지에서 글/댓글을 접어두는 작업은 keyword-hider.js가 담당합니다.
// 내부 저장 키는 기존 호환성을 위해 hiddenKeywords / keywordHideEnabled / keywordHideTargets를 유지합니다.

(() => {
  if (window.__DCB_KEYWORD_HIDE_UI_BOUND__) return;
  window.__DCB_KEYWORD_HIDE_UI_BOUND__ = true;

  const DEFAULTS = {
    keywordHideEnabled: false,
    hiddenKeywords: [],
    keywordHideTargets: {
      listTitle: true,
      viewTitle: true,
      viewBody: true,
      comments: true
    }
  };

  const CONTEXTS = [
    {
      name: "popup",
      enabled: "keywordHideEnabled",
      input: "hideKeywordInput",
      add: "addHideKeywordBtn",
      list: "hideKeywordList",
      count: "hideKeywordListCount",
      status: null,
      targets: {
        listTitle: "keywordHideTargetListTitle",
        viewTitle: "keywordHideTargetViewTitle",
        viewBody: "keywordHideTargetViewBody",
        comments: "keywordHideTargetComments"
      }
    },
    {
      name: "options",
      enabled: "optionKeywordHideEnabled",
      input: "optionHideKeywordInput",
      add: "optionAddHideKeywordBtn",
      list: "optionHideKeywordList",
      count: null,
      status: "optionHideKeywordStatus",
      targets: {
        listTitle: "optionKeywordHideTargetListTitle",
        viewTitle: "optionKeywordHideTargetViewTitle",
        viewBody: "optionKeywordHideTargetViewBody",
        comments: "optionKeywordHideTargetComments"
      }
    }
  ];

  const IME_FINALIZE_GRACE_MS = 80;

  const uiCache = globalThis.DCBUiSettingsCache;
  let activeContext = null;
  let saveQueue = Promise.resolve();
  let pendingSaveCount = 0;
  let deferredStorageRefresh = false;
  let stateMutationRevision = 0;
  let state = {
    keywordHideEnabled: DEFAULTS.keywordHideEnabled,
    hiddenKeywords: [...DEFAULTS.hiddenKeywords],
    keywordHideTargets: { ...DEFAULTS.keywordHideTargets }
  };

  function hasChromeStorage() {
    return (
      typeof chrome !== "undefined" &&
      chrome.storage &&
      chrome.storage.sync
    );
  }

  function notifyActiveTabKeywordHideState() {
    if (!chrome?.tabs?.query || !chrome?.tabs?.sendMessage) return;

    const message = {
      type: "DCB_KEYWORD_HIDE_LIVE",
      enabled: Boolean(state.keywordHideEnabled),
      hiddenKeywords: [...state.hiddenKeywords],
      targets: { ...state.keywordHideTargets }
    };

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (chrome.runtime?.lastError) return;
      const tabId = tabs?.[0]?.id;
      if (!tabId) return;
      chrome.tabs.sendMessage(tabId, message, () => void chrome.runtime?.lastError);
    });
  }

  function $(id) {
    return document.getElementById(id);
  }

  function normalizeKeyword(value) {
    return String(value || "")
      .normalize("NFKC")
      .trim();
  }

  function keywordCompareKey(value) {
    return normalizeKeyword(value).toLowerCase();
  }

  function normalizeKeywordList(list) {
    const seen = new Set();
    const out = [];

    (Array.isArray(list) ? list : []).forEach((raw) => {
      const keyword = normalizeKeyword(raw).replace(/\s+/g, " ");
      const key = keyword.toLowerCase();

      if (!keyword || seen.has(key)) return;

      seen.add(key);
      out.push(keyword);
    });

    return out;
  }

  function escapeHtml(value) {
    return String(value || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function detectContext() {
    return (
      CONTEXTS.find((context) => {
        return (
          $(context.enabled) ||
          $(context.input) ||
          $(context.add) ||
          $(context.list)
        );
      }) || null
    );
  }

  function getTargetElement(key) {
    if (!activeContext) return null;
    return $(activeContext.targets[key]);
  }

  function setStatus(message) {
    if (!activeContext || !activeContext.status) return;

    const status = $(activeContext.status);
    if (!status) return;

    status.textContent = message || "";

    if (message) {
      window.clearTimeout(setStatus._timer);
      setStatus._timer = window.setTimeout(() => {
        status.textContent = "";
      }, 1600);
    }
  }

  function applyStoredState(config = {}) {
    const srcTargets = config.keywordHideTargets && typeof config.keywordHideTargets === "object"
      ? config.keywordHideTargets
      : {};

    state = {
      keywordHideEnabled: Boolean(config.keywordHideEnabled),
      hiddenKeywords: normalizeKeywordList(config.hiddenKeywords),
      keywordHideTargets: {
        listTitle: typeof srcTargets.listTitle === "boolean" ? srcTargets.listTitle : DEFAULTS.keywordHideTargets.listTitle,
        viewTitle: typeof srcTargets.viewTitle === "boolean" ? srcTargets.viewTitle : DEFAULTS.keywordHideTargets.viewTitle,
        viewBody: typeof srcTargets.viewBody === "boolean" ? srcTargets.viewBody : DEFAULTS.keywordHideTargets.viewBody,
        comments: typeof srcTargets.comments === "boolean" ? srcTargets.comments : DEFAULTS.keywordHideTargets.comments
      }
    };
  }

  function loadState(callback) {
    if (!hasChromeStorage()) return;

    const requestedAtRevision = stateMutationRevision;
    const applyIfCurrent = (config) => {
      if (requestedAtRevision !== stateMutationRevision) return;
      applyStoredState({ ...DEFAULTS, ...(config || {}) });
      callback();
    };

    const cached = uiCache?.read?.(DEFAULTS);
    if (cached) applyIfCurrent(cached);

    if (uiCache?.ready) {
      uiCache.ready.then(applyIfCurrent).catch(() => {});
    } else {
      chrome.storage.sync.get(DEFAULTS, applyIfCurrent);
    }
  }

  function refreshStateAfterWrites() {
    if (pendingSaveCount > 0 || !deferredStorageRefresh) return;
    deferredStorageRefresh = false;
    loadState(render);
  }

  function persistKeywordSettingsPatch(patch, callback) {
    const done = typeof callback === "function" ? callback : () => {};
    const fallback = () => {
      chrome.storage.sync.set(patch, () => done(!chrome.runtime?.lastError));
    };

    if (!chrome?.runtime?.sendMessage) {
      fallback();
      return;
    }

    chrome.runtime.sendMessage({ type: "dcb.keywordSettings.patch", patch }, (response) => {
      if (chrome.runtime?.lastError || response?.ok !== true) {
        fallback();
        return;
      }
      done(true);
    });
  }

  function saveState(partial, message) {
    if (!hasChromeStorage()) return;

    const nextPartial = { ...partial };

    if (Object.prototype.hasOwnProperty.call(nextPartial, "hiddenKeywords")) {
      nextPartial.hiddenKeywords = normalizeKeywordList(nextPartial.hiddenKeywords);
    }

    stateMutationRevision += 1;
    state = {
      ...state,
      ...nextPartial,
      keywordHideTargets: {
        ...state.keywordHideTargets,
        ...(nextPartial.keywordHideTargets || {})
      }
    };

    uiCache?.merge?.(nextPartial);
    render();
    notifyActiveTabKeywordHideState();
    setStatus(message || "저장 중...");

    const snapshot = { ...nextPartial };
    if (snapshot.keywordHideTargets) {
      snapshot.keywordHideTargets = { ...snapshot.keywordHideTargets };
    }
    if (snapshot.hiddenKeywords) {
      snapshot.hiddenKeywords = [...snapshot.hiddenKeywords];
    }

    pendingSaveCount += 1;
    saveQueue = saveQueue.then(() => new Promise((resolve) => {
      persistKeywordSettingsPatch(snapshot, (saved) => {
        const failed = !saved;
        pendingSaveCount = Math.max(0, pendingSaveCount - 1);

        if (failed) {
          console.warn("[DCB] keyword hide save failed:", chrome.runtime.lastError?.message || "unknown");
          deferredStorageRefresh = true;
        }

        if (pendingSaveCount === 0) {
          if (!failed) setStatus(message || "저장되었습니다.");
          refreshStateAfterWrites();
        }
        resolve();
      });
    }));
  }

  function render() {
    if (!activeContext) return;

    const enabled = $(activeContext.enabled);
    if (enabled) {
      enabled.checked = Boolean(state.keywordHideEnabled);
    }

    Object.keys(DEFAULTS.keywordHideTargets).forEach((key) => {
      const input = getTargetElement(key);
      if (input) {
        input.checked = Boolean(state.keywordHideTargets[key]);
      }
    });

    renderKeywordList();
  }

  function renderKeywordList() {
    if (!activeContext) return;

    const list = $(activeContext.list);
    if (!list) return;

    const keywords = normalizeKeywordList(state.hiddenKeywords);
    state.hiddenKeywords = keywords;

    if (activeContext.count) {
      const count = $(activeContext.count);
      if (count) count.textContent = `${keywords.length}개`;
    }

    list.replaceChildren();
    list.classList.toggle("is-empty", !keywords.length);
    list.classList.toggle("has-keywords", keywords.length > 0);
    list.removeAttribute("hidden");
    list.style.display = "flex";

    if (!keywords.length) {
      const li = document.createElement("li");
      li.className = "keyword-empty";
      li.textContent = "등록된 숨김 키워드가 없습니다.";
      list.appendChild(li);
      return;
    }

    keywords.forEach((keyword, index) => {
      const li = document.createElement("li");

      const code = document.createElement("code");
      code.textContent = keyword;
      code.title = keyword;

      const button = document.createElement("button");
      button.type = "button";
      button.className = "btn btn-danger";
      button.setAttribute("data-hide-keyword-remove", String(index));
      button.textContent = "삭제";

      li.append(code, button);
      list.appendChild(li);
    });
  }

  function parseKeywordInput(rawValue) {
    const source = normalizeKeyword(rawValue);
    if (!source) return [];

    return source
      .split(",")
      .map(normalizeKeyword)
      .filter(Boolean);
  }

  function addKeyword() {
    if (!activeContext) return;

    const input = $(activeContext.input);
    if (!input) return;

    const additions = parseKeywordInput(input.value);
    if (!additions.length) {
      input.focus();
      return;
    }

    const current = Array.isArray(state.hiddenKeywords)
      ? [...state.hiddenKeywords]
      : [];

    const seen = new Set(current.map(keywordCompareKey));
    const filtered = [];

    additions.forEach((keyword) => {
      const key = keywordCompareKey(keyword);
      if (seen.has(key)) return;

      seen.add(key);
      filtered.push(keyword);
    });

    if (!filtered.length) {
      input.value = "";
      input.focus();
      setStatus("이미 등록된 숨김 키워드입니다.");
      return;
    }

    saveState(
      {
        hiddenKeywords: [...current, ...filtered]
      },
      "숨김 키워드가 추가되었습니다."
    );

    input.value = "";
    input.focus();
  }

  function removeKeyword(index) {
    const current = Array.isArray(state.hiddenKeywords)
      ? [...state.hiddenKeywords]
      : [];

    if (index < 0 || index >= current.length) return;

    current.splice(index, 1);

    saveState(
      {
        hiddenKeywords: current
      },
      "숨김 키워드가 삭제되었습니다."
    );
  }

  function bindEnabled() {
    const enabled = $(activeContext.enabled);
    if (!enabled) return;

    enabled.addEventListener("change", () => {
      saveState(
        {
          keywordHideEnabled: Boolean(enabled.checked)
        },
        Boolean(enabled.checked)
          ? "키워드 숨기기 모드가 켜졌습니다."
          : "키워드 숨기기 모드가 꺼졌습니다."
      );
    });
  }

  function bindTargets() {
    Object.keys(DEFAULTS.keywordHideTargets).forEach((key) => {
      const input = getTargetElement(key);
      if (!input) return;

      input.addEventListener("change", () => {
        saveState(
          {
            keywordHideTargets: {
              ...state.keywordHideTargets,
              [key]: Boolean(input.checked)
            }
          },
          "차단 대상이 저장되었습니다."
        );
      });
    });
  }

  function createImeGuard() {
    let isComposing = false;
    let pendingEnter = false;
    let lastCompositionEndAt = 0;

    function markCompositionStart() {
      isComposing = true;
    }

    function markCompositionEnd(onCommitted) {
      isComposing = false;
      lastCompositionEndAt = Date.now();

      if (!pendingEnter) return;
      pendingEnter = false;
      window.setTimeout(() => onCommitted?.(), 0);
    }

    function handleEnter(event, onCommitted) {
      if (event.key !== "Enter") return false;

      if (isComposing || event.isComposing || event.keyCode === 229 || event.which === 229) {
        // IME 조합을 끝내는 Enter라면 compositionend 후 완성 문자열을 등록한다.
        pendingEnter = true;
        return true;
      }

      if (Date.now() - lastCompositionEndAt < IME_FINALIZE_GRACE_MS) {
        return true;
      }

      event.preventDefault();
      onCommitted?.();
      return true;
    }

    return {
      markCompositionStart,
      markCompositionEnd,
      handleEnter
    };
  }

  function bindKeywordInput() {
    const input = $(activeContext.input);
    const addButton = $(activeContext.add);
    const list = $(activeContext.list);
    const imeGuard = createImeGuard();

    if (addButton) {
      addButton.addEventListener("click", addKeyword);
    }

    if (input) {
      input.addEventListener("compositionstart", () => {
        imeGuard.markCompositionStart();
      });

      input.addEventListener("compositionend", () => {
        imeGuard.markCompositionEnd(addKeyword);
      });

      input.addEventListener("keydown", (event) => {
        imeGuard.handleEnter(event, addKeyword);
      });
    }

    if (list) {
      list.addEventListener("click", (event) => {
        const button = event.target.closest("[data-hide-keyword-remove]");
        if (!button) return;

        const index = Number(button.getAttribute("data-hide-keyword-remove"));
        removeKeyword(index);
      });
    }
  }

  function forceRefreshFromStorage() {
    loadState(render);
  }

  function bindRefreshHooks() {
    window.addEventListener("focus", forceRefreshFromStorage);

    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) forceRefreshFromStorage();
    });

    document.addEventListener("dcb:keyword-hide-ui-refresh", forceRefreshFromStorage);
  }

  function bindStorageChanges() {
    if (
      typeof chrome === "undefined" ||
      !chrome.storage ||
      !chrome.storage.onChanged
    ) {
      return;
    }

    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "sync") return;

      const touched =
        changes.keywordHideEnabled ||
        changes.hiddenKeywords ||
        changes.keywordHideTargets;

      if (!touched) return;

      if (pendingSaveCount > 0) {
        deferredStorageRefresh = true;
        return;
      }

      loadState(render);
    });
  }

  function bind() {
    bindEnabled();
    bindTargets();
    bindKeywordInput();
    bindStorageChanges();
    bindRefreshHooks();
  }

  function init() {
    if (!hasChromeStorage()) return;

    activeContext = detectContext();
    if (!activeContext) return;

    // Bind controls immediately. Previously binding waited for the asynchronous
    // storage hydration, so a freshly opened popup could ignore Add/Enter for
    // roughly a storage round-trip. Render the fast UI snapshot first, then
    // hydrate from storage without blocking interaction.
    const cached = uiCache?.read?.(DEFAULTS);
    if (cached) applyStoredState({ ...DEFAULTS, ...cached });
    render();
    bind();

    loadState(() => {
      render();
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();

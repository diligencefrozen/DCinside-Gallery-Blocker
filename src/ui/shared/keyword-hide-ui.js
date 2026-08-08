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

  let activeContext = null;
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

  function loadState(callback) {
    if (!hasChromeStorage()) return;

    chrome.storage.sync.get(DEFAULTS, (config) => {
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

      callback();
    });
  }

  function saveState(partial, message) {
    if (!hasChromeStorage()) return;

    const nextPartial = { ...partial };

    if (Object.prototype.hasOwnProperty.call(nextPartial, "hiddenKeywords")) {
      nextPartial.hiddenKeywords = normalizeKeywordList(nextPartial.hiddenKeywords);
    }

    state = {
      ...state,
      ...nextPartial,
      keywordHideTargets: {
        ...state.keywordHideTargets,
        ...(nextPartial.keywordHideTargets || {})
      }
    };

    chrome.storage.sync.set(nextPartial, () => {
      render();
      setStatus(message || "저장되었습니다.");
    });
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
    let lastCompositionEndAt = 0;

    function markCompositionStart() {
      isComposing = true;
    }

    function markCompositionEnd() {
      isComposing = false;
      lastCompositionEndAt = Date.now();
    }

    function isImeEnterEvent(event) {
      const recentlyEnded =
        Date.now() - lastCompositionEndAt < IME_FINALIZE_GRACE_MS;

      return (
        isComposing ||
        event.isComposing ||
        event.keyCode === 229 ||
        event.which === 229 ||
        recentlyEnded
      );
    }

    return {
      markCompositionStart,
      markCompositionEnd,
      isImeEnterEvent
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
        imeGuard.markCompositionEnd();
      });

      input.addEventListener("keydown", (event) => {
        if (event.key !== "Enter") return;

        // 한글/일본어/중국어 IME 조합 확정용 Enter는 키워드 추가로 처리하지 않습니다.
        // 일부 Chromium 환경에서는 compositionend 직후 keydown Enter가 들어와서
        // 마지막 글자만 별도 키워드로 추가되는 문제가 발생할 수 있습니다.
        if (imeGuard.isImeEnterEvent(event)) {
          return;
        }

        event.preventDefault();
        addKeyword();
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

    loadState(() => {
      render();
      bind();
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();

/*****************************************************************
 * dccon-block-store.js - 선택 디시콘/디시콘 그룹 차단 저장소
 *****************************************************************/
(() => {
  if (globalThis.DCBDcconBlockStore) return;

  const STATE_KEY = "dcbDcconBlockState";
  const STATE_VERSION = 1;
  const MAX_CODE_LENGTH = 2048;

  const cleanText = (value, max = 120) => String(value || "")
    .normalize("NFKC")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);

  const decodeComponent = (value) => {
    try {
      return decodeURIComponent(value);
    } catch (_) {
      return value;
    }
  };

  function normalizeCode(value) {
    const code = decodeComponent(String(value || "").trim())
      .replace(/^['"]|['"]$/g, "")
      .trim();

    if (code.length < 16 || code.length > MAX_CODE_LENGTH) return "";
    return /^[a-z0-9_-]+$/i.test(code) ? code : "";
  }

  function extractCode(value) {
    const raw = String(value || "")
      .replace(/&amp;/gi, "&")
      .trim();

    if (!raw) return "";

    const direct = normalizeCode(raw);
    if (direct) return direct;

    try {
      const url = new URL(raw, "https://gall.dcinside.com/");
      if (/\/dccon\.php$/i.test(url.pathname)) {
        return normalizeCode(url.searchParams.get("no"));
      }
    } catch (_) {}

    if (!/dccon\.php/i.test(raw)) return "";
    const match = raw.match(/dccon\.php[^#\s'"<>]*?[?&]no=([^&#\s'"<>]+)/i)
      || raw.match(/dccon\.php\?no=([^&#\s'"<>]+)/i);
    return normalizeCode(match?.[1]);
  }

  function uniqueCodes(values) {
    const out = [];
    const seen = new Set();

    (Array.isArray(values) ? values : []).forEach((value) => {
      const code = extractCode(value);
      if (!code || seen.has(code)) return;
      seen.add(code);
      out.push(code);
    });

    return out;
  }

  function normalizeItemRecord(value, fallbackCode = "") {
    const source = value && typeof value === "object" ? value : {};
    const code = extractCode(source.code || fallbackCode);
    if (!code) return null;

    return {
      code,
      label: cleanText(source.label || source.title || "개별 디시콘"),
      packageIdx: cleanText(source.packageIdx, 40),
      packageTitle: cleanText(source.packageTitle || source.groupTitle),
      blockedAt: Number(source.blockedAt) || Date.now()
    };
  }

  function normalizeGroupRecord(value, fallbackPackageIdx = "") {
    const source = value && typeof value === "object" ? value : {};
    const packageIdx = cleanText(source.packageIdx || fallbackPackageIdx, 40);
    const paths = uniqueCodes(source.paths || source.codes || []);

    if (!packageIdx || !/^\d+$/.test(packageIdx) || !paths.length) return null;

    return {
      packageIdx,
      title: cleanText(source.title || source.packageTitle || `디시콘 그룹 ${packageIdx}`),
      paths,
      iconCount: Math.max(paths.length, Number.parseInt(source.iconCount, 10) || 0),
      blockedAt: Number(source.blockedAt) || Date.now()
    };
  }

  function emptyState() {
    return {
      version: STATE_VERSION,
      items: {},
      groups: {}
    };
  }

  function normalizeState(value) {
    const source = value && typeof value === "object" ? value : {};
    const next = emptyState();

    Object.entries(source.items && typeof source.items === "object" ? source.items : {})
      .forEach(([key, record]) => {
        const normalized = normalizeItemRecord(record, key);
        if (normalized) next.items[normalized.code] = normalized;
      });

    Object.entries(source.groups && typeof source.groups === "object" ? source.groups : {})
      .forEach(([key, record]) => {
        const normalized = normalizeGroupRecord(record, key);
        if (normalized) next.groups[normalized.packageIdx] = normalized;
      });

    return next;
  }

  function blockedCodeSet(value) {
    const state = normalizeState(value);
    const result = new Set(Object.keys(state.items));

    Object.values(state.groups).forEach((group) => {
      group.paths.forEach((code) => result.add(code));
    });

    return result;
  }

  async function getState() {
    if (!globalThis.chrome?.storage?.local) return emptyState();
    const data = await chrome.storage.local.get({ [STATE_KEY]: emptyState() });
    return normalizeState(data?.[STATE_KEY]);
  }

  async function setState(value) {
    const state = normalizeState(value);
    if (!globalThis.chrome?.storage?.local) return state;
    await chrome.storage.local.set({ [STATE_KEY]: state });
    return state;
  }

  async function updateState(mutator) {
    const state = await getState();
    const changed = typeof mutator === "function" ? mutator(state) : state;
    return setState(changed || state);
  }

  async function addItem(value) {
    const incoming = normalizeItemRecord(value);
    if (!incoming) throw new Error("차단할 디시콘 식별값이 올바르지 않습니다.");

    return updateState((state) => {
      const current = state.items[incoming.code] || {};
      state.items[incoming.code] = normalizeItemRecord({
        ...current,
        ...incoming,
        blockedAt: Number(current.blockedAt) || incoming.blockedAt
      });
      return state;
    });
  }

  async function addGroup(value) {
    const incoming = normalizeGroupRecord(value);
    if (!incoming) throw new Error("디시콘 그룹 정보를 확인하지 못했습니다.");

    return updateState((state) => {
      state.groups[incoming.packageIdx] = incoming;
      incoming.paths.forEach((code) => delete state.items[code]);
      return state;
    });
  }

  async function removeItem(code) {
    const key = extractCode(code);
    return updateState((state) => {
      if (key) delete state.items[key];
      return state;
    });
  }

  async function removeGroup(packageIdx) {
    const key = cleanText(packageIdx, 40);
    return updateState((state) => {
      delete state.groups[key];
      return state;
    });
  }

  async function clearItems() {
    return updateState((state) => {
      state.items = {};
      return state;
    });
  }

  async function clearGroups() {
    return updateState((state) => {
      state.groups = {};
      return state;
    });
  }

  globalThis.DCBDcconBlockStore = Object.freeze({
    STATE_KEY,
    STATE_VERSION,
    emptyState,
    normalizeCode,
    extractCode,
    uniqueCodes,
    normalizeItemRecord,
    normalizeGroupRecord,
    normalizeState,
    blockedCodeSet,
    getState,
    setState,
    addItem,
    addGroup,
    removeItem,
    removeGroup,
    clearItems,
    clearGroups
  });
})();

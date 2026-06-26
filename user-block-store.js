/*****************************************************************
 * user-block-store.js
 *
 * User block list storage v2.
 * - Small options stay in chrome.storage.sync.
 * - Large user/IP block data lives in chrome.storage.local.
 * - The list is sharded into buckets so adding one user does not
 *   rewrite one huge array.
 *****************************************************************/
(function initDCBUserBlockStore(global) {
  if (global.DCBUserBlockStore) return;

  const LEGACY_KEY = "blockedUids";
  const META_KEY = "userBlock:v2:meta";
  const BUCKET_PREFIX = "userBlock:v2:bucket:";
  const BUCKET_COUNT = 256;

  function now() {
    return Date.now();
  }

  function normalizeNick(value) {
    const nick = String(value || "")
      .normalize("NFKC")
      .trim()
      .replace(/\s+/g, " ")
      .replace(/\((?:\d{1,3}\.){1,3}\d{0,3}\)\s*$/g, "")
      .trim();

    return nick.slice(0, 80);
  }

  function normalizeToken(value) {
    const raw = String(value || "").trim();
    const nickMatch = raw.match(/^nick\s*[:=]\s*(.+)$/i);
    if (nickMatch) {
      const nick = normalizeNick(nickMatch[1]);
      return nick ? `nick:${nick}` : "";
    }

    const clean = raw
      .replace(/^uid\s*[:=]\s*/i, "")
      .replace(/^ip\s*[:=]\s*/i, "")
      .replace(/^\(|\)$/g, "")
      .replace(/\s+/g, "")
      .trim();

    if (!clean) return "";

    const ip = normalizeIpPrefix(clean);
    if (ip && isIpLike(clean)) return ip;
    if (isUidLike(clean)) return clean;

    const implicitNick = normalizeNick(raw);
    return implicitNick ? `nick:${implicitNick}` : "";
  }

  function normalizeIpPrefix(value) {
    const m = String(value || "")
      .trim()
      .match(/\b(\d{1,3}\.\d{1,3})(?:\.\d{1,3}){0,2}\b/);

    return m ? m[1] : "";
  }

  function isIpLike(value) {
    return /^\d{1,3}(?:\.\d{1,3}){1,3}$/.test(String(value || "").trim());
  }

  function isUidLike(value) {
    return /^[A-Za-z0-9._-]{2,64}$/.test(String(value || "").trim());
  }

  function classifyToken(value) {
    const clean = normalizeToken(value);
    if (/^nick:/i.test(clean)) return "nick";
    return normalizeIpPrefix(clean) && isIpLike(clean) ? "ip" : "uid";
  }

  function tokenKey(value) {
    const clean = normalizeToken(value);
    return clean ? clean.toLowerCase() : "";
  }

  function makeBlockKey(value) {
    const clean = normalizeToken(value);
    if (!clean) return "";
    return `${classifyToken(clean)}:${tokenKey(clean)}`;
  }

  function normalizeList(values) {
    const out = [];
    const seen = new Set();

    (Array.isArray(values) ? values : []).forEach((value) => {
      const clean = normalizeToken(value);
      const key = makeBlockKey(clean);
      if (!clean || !key || seen.has(key)) return;
      seen.add(key);
      out.push(clean);
    });

    return out;
  }

  function hashStringFNV1a(str) {
    let hash = 0x811c9dc5;

    for (let i = 0; i < str.length; i += 1) {
      hash ^= str.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193);
    }

    return hash >>> 0;
  }

  function bucketIdForBlockKey(blockKey) {
    return (hashStringFNV1a(blockKey) & 0xff).toString(16).padStart(2, "0");
  }

  function bucketKeyForBlockKey(blockKey) {
    return `${BUCKET_PREFIX}${bucketIdForBlockKey(blockKey)}`;
  }

  function allBucketKeys() {
    return Array.from({ length: BUCKET_COUNT }, (_, idx) => (
      `${BUCKET_PREFIX}${idx.toString(16).padStart(2, "0")}`
    ));
  }

  function entryToToken(entry) {
    if (!entry) return "";
    if (typeof entry === "string") return normalizeToken(entry);
    if (typeof entry === "object") return normalizeToken(entry.token);
    return "";
  }

  function chromeLastErrorMessage() {
    try {
      return chrome.runtime?.lastError?.message || "";
    } catch (_) {
      return "";
    }
  }

  async function storageGet(area, keys) {
    return chrome.storage[area].get(keys);
  }

  async function storageSet(area, patch) {
    await chrome.storage[area].set(patch);
  }

  async function storageRemove(area, keys) {
    await chrome.storage[area].remove(keys);
  }

  function buildBuckets(values, previousCreatedAtByKey = {}) {
    const buckets = {};
    const cleanList = normalizeList(values);
    const stamp = now();

    cleanList.forEach((token) => {
      const blockKey = makeBlockKey(token);
      if (!blockKey) return;

      const bucketKey = bucketKeyForBlockKey(blockKey);
      if (!buckets[bucketKey]) buckets[bucketKey] = {};

      buckets[bucketKey][blockKey] = {
        token,
        type: classifyToken(token),
        createdAt: previousCreatedAtByKey[blockKey] || stamp,
        updatedAt: stamp
      };
    });

    return { buckets, list: cleanList };
  }

  async function readMeta() {
    const data = await storageGet("local", { [META_KEY]: null });
    const meta = data[META_KEY];

    return meta && typeof meta === "object" ? meta : null;
  }

  async function readAllBucketData() {
    const keys = allBucketKeys();
    return storageGet("local", keys);
  }

  async function collectExistingCreatedAt() {
    const data = await readAllBucketData();
    const out = {};

    Object.values(data).forEach((bucket) => {
      if (!bucket || typeof bucket !== "object") return;

      Object.entries(bucket).forEach(([blockKey, entry]) => {
        if (entry && typeof entry === "object" && entry.createdAt) {
          out[blockKey] = entry.createdAt;
        }
      });
    });

    return out;
  }

  async function writeAllTokens(values, extraMeta = {}) {
    const previousCreatedAtByKey = await collectExistingCreatedAt();
    const { buckets, list } = buildBuckets(values, previousCreatedAtByKey);
    const stamp = now();
    const patch = {};

    allBucketKeys().forEach((key) => {
      patch[key] = buckets[key] || {};
    });

    patch[META_KEY] = {
      version: 2,
      count: list.length,
      bucketCount: BUCKET_COUNT,
      localOnly: true,
      updatedAt: stamp,
      ...extraMeta
    };

    await storageSet("local", patch);
    return list;
  }

  async function migrateLegacyToBuckets() {
    const meta = await readMeta();
    if (meta?.version === 2 && meta.legacyImportedAt) return false;

    const [localLegacy, syncLegacy] = await Promise.all([
      storageGet("local", { [LEGACY_KEY]: [] }).catch(() => ({ [LEGACY_KEY]: [] })),
      storageGet("sync", { [LEGACY_KEY]: [] }).catch(() => ({ [LEGACY_KEY]: [] }))
    ]);

    const legacyList = normalizeList([
      ...(Array.isArray(localLegacy[LEGACY_KEY]) ? localLegacy[LEGACY_KEY] : []),
      ...(Array.isArray(syncLegacy[LEGACY_KEY]) ? syncLegacy[LEGACY_KEY] : [])
    ]);

    const legacyImportedAt = now();

    if (!legacyList.length) {
      await storageSet("local", {
        [META_KEY]: {
          version: 2,
          count: Number(meta?.count || 0),
          bucketCount: BUCKET_COUNT,
          localOnly: true,
          legacyImportedAt,
          updatedAt: legacyImportedAt
        }
      });
      return false;
    }

    const currentTokens = meta?.version === 2 ? await getAllTokensWithoutMigration() : [];
    const merged = normalizeList([...currentTokens, ...legacyList]);
    await writeAllTokens(merged, { legacyImportedAt });
    return true;
  }

  async function getAllTokensWithoutMigration() {
    const data = await readAllBucketData();
    const out = [];
    const seen = new Set();

    allBucketKeys().forEach((bucketKey) => {
      const bucket = data[bucketKey];
      if (!bucket || typeof bucket !== "object") return;

      Object.entries(bucket).forEach(([blockKey, entry]) => {
        const token = entryToToken(entry);
        const key = blockKey || makeBlockKey(token);
        if (!token || !key || seen.has(key)) return;
        seen.add(key);
        out.push(token);
      });
    });

    return out;
  }

  async function getAllTokens() {
    await migrateLegacyToBuckets();
    return getAllTokensWithoutMigration();
  }

  async function setAllTokens(values) {
    const meta = await readMeta();
    return writeAllTokens(values, {
      legacyImportedAt: meta?.legacyImportedAt || now()
    });
  }

  async function addToken(rawToken) {
    const token = normalizeToken(rawToken);

    if (!token) {
      return {
        ok: false,
        reason: "EMPTY_TOKEN",
        message: "작성자 영역에서 UID/IP를 찾지 못했습니다."
      };
    }

    await migrateLegacyToBuckets();

    const blockKey = makeBlockKey(token);
    const bucketKey = bucketKeyForBlockKey(blockKey);
    const stamp = now();

    try {
      const data = await storageGet("local", {
        [bucketKey]: {},
        [META_KEY]: {
          version: 2,
          count: 0,
          bucketCount: BUCKET_COUNT,
          localOnly: true,
          legacyImportedAt: stamp
        }
      });

      const bucket = data[bucketKey] && typeof data[bucketKey] === "object"
        ? { ...data[bucketKey] }
        : {};
      const meta = data[META_KEY] && typeof data[META_KEY] === "object"
        ? data[META_KEY]
        : { version: 2, count: 0, bucketCount: BUCKET_COUNT, localOnly: true };

      const alreadyBlocked = !!bucket[blockKey];

      if (!alreadyBlocked) {
        bucket[blockKey] = {
          token,
          type: classifyToken(token),
          createdAt: stamp,
          updatedAt: stamp
        };

        await storageSet("local", {
          [bucketKey]: bucket,
          [META_KEY]: {
            ...meta,
            version: 2,
            count: Number(meta.count || 0) + 1,
            bucketCount: BUCKET_COUNT,
            localOnly: true,
            legacyImportedAt: meta.legacyImportedAt || stamp,
            updatedAt: stamp
          }
        });
      }

      return {
        ok: true,
        token,
        added: !alreadyBlocked,
        alreadyBlocked,
        count: Number(meta.count || 0) + (alreadyBlocked ? 0 : 1)
      };
    } catch (error) {
      const message = error?.message || chromeLastErrorMessage() || String(error);

      if (/quota|exceed|bytes|storage/i.test(message)) {
        return {
          ok: false,
          reason: "LOCAL_QUOTA_EXCEEDED",
          message: "로컬 차단 저장소 한도에 도달했습니다. 대용량 로컬 저장 권한 또는 차단 목록 정리가 필요합니다."
        };
      }

      return {
        ok: false,
        reason: "STORAGE_ERROR",
        message
      };
    }
  }

  async function clearAllTokens() {
    const meta = await readMeta();
    await storageRemove("local", allBucketKeys());
    await storageSet("local", {
      [LEGACY_KEY]: [],
      [META_KEY]: {
        version: 2,
        count: 0,
        bucketCount: BUCKET_COUNT,
        localOnly: true,
        legacyImportedAt: meta?.legacyImportedAt || now(),
        updatedAt: now()
      }
    });
    return [];
  }

  async function getUsage() {
    if (!chrome.storage.local.getBytesInUse) {
      return { bytes: 0, quota: chrome.storage.local.QUOTA_BYTES || 0, ratio: 0 };
    }

    const bytes = await chrome.storage.local.getBytesInUse(null);
    const quota = chrome.storage.local.QUOTA_BYTES || 0;

    return {
      bytes,
      quota,
      ratio: quota ? bytes / quota : 0
    };
  }

  function isRelevantChange(changes) {
    if (!changes || typeof changes !== "object") return false;

    return Object.keys(changes).some((key) => (
      key === META_KEY || key === LEGACY_KEY || key.startsWith(BUCKET_PREFIX)
    ));
  }

  global.DCBUserBlockStore = {
    LEGACY_KEY,
    META_KEY,
    BUCKET_PREFIX,
    BUCKET_COUNT,
    normalizeToken,
    normalizeList,
    makeBlockKey,
    tokenKey,
    getAllTokens,
    setAllTokens,
    addToken,
    clearAllTokens,
    migrateLegacyToBuckets,
    getUsage,
    isRelevantChange
  };
})(globalThis);

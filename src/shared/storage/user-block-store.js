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
    const nickMatch = raw.match(/^(nick(?:-exact)?)\s*[:=]\s*(.+)$/i);
    if (nickMatch) {
      const nick = normalizeNick(nickMatch[2]);
      return nick ? `${nickMatch[1].toLowerCase()}:${nick}` : "";
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
    if (/^nick(?:-exact)?:/i.test(clean)) return "nick";
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

  async function clearLegacyStorageCopies() {
    await Promise.all([
      storageRemove("local", LEGACY_KEY).catch(() => {}),
      storageRemove("sync", LEGACY_KEY).catch(() => {})
    ]);
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
    if (meta?.version === 2 && meta.legacyImportedAt) {
      return false;
    }

    const [localLegacy, syncLegacy] = await Promise.all([
      storageGet("local", { [LEGACY_KEY]: [] }),
      storageGet("sync", { [LEGACY_KEY]: [] })
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

  async function getAllTokensReadOnly() {
    const meta = await readMeta();
    if (meta?.version === 2) return getAllTokensWithoutMigration();

    const [localLegacy, syncLegacy] = await Promise.all([
      storageGet("local", { [LEGACY_KEY]: [] }),
      storageGet("sync", { [LEGACY_KEY]: [] })
    ]);

    return normalizeList([
      ...(Array.isArray(localLegacy[LEGACY_KEY]) ? localLegacy[LEGACY_KEY] : []),
      ...(Array.isArray(syncLegacy[LEGACY_KEY]) ? syncLegacy[LEGACY_KEY] : [])
    ]);
  }

  async function setAllTokens(values) {
    const meta = await readMeta();
    const list = await writeAllTokens(values, {
      legacyImportedAt: meta?.legacyImportedAt || now()
    });
    await clearLegacyStorageCopies();
    return list;
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

    const blockKey = makeBlockKey(token);
    const bucketKey = bucketKeyForBlockKey(blockKey);
    const stamp = now();

    try {
      await migrateLegacyToBuckets();
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

  async function hasToken(rawToken) {
    const token = normalizeToken(rawToken);
    if (!token) return false;

    const meta = await readMeta();
    if (meta?.version !== 2) {
      const targetKey = makeBlockKey(token);
      const legacyTokens = await getAllTokensReadOnly();
      return legacyTokens.some((value) => makeBlockKey(value) === targetKey);
    }

    const blockKey = makeBlockKey(token);
    const bucketKey = bucketKeyForBlockKey(blockKey);
    const data = await storageGet("local", { [bucketKey]: {} });
    const bucket = data[bucketKey];

    return !!(bucket && typeof bucket === "object" && bucket[blockKey]);
  }

  async function removeToken(rawToken) {
    const token = normalizeToken(rawToken);

    if (!token) {
      return {
        ok: false,
        reason: "EMPTY_TOKEN",
        message: "차단 해제할 UID/IP/닉네임을 찾지 못했습니다."
      };
    }

    const blockKey = makeBlockKey(token);
    const bucketKey = bucketKeyForBlockKey(blockKey);
    const stamp = now();

    try {
      await migrateLegacyToBuckets();
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
      const removed = !!bucket[blockKey];
      const count = Math.max(0, Number(meta.count || 0) - (removed ? 1 : 0));

      if (removed) {
        delete bucket[blockKey];

        await storageSet("local", {
          [bucketKey]: bucket,
          [META_KEY]: {
            ...meta,
            version: 2,
            count,
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
        removed,
        alreadyUnblocked: !removed,
        blocked: false,
        action: removed ? "unblocked" : "unchanged",
        count
      };
    } catch (error) {
      return {
        ok: false,
        reason: "STORAGE_ERROR",
        message: error?.message || chromeLastErrorMessage() || String(error)
      };
    }
  }

  async function removeTokens(rawTokens) {
    const tokens = normalizeList(rawTokens);
    if (!tokens.length) {
      return {
        ok: false,
        reason: "EMPTY_TOKEN",
        message: "차단 해제할 UID/IP/닉네임을 찾지 못했습니다."
      };
    }

    const stamp = now();

    try {
      await migrateLegacyToBuckets();

      const targets = tokens.map((token) => {
        const blockKey = makeBlockKey(token);
        return { token, blockKey, bucketKey: bucketKeyForBlockKey(blockKey) };
      });
      const bucketKeys = Array.from(new Set(targets.map(({ bucketKey }) => bucketKey)));
      const data = await storageGet("local", [...bucketKeys, META_KEY]);
      const meta = data[META_KEY] && typeof data[META_KEY] === "object"
        ? data[META_KEY]
        : { version: 2, count: 0, bucketCount: BUCKET_COUNT, localOnly: true };
      const buckets = new Map(bucketKeys.map((bucketKey) => [
        bucketKey,
        data[bucketKey] && typeof data[bucketKey] === "object" ? { ...data[bucketKey] } : {}
      ]));
      const removedTokens = [];
      const changedBucketKeys = new Set();

      targets.forEach(({ token, blockKey, bucketKey }) => {
        const bucket = buckets.get(bucketKey);
        if (!bucket?.[blockKey]) return;
        delete bucket[blockKey];
        removedTokens.push(token);
        changedBucketKeys.add(bucketKey);
      });

      const count = Math.max(0, Number(meta.count || 0) - removedTokens.length);
      if (removedTokens.length) {
        const patch = {};
        changedBucketKeys.forEach((bucketKey) => {
          patch[bucketKey] = buckets.get(bucketKey);
        });
        patch[META_KEY] = {
          ...meta,
          version: 2,
          count,
          bucketCount: BUCKET_COUNT,
          localOnly: true,
          legacyImportedAt: meta.legacyImportedAt || stamp,
          updatedAt: stamp
        };
        await storageSet("local", patch);
      }

      return {
        ok: true,
        token: removedTokens[0] || tokens[0],
        tokens: removedTokens,
        removed: removedTokens.length > 0,
        removedCount: removedTokens.length,
        alreadyUnblocked: removedTokens.length === 0,
        blocked: false,
        action: removedTokens.length ? "unblocked" : "unchanged",
        count
      };
    } catch (error) {
      return {
        ok: false,
        reason: "STORAGE_ERROR",
        message: error?.message || chromeLastErrorMessage() || String(error)
      };
    }
  }

  async function toggleToken(rawToken) {
    const token = normalizeToken(rawToken);

    if (!token) {
      return {
        ok: false,
        reason: "EMPTY_TOKEN",
        message: "차단 상태를 바꿀 UID/IP/닉네임을 찾지 못했습니다."
      };
    }

    const blockKey = makeBlockKey(token);
    const bucketKey = bucketKeyForBlockKey(blockKey);
    const stamp = now();

    try {
      await migrateLegacyToBuckets();
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
      const wasBlocked = !!bucket[blockKey];
      const blocked = !wasBlocked;

      if (wasBlocked) {
        delete bucket[blockKey];
      } else {
        bucket[blockKey] = {
          token,
          type: classifyToken(token),
          createdAt: stamp,
          updatedAt: stamp
        };
      }

      const count = Math.max(0, Number(meta.count || 0) + (blocked ? 1 : -1));

      await storageSet("local", {
        [bucketKey]: bucket,
        [META_KEY]: {
          ...meta,
          version: 2,
          count,
          bucketCount: BUCKET_COUNT,
          localOnly: true,
          legacyImportedAt: meta.legacyImportedAt || stamp,
          updatedAt: stamp
        }
      });

      return {
        ok: true,
        token,
        added: blocked,
        removed: !blocked,
        blocked,
        action: blocked ? "blocked" : "unblocked",
        count
      };
    } catch (error) {
      const message = error?.message || chromeLastErrorMessage() || String(error);

      if (/quota|exceed|bytes|storage/i.test(message)) {
        return {
          ok: false,
          reason: "LOCAL_QUOTA_EXCEEDED",
          message: "로컬 차단 저장소 한도에 도달했습니다. 차단 목록 정리가 필요합니다."
        };
      }

      return {
        ok: false,
        reason: "STORAGE_ERROR",
        message
      };
    }
  }

  async function patchMemos(entries) {
    const { userMemos = {} } = await storageGet("local", { userMemos:{} });
    const current = {...userMemos};
    for (const [key, value] of entries) {
      if (typeof key !== "string" || ["__proto__", "constructor", "prototype"].includes(key)) throw Error("메모 키 오류");
      if (value === null) delete current[key];
      else current[key] = {...current[key], ...value};
    }
    await storageSet("local", {userMemos:current});
    return {ok:true};
  }

  const RECORDS_TRANSACTION_KEY = "dcbRecordsImportPending";
  const NATIVE_METADATA_KEY = "dcbNativeImportMetadata";
  const KEYWORD_OWNERS_KEY = "dcbNativeKeywordOwners";
  const ownKeywordChanges = [];
  const keywordKey = value => String(value).normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
  const sameValue = (a, b) => JSON.stringify(a) === JSON.stringify(b);

  function consumeRecordsKeywordChange(before = [], after = []) {
    const index = ownKeywordChanges.findIndex(change => sameValue(change.before, before) && sameValue(change.after, after));
    if (index < 0) return false;
    ownKeywordChanges.splice(index, 1);
    return true;
  }

  async function writeRecordsKeywords(before, after) {
    const change = { before: before.slice(), after: after.slice() };
    ownKeywordChanges.push(change);
    try { await storageSet("sync", { blockedKeywords: after }); }
    catch (error) {
      const index = ownKeywordChanges.indexOf(change);
      if (index >= 0) ownKeywordChanges.splice(index, 1);
      throw error;
    }
  }

  // This is deliberately stricter than the legacy paste importer. The native
  // website's opaque identification code is not evidence of a member UID.
  function planNativeRecords(records) {
    if (!Array.isArray(records) || records.length > 20000 || JSON.stringify(records).length > 4194304)
      throw Error("직접 가져오기 목록이 너무 크거나 형식이 올바르지 않습니다.");
    const plan = { memos: [], tokens: [], keywords: [], rows: [], held: [], duplicates: 0, metadata: [] };
    const seen = new Map();
    for (const raw of records) {
      const record = {
        kind: raw?.kind, source: raw?.source, scope: raw?.scope,
        galleryId: raw?.galleryId || "", galleryType: raw?.galleryType || "",
        enabled: typeof raw?.enabled === "boolean" ? raw.enabled : null,
        targetType: raw?.targetType === "word" ? "keyword" : raw?.targetType,
        value: typeof raw?.value === "string" ? raw.value.trim() : "",
        identityVerified: raw?.identityVerified === true
      };
      if (typeof raw?.nativeTargetType === "string" && raw.nativeTargetType.length <= 40)
        record.nativeTargetType = raw.nativeTargetType;
      if (raw?.nativeScopeModel === "gallery-id") record.nativeScopeModel = "gallery-id";
      if (record.kind === "memo") {
        record.memo = raw.memo;
        record.color = raw.color;
      }
      let reason = "", token, memoKey, keyword;
      if (record.source !== "dc-native" || !["block", "memo"].includes(record.kind) ||
          !["global", "gallery"].includes(record.scope) || !record.value || record.value.length > 500 ||
          typeof record.galleryId !== "string" || typeof record.galleryType !== "string" || record.galleryType.length > 40)
        reason = "출처·범위·값 형식을 확인할 수 없음";
      else if (record.scope === "gallery" && !/^[a-z0-9_]{1,80}$/i.test(record.galleryId))
        reason = "갤러리 ID를 확인할 수 없음";
      else if (record.scope === "global" && record.galleryId)
        reason = "전체 범위에 갤러리 ID가 함께 있음";
      else if (record.kind === "block" && record.scope === "gallery")
        reason = "갤러리별 차단은 아직 지원하지 않습니다";
      else if (record.kind === "memo" && record.scope === "gallery" && record.nativeScopeModel !== "gallery-id")
        reason = "갤러리 종류를 포함한 메모 범위를 기존 저장 키로 보존할 수 없어 보류";
      else if (record.kind === "block" && record.enabled !== true)
        reason = record.enabled === false ? "디시에서 OFF인 규칙" : "디시 차단 활성 상태를 확인할 수 없음";
      else if (record.targetType === "id") reason = "식별 코드와 회원 UID의 대응이 확인되지 않음";
      else if (record.targetType === "uid" && (!record.identityVerified || !/^[a-z0-9._-]{2,64}$/i.test(record.value) ||
          classifyToken(record.value) !== "uid" || normalizeToken(record.value) !== record.value))
        reason = "회원 UID를 확실하게 확인할 수 없음";
      else if (record.targetType === "ip" && (!/^\d{1,3}\.\d{1,3}$/.test(record.value) ||
          !record.value.split(".").every(n => Number(n) <= 255)))
        reason = "확장은 IP 앞 두 자리만 지원하며 전체 IP의 범위를 넓혀 가져오지 않음";
      else if (record.kind === "memo" && (!["uid", "ip"].includes(record.targetType) ||
          typeof record.memo !== "string" || !record.memo.trim() || record.memo.length > 80 ||
          typeof record.color !== "string" || !/^#[a-f\d]{6}$/i.test(record.color)))
        reason = "메모 식별자·본문·색상을 보존할 수 없음";
      else if (record.kind === "block" && record.targetType === "nick" &&
          (normalizeNick(record.value) !== record.value || /^(?:ㅇㅇ|익명|무명|유동|유동닉|anonymous)$/i.test(record.value)))
        reason = "닉네임을 변형 없이 안전하게 구분할 수 없음";
      else if (!["keyword", "uid", "nick", "ip"].includes(record.targetType))
        reason = "지원하지 않는 차단 유형";
      if (!reason) {
        if (record.kind === "memo") memoKey = (record.scope === "global" ? "" : "gallery:" + record.galleryId + ":") + record.targetType + ":" + record.value;
        else if (record.targetType === "keyword") keyword = record.value.normalize("NFKC").replace(/\s+/g, " ");
        else token = record.targetType === "nick" ? "nick-exact:" + record.value : record.value;
      }
      const key = JSON.stringify([record.kind, record.scope, record.galleryId, record.galleryType, record.targetType,
        keyword ? keywordKey(keyword) : token ? makeBlockKey(token) : record.value]);
      const row = { record, key, status: reason ? "held" : "applicable", reason, token, memoKey, keyword };
      if (reason) plan.held.push(row);
      else if (seen.has(key)) {
        plan.duplicates++;
        row.status = "duplicate";
        row.reason = sameValue(record, seen.get(key)) ? "수집 목록 내 중복" : "수집 목록 내 같은 식별자의 값 충돌: 첫 항목 유지";
      } else {
        seen.set(key, record);
        plan.metadata.push([key, record]);
        if (memoKey) plan.memos.push([memoKey, { ...record, type: record.targetType,
          scope: record.scope === "global" ? "global" : record.galleryId,
          uid: record.targetType === "uid" ? record.value : "", ip: record.targetType === "ip" ? record.value : "", nickname: "" }]);
        if (token) plan.tokens.push(token);
        if (keyword) plan.keywords.push(keyword);
      }
      plan.rows.push(row);
    }
    return plan;
  }

  // local and sync cannot share an atomic write. A durable pending record is
  // written before touching sync; the final local write clears it atomically
  // with buckets/memos/undo. A worker interrupted between those writes rolls
  // back only the keyword delta, retaining unrelated edits.
  async function recoverRecordsImport() {
    const data = await storageGet("local", RECORDS_TRANSACTION_KEY);
    const pending = data[RECORDS_TRANSACTION_KEY];
    if (!pending) return false;
    if (!Array.isArray(pending.added) || !Array.isArray(pending.removed)) throw Error("가져오기 복구 기록 형식 오류");
    const { blockedKeywords = [] } = await storageGet("sync", { blockedKeywords: [] });
    const added = new Set(pending.added.map(keywordKey));
    const restored = blockedKeywords.filter(word => !added.has(keywordKey(word)));
    const keys = new Set(restored.map(keywordKey));
    for (const word of pending.removed) if (!keys.has(keywordKey(word))) {
      restored.push(word); keys.add(keywordKey(word));
    }
    if (!sameValue(restored, blockedKeywords)) await writeRecordsKeywords(blockedKeywords, restored);
    await storageSet("local", { [RECORDS_TRANSACTION_KEY]: null });
    return true;
  }

  async function invalidateKeywordImportOwnership(keywords) {
    const data = await storageGet("local", KEYWORD_OWNERS_KEY);
    const owners = { ...data[KEYWORD_OWNERS_KEY] }, labels = new Set(Array.isArray(keywords) ? keywords : []);
    let changed = false;
    for (const [key, owner] of Object.entries(owners)) if (!labels.has(owner.label)) {
      delete owners[key]; changed = true;
    }
    if (changed) await storageSet("local", { [KEYWORD_OWNERS_KEY]: owners });
  }

  async function commitRecordsPatch(patch, keywordChange) {
    if (!keywordChange) return storageSet("local", patch);
    const { before, after } = keywordChange;
    const beforeKeys = new Set(before.map(keywordKey)), afterKeys = new Set(after.map(keywordKey));
    await storageSet("local", { [RECORDS_TRANSACTION_KEY]: {
      added: after.filter(word => !beforeKeys.has(keywordKey(word))),
      removed: before.filter(word => !afterKeys.has(keywordKey(word)))
    } });
    try {
      await writeRecordsKeywords(before, after);
      await storageSet("local", { ...patch, [RECORDS_TRANSACTION_KEY]: null });
    } catch (error) {
      try { await recoverRecordsImport(); }
      catch (recoveryError) { throw Error("저장 실패. 복구가 보류되어 다음 실행에서 재시도합니다: " + recoveryError.message); }
      throw error;
    }
  }

  // Existing paste/file imports keep their original payload and local commit.
  // Native records pass through the same buckets/memo path after strict review.
  async function importRecords({ memos = [], tokens = [], replace = false, nativeRecords }, undo = false) {
    await recoverRecordsImport();
    const native = !undo && nativeRecords !== undefined ? planNativeRecords(nativeRecords) : null;
    if (native) { memos = native.memos; tokens = native.tokens; }
    await migrateLegacyToBuckets();
    const journalKey = "dcbRecordsImportUndo";
    const state = await storageGet("local", ["userMemos", META_KEY, journalKey, NATIVE_METADATA_KEY, KEYWORD_OWNERS_KEY]);
    const journal = undo ? state[journalKey] : { id: crypto.randomUUID(), memos: [], tokens: [], keywords: [], native: [] };
    if (!journal) throw Error("취소할 가져오기가 없습니다.");
    const list = normalizeList(undo ? journal.tokens : tokens);
    const keys = [...new Set(list.map(token => bucketKeyForBlockKey(makeBlockKey(token))))];
    const buckets = keys.length ? await storageGet("local", keys) : {};
    const patch = {};
    const nativeByToken = new Map(native?.rows.filter(row => row.status === "applicable" && row.token)
      .map(row => [makeBlockKey(row.token), row.record]));
    let blockCount = 0, memoCount = 0, keywordCount = 0, nativeCount = 0;
    const stamp = now();
    for (const token of list) {
      const key = makeBlockKey(token);
      const bucketKey = bucketKeyForBlockKey(key);
      const bucket = buckets[bucketKey] ||= {};
      if (undo) {
        if (bucket[key]?.importId !== journal.id) continue;
        delete bucket[key];
      } else {
        if (Object.hasOwn(bucket, key)) continue;
        const sourceRecord = nativeByToken.get(key);
        bucket[key] = { token, type: classifyToken(token), createdAt: stamp, updatedAt: stamp, importId: journal.id,
          ...(sourceRecord ? { nativeRecord: sourceRecord } : {}) };
        journal.tokens.push(token);
      }
      patch[bucketKey] = bucket;
      blockCount++;
    }
    const current = { ...state.userMemos };
    if (undo) {
      for (const { key, before, after } of journal.memos) {
        const value = current[key];
        if (!value || Object.keys(value).length !== Object.keys(after).length ||
            !Object.keys(after).every(field => value[field] === after[field])) continue;
        if (before) current[key] = before;
        else delete current[key];
        memoCount++;
      }
    } else {
      for (const [key, item] of memos) {
        if (!/^(?:gallery:[a-z0-9_]{1,80}:)?(?:ip|uid):/i.test(key) || !item?.memo) throw Error("메모 형식 오류");
        if (Object.hasOwn(current,key) && !replace) continue;
        if (current[key] && Object.keys(item).every(field => sameValue(current[key][field], item[field]))) continue;
        const after = { ...item, importedAt: stamp, updatedAt: stamp };
        journal.memos.push({ key, before: current[key] ?? null, after });
        current[key] = after;
        memoCount++;
      }
    }
    if (memoCount) patch.userMemos = current;
    if (blockCount) patch[META_KEY] = { ...state[META_KEY], updatedAt: stamp,
      count: state[META_KEY].count + (undo ? -blockCount : blockCount) };
    const metadata = { ...state[NATIVE_METADATA_KEY] };
    if (undo) {
      for (const { key, before, after } of journal.native || []) {
        if (!sameValue(metadata[key], after)) continue;
        if (before) metadata[key] = before;
        else delete metadata[key];
        nativeCount++;
      }
    } else if (native) {
      for (const [key, record] of native.metadata) {
        if (sameValue(metadata[key], record) || (Object.hasOwn(metadata, key) && !replace)) continue;
        journal.native.push({ key, before: metadata[key] ?? null, after: record });
        metadata[key] = record;
        nativeCount++;
      }
    }
    if (nativeCount) patch[NATIVE_METADATA_KEY] = metadata;
    let keywordChange;
    if ((undo && journal.keywords?.length) || native?.keywords.length) {
      const { blockedKeywords = [] } = await storageGet("sync", { blockedKeywords: [] });
      if (!Array.isArray(blockedKeywords) || !blockedKeywords.every(word => typeof word === "string")) throw Error("기존 키워드 목록 형식 오류");
      const after = blockedKeywords.slice(), keys = new Set(after.map(keywordKey));
      const owners = { ...state[KEYWORD_OWNERS_KEY] };
      if (undo) {
        for (const word of journal.keywords) {
          // Exact label match keeps a manually renamed keyword.
          const index = after.indexOf(word);
          const owner = owners[keywordKey(word)];
          if (index >= 0 && owner?.importId === journal.id && owner.label === word) {
            after.splice(index, 1); keywordCount++; delete owners[keywordKey(word)];
          }
        }
      } else for (const word of native.keywords) {
        if (keys.has(keywordKey(word))) continue;
        after.push(word); keys.add(keywordKey(word)); journal.keywords.push(word); keywordCount++;
        owners[keywordKey(word)] = { label: word, importId: journal.id };
      }
      if (keywordCount) {
        keywordChange = { before: blockedKeywords, after };
        patch[KEYWORD_OWNERS_KEY] = owners;
      }
    }
    if (undo || memoCount || blockCount || keywordCount || nativeCount) {
      patch[journalKey] = undo ? null : journal;
      await commitRecordsPatch(patch, keywordChange);
    }
    return { ok: true, memoCount, blockCount, keywordCount, nativeCount, heldCount: native?.held.length || 0 };
  }

  async function clearAllTokens() {
    return setAllTokens([]);
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
    getAllTokensReadOnly,
    setAllTokens,
    addToken,
    hasToken,
    removeToken,
    removeTokens,
    toggleToken,
    clearAllTokens,
    importRecords,
    planNativeRecords,
    recoverRecordsImport,
    invalidateKeywordImportOwnership,
    consumeRecordsKeywordChange,
    patchMemos,
    migrateLegacyToBuckets,
    getUsage,
    isRelevantChange
  };
  // Content scripts may start before this document_end store profile. Notify
  // an already-rendered preview when the canonical block store becomes
  // available so it can rerun its matcher with the v2 bucket tokens.
  if (typeof document !== "undefined") {
    document.dispatchEvent(new CustomEvent("dcb-userblock:store-ready"));
  }
})(globalThis);

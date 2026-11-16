import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { randomUUID } from "node:crypto";

const source = fs.readFileSync(new URL("../src/shared/storage/user-block-store.js", import.meta.url), "utf8");
const background = fs.readFileSync(new URL("../src/background/background.js", import.meta.url), "utf8");
const copy = value => structuredClone(value);
function fixture() {
  const data = {
    local: { "userBlock:v2:meta": { version: 2, count: 0, legacyImportedAt: 1 }, userMemos: {} },
    sync: { blockedKeywords: ["기존"], userBlockEnabled: false, keywordBlockEnabled: false, userMemoEnabled: false }
  };
  let fail, getHook;
  const writes = [];
  const keywordEvents = [];
  const chrome = { storage: {} };
  for (const area of ["local", "sync"]) chrome.storage[area] = {
    async get(keys) {
      if (getHook) await getHook(area, keys);
      if (keys == null) return copy(data[area]);
      if (typeof keys === "string") return Object.hasOwn(data[area], keys) ? { [keys]: copy(data[area][keys]) } : {};
      const result = Array.isArray(keys) ? {} : copy(keys);
      for (const key of Array.isArray(keys) ? keys : Object.keys(keys))
        if (Object.hasOwn(data[area], key)) result[key] = copy(data[area][key]);
      return result;
    },
    async set(patch) {
      writes.push({ area, patch: copy(patch) });
      if (fail?.(area, patch)) throw Error("fixture storage quota/write failure");
      if (area === "sync" && Object.hasOwn(patch, "blockedKeywords")) keywordEvents.push({
        oldValue: copy(data.sync.blockedKeywords), newValue: copy(patch.blockedKeywords)
      });
      Object.assign(data[area], copy(patch));
    },
    async remove(keys) { for (const key of [].concat(keys)) delete data[area][key]; }
  };
  const reload = () => {
    const context = vm.createContext({ chrome, crypto: { randomUUID } });
    vm.runInContext(source, context);
    return context.DCBUserBlockStore;
  };
  return { data, chrome, store: reload(), reload, writes, keywordEvents,
    fail: callback => { fail = callback; }, onGet: callback => { getHook = callback; } };
}
const block = (targetType, value, extra = {}) => ({ kind: "block", source: "dc-native", scope: "global", galleryId: "", galleryType: "", enabled: true, targetType, value, ...extra });
const memo = (value, text, extra = {}) => block("uid", value, { kind: "memo", identityVerified: true, memo: text, color: "#123abc", ...extra });

test("native review retains scopes and OFF state, rejects ambiguous identity and expanded IP range", () => {
  const { store } = fixture();
  const plan = store.planNativeRecords([
    block("word", "테스트"), block("uid", "member1", { identityVerified: true, nativeTargetType: "id" }),
    block("id", "opaque-code"), block("uid", "unverified"), block("nick", "예시닉"),
    block("ip", "192.0"), block("ip", "192.0.2.5"), block("ip", "999.1"),
    block("nick", "다른닉", { scope: "gallery", galleryId: "example", galleryType: "M" }),
    block("word", "꺼짐", { enabled: false }), block("word", "모름", { enabled: undefined }),
    memo("member2", "특수문자 <>&\" ' —\n메모", { scope: "gallery", galleryId: "example", galleryType: "M" }),
    memo("member3", "색상모름", { color: "red" }), block("nick", "ㅇㅇ"),
    memo("member4", "특수문자 <>&\" ' —\n메모"),
    block("uid", "192.0", { identityVerified: true })
  ]);
  assert.equal(plan.held.length, 11);
  assert.deepEqual(copy(plan.tokens), ["member1", "nick-exact:예시닉", "192.0"]);
  assert.deepEqual(copy(plan.keywords), ["테스트"]);
  assert.equal(plan.memos[0][0], "uid:member4");
  assert.equal(plan.memos[0][1].color, "#123abc");
  assert.equal(plan.memos[0][1].memo, "특수문자 <>&\" ' —\n메모");
  assert.equal(plan.rows[9].record.enabled, false);
  assert.equal(plan.rows[8].record.galleryType, "M");
  assert.equal(plan.rows[1].record.nativeTargetType, "id");
});

test("native import merges existing lists, keeps filters OFF, preserves duplicate undo, and selectively reverts", async () => {
  const f = fixture(), { store, data } = f;
  data.local.userMemos["uid:existing"] = { memo: "기존 메모" };
  const records = [block("uid", "member1", { identityVerified: true }), block("nick", "예시닉"),
    block("ip", "192.0"), block("word", "새 키워드"), block("word", "기존"),
    memo("existing", "교체 후보"), memo("member2", "전체 <메모>"),
    memo("member3", "갤러리 <메모>", { scope: "gallery", galleryId: "example", galleryType: "M" }),
    block("word", "갤러리 전용", { scope: "gallery", galleryId: "example", galleryType: "M" }),
    block("word", "OFF 규칙", { enabled: false })];
  const first = await store.importRecords({ nativeRecords: records });
  assert.equal(first.blockCount, 3);
  assert.equal(first.memoCount, 1);
  assert.equal(first.keywordCount, 1);
  assert.equal(first.heldCount, 3);
  assert.deepEqual(data.sync.blockedKeywords, ["기존", "새 키워드"]);
  assert.equal(data.local.userMemos["uid:existing"].memo, "기존 메모");
  for (const flag of ["userBlockEnabled", "keywordBlockEnabled", "userMemoEnabled"]) assert.equal(data.sync[flag], false);
  const journal = copy(data.local.dcbRecordsImportUndo);
  const second = await store.importRecords({ nativeRecords: records });
  assert.equal(second.blockCount + second.memoCount + second.keywordCount + second.nativeCount, 0);
  assert.deepEqual(data.local.dcbRecordsImportUndo, journal);
  data.local.userMemos = { ...data.local.userMemos, "uid:member2": { ...data.local.userMemos["uid:member2"], memo: "가져온 뒤 수정" } };
  await store.removeToken("member1");
  await store.addToken("member1");
  data.sync.blockedKeywords.push("수동 추가");
  const undone = await store.importRecords({}, true);
  assert.equal(undone.blockCount, 2);
  assert.equal(undone.memoCount, 0);
  assert.equal(undone.keywordCount, 1);
  assert.deepEqual(copy(await store.getAllTokensReadOnly()), ["member1"]);
  assert.deepEqual(data.sync.blockedKeywords, ["기존", "수동 추가"]);
  assert.equal(data.local.userMemos["uid:member2"].memo, "가져온 뒤 수정");
  assert.deepEqual(data.local.dcbNativeImportMetadata, {});
  assert.equal(data.local.dcbRecordsImportUndo, null);
});

test("explicit memo replacement retains special text/color and undo restores the original", async () => {
  const { store, data } = fixture();
  data.local.userMemos["uid:member1"] = { memo: "기존", color: "#999999" };
  const record = memo("member1", "  원문 <>&\n  ", { color: "#abcdef" });
  await store.importRecords({ nativeRecords: [record], replace: true });
  assert.equal(data.local.userMemos["uid:member1"].memo, record.memo);
  assert.equal(data.local.userMemos["uid:member1"].color, "#abcdef");
  await store.importRecords({}, true);
  assert.deepEqual(data.local.userMemos["uid:member1"], { memo: "기존", color: "#999999" });
});

test("a manually removed and re-added keyword survives undo", async () => {
  const { store, data } = fixture();
  await store.importRecords({ nativeRecords: [block("word", "새 키워드")] });
  data.sync.blockedKeywords = ["기존"];
  await store.invalidateKeywordImportOwnership(data.sync.blockedKeywords);
  data.sync.blockedKeywords.push("새 키워드");
  await store.invalidateKeywordImportOwnership(data.sync.blockedKeywords);
  const result = await store.importRecords({}, true);
  assert.equal(result.keywordCount, 0);
  assert.deepEqual(data.sync.blockedKeywords, ["기존", "새 키워드"]);
});

test("sync quota failure commits no memos/buckets and preserves the preceding undo", async () => {
  const f = fixture(), { store, data } = f;
  await store.importRecords({ memos: [["uid:prior", { memo: "앞선 가져오기" }]] });
  const before = copy(data);
  f.fail((area) => area === "sync");
  await assert.rejects(store.importRecords({ nativeRecords: [block("word", "새 키워드"), memo("member1", "새 메모")] }), /failure/);
  assert.deepEqual(data.sync, before.sync);
  assert.deepEqual(data.local.userMemos, before.local.userMemos);
  assert.deepEqual(data.local.dcbRecordsImportUndo, before.local.dcbRecordsImportUndo);
  assert.equal(data.local.dcbRecordsImportPending, null);
});

test("final local write failure compensates the keyword delta without changing existing data", async () => {
  const f = fixture(), { store, data } = f;
  const original = copy(data);
  let failed = false;
  f.fail((area, patch) => {
    if (!failed && area === "local" && patch.dcbRecordsImportUndo?.keywords?.length) { failed = true; return true; }
    return false;
  });
  await assert.rejects(store.importRecords({ nativeRecords: [block("word", "새 키워드"), memo("member1", "메모")] }), /failure/);
  assert.deepEqual(data.sync, original.sync);
  assert.deepEqual(data.local.userMemos, {});
  assert.equal(data.local.dcbRecordsImportUndo, undefined);
  assert.equal(data.local.dcbRecordsImportPending, null);
  assert.equal(data.local.dcbNativeKeywordOwners, undefined);
});

test("a failed compensation remains recoverable after a fresh worker instance", async () => {
  const f = fixture(), { store, data } = f;
  let localFailed = false;
  f.fail((area, patch) => {
    if (area === "local" && patch.dcbRecordsImportUndo?.keywords?.length) { localFailed = true; return true; }
    return localFailed && area === "sync";
  });
  await assert.rejects(store.importRecords({ nativeRecords: [block("word", "새 키워드"), memo("member1", "메모")] }), /복구가 보류/);
  assert.deepEqual(data.sync.blockedKeywords, ["기존", "새 키워드"]);
  assert.ok(data.local.dcbRecordsImportPending);
  assert.deepEqual(data.local.userMemos, {});
  f.fail(() => false);
  data.sync.blockedKeywords.push("다른 편집");
  assert.equal(await f.reload().recoverRecordsImport(), true);
  assert.deepEqual(data.sync.blockedKeywords, ["기존", "다른 편집"]);
  assert.equal(data.local.dcbRecordsImportPending, null);
});

test("interrupted undo restores only removed imported keywords and retains unrelated changes", async () => {
  const { store, data } = fixture();
  data.local.dcbRecordsImportPending = { added: [], removed: ["가져온 단어"] };
  data.sync.blockedKeywords.push("다른 편집");
  await store.recoverRecordsImport();
  assert.deepEqual(data.sync.blockedKeywords, ["기존", "다른 편집", "가져온 단어"]);
});

test("failed undo compensation does not invalidate keyword ownership through delayed own events", async () => {
  const f = fixture(), { store, data, keywordEvents } = f;
  await store.importRecords({ nativeRecords: [block("word", "새 키워드")] });
  let failed = false;
  f.fail((area, patch) => {
    if (!failed && area === "local" && patch.dcbRecordsImportUndo === null) { failed = true; return true; }
    return false;
  });
  await assert.rejects(store.importRecords({}, true), /failure/);
  assert.deepEqual(data.sync.blockedKeywords, ["기존", "새 키워드"]);
  for (const change of keywordEvents.splice(0)) {
    if (!store.consumeRecordsKeywordChange(change.oldValue, change.newValue))
      await store.invalidateKeywordImportOwnership(change.newValue);
  }
  f.fail(() => false);
  assert.equal((await store.importRecords({}, true)).keywordCount, 1);
  assert.deepEqual(data.sync.blockedKeywords, ["기존"]);
  assert.equal(store.consumeRecordsKeywordChange(["기존"], ["기존", "수동 편집"]), false);
});

function backgroundQueues(f) {
  const queues = background.slice(background.indexOf("const recordsStartupRecovery ="), background.indexOf("function normalizeKeywordSettingsPatch"));
  const keywordPatch = background.slice(background.indexOf("function queueKeywordSettingsPatch"), background.indexOf("const DCCON_BLOCK_CONTEXT_MENU_ID"));
  const context = vm.createContext({ chrome: f.chrome, DCBUserBlockStore: f.store, console: { warn() {} } });
  vm.runInContext(`let settingsTransactionsPending = false; let settingsMutationQueue = Promise.resolve();
    const normalizeKeywordSettingsPatch = patch => ({...patch}); const writeKeywordHotCache = async () => {};
    ${queues}\n${keywordPatch}`, context);
  return context;
}

test("startup recovery shares the keyword queue barrier and preserves a concurrently requested edit", async () => {
  const f = fixture();
  f.data.sync.blockedKeywords = ["기존", "중단된 가져오기"];
  f.data.local.dcbRecordsImportPending = { added: ["중단된 가져오기"], removed: [] };
  let entered, release;
  const ready = new Promise(resolve => { entered = resolve; });
  const gate = new Promise(resolve => { release = resolve; });
  let gated = false;
  f.onGet(async area => { if (area === "sync" && !gated) { gated = true; entered(); await gate; } });
  const queues = backgroundQueues(f);
  await ready;
  let editDone = false;
  const edit = queues.queueKeywordSettingsPatch({ blockedKeywords: ["기존", "수동 추가"] }).then(() => { editDone = true; });
  await Promise.resolve();
  assert.equal(editDone, false);
  release();
  await edit;
  assert.deepEqual(f.data.sync.blockedKeywords, ["기존", "수동 추가"]);
  assert.equal(f.data.local.dcbRecordsImportPending, null);
});

test("keyword patch retries failed startup recovery before accepting a new edit", async () => {
  const f = fixture();
  f.data.sync.blockedKeywords = ["기존", "중단된 가져오기"];
  f.data.local.dcbRecordsImportPending = { added: ["중단된 가져오기"], removed: [] };
  let rejected = false;
  f.fail(area => { if (area === "sync" && !rejected) { rejected = true; return true; } return false; });
  const queues = backgroundQueues(f);
  await queues.queueKeywordSettingsPatch({ blockedKeywords: ["기존", "수동 추가"] });
  assert.equal(rejected, true);
  assert.equal(f.data.local.dcbRecordsImportPending, null);
  assert.deepEqual(f.data.sync.blockedKeywords, ["기존", "수동 추가"]);
});

test("verified native memo gallery-ID scope matches the site's own model and selectively undoes", async () => {
  const {store,data}=fixture();
  const records=[{kind:"memo",source:"dc-native",scope:"gallery",galleryId:"fixture",galleryType:"unknown",
    nativeScopeModel:"gallery-id",enabled:true,targetType:"uid",identityVerified:true,value:"nativeuser",memo:"원본 갤 메모",color:"#123456"}];
  assert.equal(store.planNativeRecords(records).held.length,0);
  assert.equal((await store.importRecords({nativeRecords:records})).memoCount,1);
  assert.equal(data.local.userMemos["gallery:fixture:uid:nativeuser"].memo,"원본 갤 메모");
  assert.equal(data.local.userMemos["uid:nativeuser"],undefined);
  await store.importRecords({},true);
  assert.equal(data.local.userMemos["gallery:fixture:uid:nativeuser"],undefined);
});

test("20,000 scoped records review without promotion or duplicate growth", () => {
  const { store } = fixture();
  const records = Array.from({ length: 20000 }, (_, i) => block("word", "단어" + i % 100, i % 2 ?
    { scope: "gallery", galleryId: "example", galleryType: "M" } : {}));
  const plan = store.planNativeRecords(records);
  assert.equal(plan.rows.length, 20000);
  assert.equal(plan.held.length, 10000);
  assert.equal(plan.keywords.length, 50);
  assert.equal(plan.duplicates, 9950);
});

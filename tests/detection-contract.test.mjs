import { test } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFile } from "node:fs/promises";

const configSource = await readFile(new URL("../src/shared/detection-config.js", import.meta.url), "utf8");
const workerSource = await readFile(new URL("../src/background/text-detection.js", import.meta.url), "utf8");

function fixture(overrides = {}, inferenceFailure = "") {
  const listeners = [];
  const calls = [];
  let documentExists = false;
  const context = vm.createContext({
    URL, setTimeout: () => 1, clearTimeout() {},
    chrome: {
      runtime: { id: "test-extension", getURL: path => `chrome-extension://test-extension/${path}`,
        getContexts: async () => documentExists ? [{}] : [],
        onMessage: { addListener: fn => listeners.push(fn) },
        sendMessage: async message => {
          calls.push(message);
          return inferenceFailure ? { ok: false, error: inferenceFailure }
            : { ok: true, results: message.items.map(() => ({ score: 0.8 })) };
        } },
      storage: { sync: { get: async () => ({ dcbTextDetection: { enabled: true, ...overrides } }) },
        session: { set: async () => {} }, onChanged: { addListener() {} } },
      offscreen: { createDocument: async options => { calls.push(options); documentExists = true; }, closeDocument: async () => {} }
    }
  });
  vm.runInContext(configSource, context);
  vm.runInContext(workerSource, context);
  const sender = { id: "test-extension", tab: { id: 1 }, url: "https://gall.dcinside.com/board/view/?id=test&no=1" };
  const item = { kind: "comment", title: "제목", body: "문장 분석 테스트입니다." };
  return { config: context.DCBTextDetection, calls, sender, item,
    request: (message = { type: "DCB_DETECT_TEXT", items: [item] }, from = sender) => new Promise(resolve => listeners[0](message, from, resolve)) };
}

test("settings are opt-in, thresholds reject invalid outputs, input contract is bounded", () => {
  const { config } = fixture();
  assert.equal(config.normalize(null).enabled, false);
  assert.equal(config.normalize({ enabled: "true", sensitivity: "toString" }).sensitivity, "careful");
  assert.equal(config.normalize({ enabled: "true" }).enabled, false);
  assert.equal(config.isFlagged(0.65, {}), true);
  assert.equal(config.isFlagged(0.64, {}), false);
  assert.equal(config.isFlagged(0.45, { sensitivity: "sensitive" }), true);
  for (const invalid of [NaN, Infinity, -1, 2, "0.9", null]) assert.equal(config.isFlagged(invalid, {}), false);
  assert.match(config.modelText("a".repeat(800), "b".repeat(7000)), /^제목: a{500}\n댓글: b{6000}$/);
});

test("disabled feature and disabled target never start inference", async () => {
  for (const override of [{ enabled: false }, { comments: false }]) {
    const app = fixture(override);
    assert.equal((await app.request()).error, "disabled");
    assert.equal(app.calls.length, 0);
  }
});

test("sender and payload validation reject outside sites and oversized batches", async () => {
  const app = fixture();
  for (const sender of [{ ...app.sender, id: "other" }, { ...app.sender, url: "https://gall.dcinside.com.evil.test/" }, { ...app.sender, url: "https://example.org/" }]) {
    assert.equal((await app.request(undefined, sender)).error, "invalid-request");
  }
  for (const items of [[null], [], Array(5).fill(app.item), [{ ...app.item, body: "x".repeat(6001) }], [{ ...app.item, kind: "account" }]]) {
    assert.equal((await app.request({ type: "DCB_DETECT_TEXT", items })).error, "invalid-request");
  }
  assert.equal(app.calls.length, 0);
});

test("concurrent tabs share one runtime and process serial batches", async () => {
  const app = fixture();
  const replies = await Promise.all([app.request(), app.request(), app.request()]);
  assert.ok(replies.every(reply => reply.ok && reply.results[0].score === 0.8));
  assert.equal(app.calls.filter(call => call.url).length, 1);
  assert.equal(app.calls.filter(call => call.type === "DCB_INFERENCE").length, 3);
});

test("missing model runtime falls back to a disclosed conservative detector", async () => {
  const app = fixture({}, "model-unavailable");
  const reply = await app.request({ type: "DCB_DETECT_TEXT", items: [{ ...app.item, body: "너 같은 쓰레기는 닥쳐." }] });
  assert.equal(reply.ok, true);
  assert.equal(reply.mode, "basic");
  assert.equal(reply.reason, "model-unavailable");
  assert.ok(reply.results[0].score >= app.config.thresholds.careful);
  assert.ok(app.config.fallbackScore("산책", "오늘은 날씨가 좋습니다.") < app.config.thresholds.sensitive);
  assert.ok(app.config.fallbackScore("청소", "집 앞 쓰레기를 치우고 자료를 뒤져 봤습니다.") < app.config.thresholds.sensitive);
  assert.ok(app.config.fallbackScore("연극", "미친놈 연기를 꽤 잘했습니다.") < app.config.thresholds.careful);
  assert.ok(app.config.fallbackScore("환경", "코너에서 쓰레기 문제가 너무 심하다고 말했습니다.") < app.config.thresholds.careful);
});

(() => {
  "use strict";
  const config = globalThis.DCBTextDetection;
  const page = "src/offscreen/detection.html";
  const statusKey = "dcbDetectionStatus";
  const runtimeRetryMs = 5 * 60_000;
  let creating;
  let queued = 0;
  let chain = Promise.resolve();
  let status = { state: "idle" };
  let statusRevision = 0;
  let idleTimer;
  let releaseRequested = false;
  let runtimeRetryAt = 0;
  let runtimeFailure = "";
  const statusReady = Promise.resolve(chrome.storage.session.get?.(statusKey)).then(stored => {
    const saved = stored?.[statusKey];
    if (!statusRevision && saved && typeof saved.state === "string") status = saved;
  }).catch(() => {});
  function setStatus(state, details = {}) {
    const next = { state, ...details };
    if (statusRevision && status.state === next.state && status.mode === next.mode && status.reason === next.reason) return;
    statusRevision++;
    status = next;
    chrome.storage.session.set({ [statusKey]: status }).catch(() => {});
  }
  function failureReason(error) {
    const reason = typeof error === "string" ? error : error?.error;
    return ["model-unavailable", "model-timeout", "runtime-unavailable", "invalid-result", "busy"].includes(reason)
      ? reason : "runtime-unavailable";
  }
  function basicResult(items, reason) {
    return {
      ok: true,
      mode: "basic",
      reason,
      results: items.map(item => ({ score: config.fallbackScore(item.kind === "post" ? item.title : "", item.body) }))
    };
  }
  function validModelResult(result, count) {
    return result?.ok && Array.isArray(result.results) && result.results.length === count && result.results.every(item =>
      item && Number.isFinite(item.score) && item.score >= 0 && item.score <= 1);
  }
  async function hasRuntimeDocument() {
    if (typeof chrome.runtime.getContexts === "function") {
      const contexts = await chrome.runtime.getContexts({
        contextTypes: ["OFFSCREEN_DOCUMENT"],
        documentUrls: [chrome.runtime.getURL(page)]
      });
      return contexts.length > 0;
    }
    return typeof chrome.offscreen.hasDocument === "function" && await chrome.offscreen.hasDocument();
  }
  function releaseWhenIdle(delay = 300_000) {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(async () => {
      if (queued) return;
      try {
        if (await hasRuntimeDocument()) await chrome.offscreen.closeDocument();
        setStatus("idle");
      } catch { /* The document may already have closed with the browser. */ }
    }, delay);
  }
  async function ensureRuntime() {
    if (!creating) {
      creating = (async () => {
        if (!await hasRuntimeDocument()) {
          await chrome.offscreen.createDocument({
            url: page,
            reasons: ["WORKERS"],
            justification: "게시글과 댓글을 외부 전송 없이 기기 내 모델로 분석합니다."
          });
        }
      })().finally(() => { creating = undefined; });
    }
    return creating;
  }
  function authorized(sender) {
    if (sender.id !== chrome.runtime.id) return false;
    try { return new URL(sender.url).hostname === "gall.dcinside.com"; }
    catch { return false; }
  }
  chrome.runtime.onMessage.addListener((message, sender, respond) => {
    if (message?.type === "DCB_DETECTION_STATUS" && sender.id === chrome.runtime.id) {
      statusReady.then(() => respond(status));
      return true;
    }
    if (message?.type !== "DCB_DETECT_TEXT") return;
    if (!authorized(sender) || !Array.isArray(message.items) || message.items.length > 4) {
      respond({ ok: false, error: "invalid-request" });
      return;
    }
    const items = message.items;
    if (!items.length || items.some(item => !item || !["post", "comment"].includes(item.kind) ||
      typeof item.title !== "string" || item.title.length > 500 || typeof item.body !== "string" || item.body.length > 6000)) {
      respond({ ok: false, error: "invalid-request" });
      return;
    }
    if (queued >= 8) { respond({ ok: false, error: "busy" }); return; }
    queued++;
    clearTimeout(idleTimer);
    const job = chain.then(async () => {
      const stored = await chrome.storage.sync.get({ [config.key]: config.defaults });
      const settings = config.normalize(stored[config.key]);
      if (!settings.enabled || items.some(item => item.kind === "post" ? !settings.posts : !settings.comments)) {
        return { ok: false, error: "disabled" };
      }
      if (Date.now() >= runtimeRetryAt) {
        setStatus(status.state === "ready" ? "analyzing" : "loading", { mode: "model" });
        let result;
        try {
          await ensureRuntime();
          result = await chrome.runtime.sendMessage({ type: "DCB_INFERENCE", target: "detection-offscreen", items });
        } catch (error) {
          result = { ok: false, error: failureReason(error) };
        }
        if (validModelResult(result, items.length)) {
          runtimeRetryAt = 0;
          runtimeFailure = "";
          setStatus("ready", { mode: "model" });
          return { ...result, mode: "model" };
        }
        runtimeFailure = failureReason(result?.ok ? "invalid-result" : result);
        runtimeRetryAt = Date.now() + runtimeRetryMs;
      }
      const fallback = basicResult(items, runtimeFailure || "runtime-unavailable");
      setStatus("limited", { mode: "basic", reason: fallback.reason });
      return fallback;
    });
    chain = job.catch(() => {});
    job.then(result => respond(result || { ok: false, error: "runtime-unavailable" }),
      () => {
        setStatus("error", { reason: "runtime-unavailable" });
        respond({ ok: false, error: "runtime-unavailable" });
      }).finally(() => { queued--; releaseWhenIdle(releaseRequested ? 0 : 300_000); });
    return true;
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "sync" && changes[config.key]) {
      releaseRequested = !config.normalize(changes[config.key].newValue).enabled;
      runtimeRetryAt = 0;
      runtimeFailure = "";
      setStatus("idle");
      if (releaseRequested) releaseWhenIdle(0);
    }
  });
})();

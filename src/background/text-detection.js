(() => {
  "use strict";
  const config = globalThis.DCBTextDetection;
  const page = "src/offscreen/detection.html";
  let creating;
  let queued = 0;
  let chain = Promise.resolve();
  let status = { state: "idle" };
  let idleTimer;
  let releaseRequested = false;
  function setStatus(state) {
    status = { state };
    chrome.storage.session.set({ dcbDetectionStatus: status }).catch(() => {});
  }
  function releaseWhenIdle(delay = 300_000) {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(async () => {
      if (queued) return;
      try {
        if (await chrome.offscreen.hasDocument()) await chrome.offscreen.closeDocument();
        setStatus("idle");
      } catch { /* The document may already have closed with the browser. */ }
    }, delay);
  }
  async function ensureRuntime() {
    if (!creating) {
      creating = (async () => {
        if (!await chrome.offscreen.hasDocument()) {
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
      respond(status);
      return;
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
      setStatus(status.state === "ready" ? "analyzing" : "loading");
      await ensureRuntime();
      const result = await chrome.runtime.sendMessage({ type: "DCB_INFERENCE", target: "detection-offscreen", items });
      setStatus(result?.ok ? "ready" : "error");
      return result;
    });
    chain = job.catch(() => {});
    job.then(result => respond(result || { ok: false, error: "runtime-unavailable" }),
      () => {
        setStatus("error");
        respond({ ok: false, error: "runtime-unavailable" });
      }).finally(() => { queued--; releaseWhenIdle(releaseRequested ? 0 : 300_000); });
    return true;
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "sync" && changes[config.key]) {
      releaseRequested = !config.normalize(changes[config.key].newValue).enabled;
      if (releaseRequested) releaseWhenIdle(0);
    }
  });
})();

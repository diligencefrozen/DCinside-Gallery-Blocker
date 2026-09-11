// The offscreen document stays responsive while its dedicated worker owns model memory.
const INFERENCE_TIMEOUT_MS = 90_000;
const IDLE_TIMEOUT_MS = 5 * 60_000;
let worker;
let pending;
let idleTimer;
let serial = 0;
let queued = 0;
let chain = Promise.resolve();

function stopWorker(error = "model-unavailable") {
  clearTimeout(idleTimer);
  worker?.terminate();
  worker = undefined;
  if (pending) {
    const job = pending;
    pending = undefined;
    clearTimeout(job.timer);
    job.resolve({ ok: false, error });
  }
}

function getWorker() {
  if (worker) return worker;
  const instance = worker = new Worker(chrome.runtime.getURL("vendor/detector/inference-worker.js"), { type: "module" });
  instance.addEventListener("message", ({ data }) => {
    if (worker !== instance || !pending || data?.id !== pending.id) return;
    if (!data.ok || !Array.isArray(data.results) || data.results.length !== pending.count || data.results.some(item =>
      !item || !Number.isFinite(item.score) || item.score < 0 || item.score > 1)) {
      stopWorker();
      return;
    }
    const job = pending;
    pending = undefined;
    clearTimeout(job.timer);
    idleTimer = setTimeout(() => { if (!pending) stopWorker(); }, IDLE_TIMEOUT_MS);
    job.resolve({ ok: true, results: data.results });
  });
  const failed = () => { if (worker === instance) stopWorker(); };
  instance.addEventListener("error", failed);
  instance.addEventListener("messageerror", failed);
  return instance;
}

function analyze(items) {
  clearTimeout(idleTimer);
  return new Promise(resolve => {
    try {
      const target = getWorker();
      const id = ++serial;
      pending = { id, count: items.length, resolve, timer: setTimeout(() => stopWorker("model-timeout"), INFERENCE_TIMEOUT_MS) };
      target.postMessage({ id, items });
    } catch {
      stopWorker();
      resolve({ ok: false, error: "model-unavailable" });
    }
  });
}

chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (message?.target !== "detection-offscreen" || message.type !== "DCB_INFERENCE") return;
  if (sender.id !== chrome.runtime.id || sender.tab || sender.url !== chrome.runtime.getURL("src/background/background.js")) return;
  if (!Array.isArray(message.items) || message.items.length < 1 || message.items.length > 4 || message.items.some(item =>
    !item || !["post", "comment"].includes(item.kind) || typeof item.title !== "string" || item.title.length > 500 ||
    typeof item.body !== "string" || item.body.length > 6000)) {
    respond({ ok: false, error: "invalid-request" });
    return;
  }
  if (queued >= 8) { respond({ ok: false, error: "busy" }); return; }
  queued++;
  const job = chain.then(() => analyze(message.items));
  chain = job.catch(() => {});
  job.then(respond, () => respond({ ok: false, error: "model-unavailable" })).finally(() => { queued--; });
  return true;
});

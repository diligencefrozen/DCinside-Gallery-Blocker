import * as ort from "onnxruntime-web/wasm";
import "../shared/detection-config.js";
import "../shared/detection-tokenizer.js";

const extensionRoot = new URL("../../", self.location.href);
ort.env.wasm.wasmPaths = new URL("vendor/detector/", extensionRoot).href;
ort.env.wasm.numThreads = 1;
ort.env.wasm.proxy = false;
let runtime;
const scores = new Map();

function failure(code, cause) { return Object.assign(new Error(code, { cause }), { code }); }
async function localFile(path, format) {
  let response;
  try { response = await fetch(new URL(path, extensionRoot)); }
  catch (error) { throw failure("model-missing", error); }
  if (!response.ok) throw failure("model-missing");
  try { return await response[format](); }
  catch (error) { throw failure("invalid-model", error); }
}
async function loadRuntime() {
  if (!runtime) {
    runtime = (async () => {
      const [configuration, model] = await Promise.all([
        localFile("models/conflict/tokenizer.json", "json"), localFile("models/conflict/model.onnx", "arrayBuffer")
      ]);
      let tokenizer;
      try { tokenizer = DCBDetectionTokenizer.create(configuration); }
      catch (error) { throw failure("invalid-model", error); }
      let session;
      try {
        session = await ort.InferenceSession.create(model, { executionProviders: ["wasm"], graphOptimizationLevel: "all" });
      } catch (error) { throw failure("runtime-init-failed", error); }
      if (session.inputNames.length !== 2 || !["input_ids", "feature_weights"].every(name => session.inputNames.includes(name))
        || session.outputNames.length !== 1 || session.outputNames[0] !== "aggressive_score") {
        await session.release();
        throw failure("invalid-model");
      }
      return { tokenizer, session };
    })().catch(error => { runtime = undefined; throw error; });
  }
  return runtime;
}
async function analyze(items) {
  const { tokenizer, session } = await loadRuntime();
  const results = [];
  for (const item of items) {
    // Comment-only input matches the validation used to calibrate thresholds.
    const text = DCBTextDetection.modelText(item.kind === "post" ? item.title : "", item.body);
    if (!scores.has(text)) {
      const tokens = tokenizer.encode(text);
      const feeds = {
        input_ids: new ort.Tensor("int64", tokens.inputIds, tokens.dims),
        feature_weights: new ort.Tensor("float32", tokens.featureWeights, tokens.dims)
      };
      let output;
      try {
        output = await session.run(feeds, ["aggressive_score"]);
        const prediction = output.aggressive_score;
        if (prediction.type !== "float32" || prediction.dims.length !== 1 || prediction.dims[0] !== 1
          || prediction.data.length !== 1 || !Number.isFinite(prediction.data[0])) throw failure("invalid-result");
        scores.set(text, 1 / (1 + Math.exp(-Number(prediction.data[0]))));
        if (scores.size > 256) scores.delete(scores.keys().next().value);
      } finally {
        Object.values(output || {}).forEach(tensor => tensor.dispose?.());
        Object.values(feeds).forEach(tensor => tensor.dispose?.());
      }
    }
    results.push({ score: scores.get(text) });
  }
  return { ok: true, results };
}
self.addEventListener("message", ({ data }) => {
  const { id, items } = data;
  analyze(items).then(result => self.postMessage({ id, ...result }), error => {
    console.warn("[DCB] Local inference failed:", error?.code || "runtime-init-failed");
    self.postMessage({ id, ok: false, error: error?.code || "runtime-init-failed" });
  });
});

import { AutoTokenizer, env } from "@huggingface/transformers";
import * as ort from "onnxruntime-web/wasm";
import "../shared/detection-config.js";

env.allowRemoteModels = false;
env.allowLocalModels = true;
env.useBrowserCache = false;
const extensionRoot = new URL("../../", self.location.href);
env.localModelPath = new URL("models/", extensionRoot).href;
ort.env.wasm.wasmPaths = new URL("vendor/detector/", extensionRoot).href;
ort.env.wasm.numThreads = 1;
ort.env.wasm.proxy = false;

let runtime;
const scores = new Map();

async function loadRuntime() {
  if (!runtime) {
    runtime = (async () => {
      const tokenizer = await AutoTokenizer.from_pretrained("conflict", { local_files_only: true });
      const session = await ort.InferenceSession.create(new URL("models/conflict/model.onnx", extensionRoot).href, {
        executionProviders: ["wasm"], graphOptimizationLevel: "all"
      });
      if (session.inputNames.length !== 2 || !["input_ids", "attention_mask"].every(name => session.inputNames.includes(name)) ||
          !session.outputNames.includes("troll_label")) {
        await session.release();
        throw new Error("Unsupported model contract");
      }
      return [tokenizer, session];
    })().catch(error => { runtime = undefined; throw error; });
  }
  return runtime;
}

async function analyze(items) {
  const [tokenizer, session] = await loadRuntime();
  const results = [];
  for (const item of items) {
    const text = DCBTextDetection.modelText(item.title, item.body);
    if (!scores.has(text)) {
      const tokens = await tokenizer(text, { truncation: true, max_length: 256, padding: false });
      const feeds = {};
      let output;
      try {
        for (const name of session.inputNames) {
          const tensor = tokens[name];
          if (!tensor || tensor.dims.length !== 2 || tensor.dims[0] !== 1 || tensor.dims[1] < 1 || tensor.dims[1] > 256) {
            throw new Error("Unsupported model input");
          }
          feeds[name] = new ort.Tensor("int64", BigInt64Array.from(tensor.data, BigInt), tensor.dims);
        }
        output = await session.run(feeds, ["troll_label"]);
        const prediction = output.troll_label;
        if (prediction.type !== "float32" || prediction.dims.length !== 1 || prediction.dims[0] !== 1 || prediction.data.length !== 1) {
          throw new Error("Unsupported model output");
        }
        const logit = Number(prediction.data[0]);
        if (!Number.isFinite(logit)) throw new Error("Invalid score");
        scores.set(text, 1 / (1 + Math.exp(-logit)));
        if (scores.size > 256) scores.delete(scores.keys().next().value);
      } finally {
        Object.values(output || {}).forEach(tensor => tensor.dispose?.());
        Object.values(feeds).forEach(tensor => tensor.dispose?.());
        Object.values(tokens).forEach(tensor => tensor.dispose?.());
      }
    }
    results.push({ score: scores.get(text) });
  }
  return { ok: true, results };
}

self.addEventListener("message", ({ data }) => {
  const { id, items } = data;
  analyze(items).then(result => self.postMessage({ id, ...result }), error => {
    console.warn("[DCB] Local inference failed:", error instanceof Error ? error.message : String(error));
    self.postMessage({ id, ok: false, error: "model-unavailable" });
  });
});

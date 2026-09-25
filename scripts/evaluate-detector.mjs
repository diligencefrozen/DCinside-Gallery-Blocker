import { performance } from "node:perf_hooks";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import vm from "node:vm";
import * as ort from "onnxruntime-web/wasm";
import { examples, longCases } from "../tests/fixtures/ai-evaluation.ko.mjs";

const root = new URL("../", import.meta.url);
const output = process.env.DCB_EVAL_REPORT
  ? pathToFileURL(process.env.DCB_EVAL_REPORT)
  : new URL("../test-results/ai-evaluation-report.json", import.meta.url);
const wasmDirectory = process.env.DCB_ORT_WASM_DIR
  ? pathToFileURL(process.env.DCB_ORT_WASM_DIR)
  : new URL("../node_modules/onnxruntime-web/dist/", import.meta.url);
ort.env.wasm.wasmPaths = pathToFileURL(fileURLToPath(wasmDirectory) + "\\").href;
ort.env.wasm.numThreads = 1;
ort.env.wasm.proxy = false;

const context = vm.createContext({ console, globalThis: null });
context.globalThis = context;
for (const path of ["src/shared/detection-config.js", "src/shared/detection-tokenizer.js"]) {
  vm.runInContext(await readFile(new URL(path, root), "utf8"), context, { filename: path });
}

const start = performance.now();
const [tokenizerConfig, model] = await Promise.all([
  readFile(new URL("models/conflict/tokenizer.json", root), "utf8").then(JSON.parse),
  readFile(new URL("models/conflict/model.onnx", root))
]);
const tokenizer = context.DCBDetectionTokenizer.create(tokenizerConfig);
const session = await ort.InferenceSession.create(new Uint8Array(model), {
  executionProviders: ["wasm"], graphOptimizationLevel: "all"
});
const coldLoadMs = performance.now() - start;

async function scoreWithSession(inferenceSession, item) {
  const formattedText = context.DCBTextDetection.modelText(item.kind === "post" ? item.title : "", item.body);
  const encoded = tokenizer.encode(formattedText);
  const feeds = {
    input_ids: new ort.Tensor("int64", BigInt64Array.from(encoded.inputIds, BigInt), encoded.dims),
    feature_weights: new ort.Tensor("float32", Float32Array.from(encoded.featureWeights, Number), encoded.dims)
  };
  let result;
  try {
    const started = performance.now();
    result = await inferenceSession.run(feeds, ["aggressive_score"]);
    const latencyMs = performance.now() - started;
    const logit = Number(result.aggressive_score.data[0]);
    return { formattedText, features: encoded.dims[1], logit, score: 1 / (1 + Math.exp(-logit)), latencyMs };
  } finally {
    Object.values(result || {}).forEach(value => value.dispose?.());
    Object.values(feeds).forEach(value => value.dispose?.());
  }
}
const score = item => scoreWithSession(session, item);

function metrics(rows, threshold) {
  const counts = { tp: 0, fp: 0, tn: 0, fn: 0 };
  for (const row of rows) {
    const predicted = row.score >= threshold ? 1 : 0;
    if (row.label && predicted) counts.tp++;
    else if (!row.label && predicted) counts.fp++;
    else if (!row.label && !predicted) counts.tn++;
    else counts.fn++;
  }
  const precision = counts.tp / Math.max(1, counts.tp + counts.fp);
  const recall = counts.tp / Math.max(1, counts.tp + counts.fn);
  return { threshold, ...counts, precision, recall, f1: 2 * precision * recall / Math.max(Number.EPSILON, precision + recall) };
}

const rows = [];
for (const example of examples) rows.push({ ...example, ...await score(example) });
const thresholds = context.DCBTextDetection.thresholds;
const benchmark = Object.fromEntries(Object.entries(thresholds).map(([name, value]) => [name, metrics(rows, value)]));
const byCategory = Object.fromEntries([...new Set(rows.map(row => row.category))].map(category => {
  const selected = rows.filter(row => row.category === category);
  return [category, {
    count: selected.length,
    label: selected[0].label,
    meanScore: selected.reduce((sum, row) => sum + row.score, 0) / selected.length,
    minScore: Math.min(...selected.map(row => row.score)),
    maxScore: Math.max(...selected.map(row => row.score))
  }];
}));

const longDiagnostics = [];
for (const item of longCases) {
  const chunkRows = [];
  for (let index = 0; index < item.chunks.length; index++) {
    chunkRows.push(await score({ kind: "post", title: index ? "" : item.title, body: item.chunks[index] }));
  }
  const values = chunkRows.map(row => row.score).sort((a, b) => a - b);
  longDiagnostics.push({
    id: item.id,
    label: item.label,
    chunkScores: chunkRows.map(row => row.score),
    chunkFeatures: chunkRows.map(row => row.features),
    aggregations: {
      max: values.at(-1),
      mean: values.reduce((sum, value) => sum + value, 0) / values.length,
      median: values[Math.floor(values.length / 2)]
    }
  });
}

const latencies = rows.map(row => row.latencyMs).sort((a, b) => a - b);
const failures = rows.filter(row => (row.score >= thresholds.balanced ? 1 : 0) !== row.label)
  .sort((a, b) => Math.abs(b.score - thresholds.balanced) - Math.abs(a.score - thresholds.balanced));
let externalDataPoc = { available: false };
try {
  const [externalGraph, externalWeights] = await Promise.all([
    readFile(new URL("../test-results/external-data-poc/model.onnx", import.meta.url)),
    readFile(new URL("../test-results/external-data-poc/model.weights", import.meta.url))
  ]);
  const externalStarted = performance.now();
  const externalSession = await ort.InferenceSession.create(new Uint8Array(externalGraph), {
    executionProviders: ["wasm"],
    graphOptimizationLevel: "all",
    externalData: [{ path: "model.weights", data: new Uint8Array(externalWeights) }]
  });
  const externalLoadMs = performance.now() - externalStarted;
  let maxScoreDelta = 0;
  for (let index = 0; index < examples.length; index++) {
    const result = await scoreWithSession(externalSession, examples[index]);
    maxScoreDelta = Math.max(maxScoreDelta, Math.abs(result.score - rows[index].score));
  }
  externalDataPoc = {
    available: true,
    graphBytes: externalGraph.byteLength,
    weightsBytes: externalWeights.byteLength,
    loadMs: externalLoadMs,
    maxScoreDelta
  };
  await externalSession.release();
} catch (error) {
  externalDataPoc = { available: false, error: error instanceof Error ? error.message : String(error) };
}

const report = {
  generatedAt: new Date().toISOString(),
  artifact: {
    modelBytes: model.byteLength,
    tokenizerType: tokenizerConfig.type,
    vocabularySize: tokenizerConfig.vocabulary.length,
    inputNames: session.inputNames,
    outputNames: session.outputNames,
    outputSemantics: "positive label 1 = aggressive; ONNX output is an uncalibrated logit; sigmoid is applied exactly once"
  },
  dataset: { examples: rows.length, positive: rows.filter(row => row.label).length, negative: rows.filter(row => !row.label).length },
  benchmark,
  byCategory,
  latency: {
    coldLoadMs,
    warmMedianMs: latencies[Math.floor(latencies.length / 2)],
    warmP95Ms: latencies[Math.floor(latencies.length * 0.95)]
  },
  longDiagnostics,
  externalDataPoc,
  scores: rows.map(({ id, score }) => ({ id, score })),
  failures: failures.map(({ id, category, label, body, formattedText, features, logit, score }) => ({
    id, category, label, body, formattedText, features, logit, score
  })),
  samples: rows.slice(0, 8).map(({ id, body, formattedText, features, logit, score }) => ({ id, body, formattedText, features, logit, score }))
};

await mkdir(dirname(fileURLToPath(output)), { recursive: true });
await writeFile(output, JSON.stringify(report, null, 2) + "\n");
await session.release();
console.log(JSON.stringify({ report: fileURLToPath(output), dataset: report.dataset, benchmark, latency: report.latency, longDiagnostics }, null, 2));

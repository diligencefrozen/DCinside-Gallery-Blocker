import { cp, mkdir, lstat, mkdtemp, realpath, rename, rm, stat } from "node:fs/promises";
import { join, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { modelFile, verifyModel } from "./model-artifact.mjs";

const root = new URL("../", import.meta.url);
await verifyModel(modelFile);
await import("./build-detector.mjs");
for (const name of ["inference-worker.js", "ort-wasm-simd-threaded.mjs", "ort-wasm-simd-threaded.wasm"]) {
  await stat(new URL(`vendor/detector/${name}`, root));
}
const workspace = await realpath(fileURLToPath(root));
const outputDirectory = join(workspace, "dist");
await mkdir(outputDirectory, { recursive: true });
if (await realpath(outputDirectory) !== outputDirectory) throw new Error("설치 파일 출력 경로가 작업 폴더 밖을 가리킵니다.");
const target = join(outputDirectory, "DCinside-Gallery-Blocker");
const staging = await mkdtemp(join(outputDirectory, ".extension-stage-"));

async function removeGenerated(folder) {
  const entry = await lstat(folder).catch(error => {
    if (error.code === "ENOENT") return null;
    throw error;
  });
  if (!entry) return;
  const permittedName = basename(folder) === "DCinside-Gallery-Blocker" || basename(folder).startsWith(".extension-stage-");
  if (!permittedName || dirname(folder) !== outputDirectory || entry.isSymbolicLink() || await realpath(folder) !== folder) {
    throw new Error("생성 폴더의 실제 위치를 확인하지 못했습니다.");
  }
  await rm(folder, { recursive: true });
}

try {
  for (const name of ["manifest.json", "icons", "src", "models/conflict", "vendor/detector", "licenses", "PRIVACY.md", "docs/text-detection.html"]) {
    await cp(new URL(name, root), join(staging, name), { recursive: true });
  }
  await removeGenerated(target);
  await rename(staging, target);
} finally {
  await removeGenerated(staging);
}
console.log(`설치용 확장 폴더를 새로 만들었습니다: ${target}`);

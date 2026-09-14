import { copyFile, mkdir, lstat, mkdtemp, realpath, rename, rm, stat, readFile } from "node:fs/promises";
import { join, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { modelFile, tokenizerFile, verifyModel, verifyTokenizer } from "./model-artifact.mjs";

// Explicit runtime allowlist: no recursive source/model/vendor directory copies.
const files = `
manifest.json LICENSE THIRD_PARTY_NOTICES.md PRIVACY.md docs/text-detection.html
icons/16.png icons/48.png icons/128.png
licenses/Curse-detection-data-LICENSE licenses/korean-hate-speech-LICENSE.md licenses/korean-malicious-comments-dataset-LICENSE licenses/ONNX-Runtime-ThirdPartyNotices.txt
models/conflict/model.onnx models/conflict/tokenizer.json models/conflict/config.json
vendor/detector/inference-worker.js vendor/detector/ort-wasm-simd-threaded.mjs vendor/detector/ort-wasm-simd-threaded.wasm vendor/detector/ONNX-Runtime-LICENSE
src/background/background.js src/background/text-detection.js
src/offscreen/detection.html src/offscreen/detection.js
src/shared/block-stats.js src/shared/block-stats-history.js src/shared/detection-config.js src/shared/keyword-matcher.js
src/shared/storage/user-block-store.js src/shared/storage/dccon-block-store.js
src/content/appearance/comment-author.css src/content/appearance/compact-list.js src/content/appearance/dc-theme-bridge.js src/content/appearance/font-config.js src/content/appearance/font-manager.js
src/content/cleaner/cleaner-anonymous.js src/content/cleaner/cleaner-comment.js src/content/cleaner/cleaner-dory.js src/content/cleaner/cleaner-gall.js src/content/cleaner/cleaner-gamemeca.js src/content/cleaner/cleaner-img-comment.js src/content/cleaner/cleaner-notice.js src/content/cleaner/cleaner-search.js src/content/cleaner/cleaner.js
src/content/core/content_script.js src/content/dccon/cleaner-dccon.js src/content/dccon/dccon-blocker.js src/content/detection/text-detector.js
src/content/gallery/access-guard.js src/content/gallery/gallery-quick-block.js src/content/gallery/link-blocker.js
src/content/image/image-account-filter.js src/content/image/image-blocker.js
src/content/keyword/keyword-blocker.js src/content/keyword/keyword-hider.js src/content/list/list-filter.js
src/content/tools/area-picker.js src/content/tools/auto-refresh.js
src/content/user/account-activity-blocker.js src/content/user/cleaner-userblock.js src/content/user/ctx-probe.js src/content/user/member-ip-view.js src/content/user/uid-badge.js src/content/user/user-memo.js
src/ui/options/options.html src/ui/options/options.js src/ui/popup/popup.html src/ui/popup/popup.js
src/ui/shared/dccon-block-options.js src/ui/shared/font-ui.js src/ui/shared/image-account-settings-ui.js src/ui/shared/keyword-hide-ui.js src/ui/shared/reading-settings.css src/ui/shared/text-detection-ui.js src/ui/shared/ui-settings-cache.js
`.trim().split(/\s+/).sort();
if (new Set(files).size !== files.length) throw new Error("Duplicate runtime file");
const root = new URL("../", import.meta.url);
await verifyModel(modelFile);
await verifyTokenizer(tokenizerFile);
await import("./build-detector.mjs");
const workspace = await realpath(fileURLToPath(root));
const outputDirectory = join(workspace, "dist");
await mkdir(outputDirectory, { recursive: true });
if (await realpath(outputDirectory) !== outputDirectory) throw new Error("설치 파일 출력 경로가 작업 폴더 밖을 가리킵니다.");
const target = join(outputDirectory, "DCinside-Gallery-Blocker");
const staging = await mkdtemp(join(outputDirectory, ".extension-stage-"));
const archive = join(outputDirectory, "DCinside-Gallery-Blocker.zip");
const pendingArchive = `${staging}.zip`;
async function removeGenerated(folder) {
  const entry = await lstat(folder).catch(error => { if (error.code === "ENOENT") return null; throw error; });
  if (!entry) return;
  if (!(basename(folder) === "DCinside-Gallery-Blocker" || basename(folder).startsWith(".extension-stage-"))
    || dirname(folder) !== outputDirectory || entry.isSymbolicLink() || await realpath(folder) !== folder) throw new Error("생성 폴더의 실제 위치를 확인하지 못했습니다.");
  await rm(folder, { recursive: true });
}
const sizes = [];
try {
  const manifest = JSON.parse(await readFile(new URL("manifest.json", root), "utf8"));
  const referenced = [manifest.background.service_worker, manifest.action.default_popup, manifest.options_page,
    ...Object.values(manifest.icons), ...manifest.content_scripts.flatMap(script => [...script.js || [], ...script.css || []])];
  for (const path of referenced) if (!files.includes(path)) throw new Error(`Runtime allowlist misses ${path}`);
  for (const path of files) {
    const source = join(workspace, path);
    const info = await lstat(source);
    if (!info.isFile() || await realpath(source) !== source) throw new Error(`Unsafe runtime file: ${path}`);
    await mkdir(dirname(join(staging, path)), { recursive: true });
    await copyFile(source, join(staging, path));
    sizes.push({ path, bytes: info.size });
  }
  execFileSync("/usr/bin/zip", ["-q", "-9", "-X", pendingArchive, ...files], { cwd: staging });
  await removeGenerated(target);
  await rename(staging, target);
  await rename(pendingArchive, archive);
} finally {
  await removeGenerated(staging);
  await removeGenerated(pendingArchive);
}
console.log(JSON.stringify({ directory: target, archive, fileCount: sizes.length,
  unpackedBytes: sizes.reduce((sum, file) => sum + file.bytes, 0), zipBytes: (await stat(archive)).size,
  modelBytes: sizes.find(file => file.path.endsWith("model.onnx")).bytes,
  runtimeBytes: sizes.filter(file => file.path.startsWith("vendor/")).reduce((sum, file) => sum + file.bytes, 0),
  largestFiles: sizes.sort((a, b) => b.bytes - a.bytes).slice(0, 8) }, null, 2));

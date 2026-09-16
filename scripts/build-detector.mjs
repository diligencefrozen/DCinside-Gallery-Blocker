import { build } from "esbuild";
import { mkdir, copyFile, writeFile, realpath } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = new URL("../", import.meta.url);
await mkdir(new URL("vendor/detector/", root), { recursive: true });
await build({
  entryPoints: {
    "inference-worker": fileURLToPath(new URL("src/offscreen/inference-worker.js", root))
  },
  outdir: fileURLToPath(new URL("vendor/detector/", root)),
  bundle: true,
  platform: "browser",
  format: "iife",
  conditions: ["onnxruntime-web-use-extern-wasm"],
  target: "chrome116",
  minify: true,
  legalComments: "eof"
});
const runtimeDir = new URL("node_modules/onnxruntime-web/dist/", root);
for (const name of ["ort-wasm-simd-threaded.mjs", "ort-wasm-simd-threaded.wasm"]) {
  await copyFile(new URL(name, runtimeDir), new URL(`vendor/detector/${name}`, root));
}
await copyFile(new URL("node_modules/@huggingface/transformers/LICENSE", root), new URL("vendor/detector/Transformers-LICENSE", root));
const transformerRequire = createRequire(await realpath(new URL("node_modules/@huggingface/transformers/package.json", root)));
const jinjaLicense = resolve(dirname(transformerRequire.resolve("@huggingface/jinja")), "../LICENSE");
await copyFile(jinjaLicense, new URL("vendor/detector/Jinja-LICENSE", root));
// The npm distribution omits LICENSE; retain the notice from the pinned upstream release.
// https://github.com/microsoft/onnxruntime/blob/v1.27.0/LICENSE
await writeFile(new URL("vendor/detector/ONNX-Runtime-LICENSE", root), `MIT License

Copyright (c) Microsoft Corporation

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:
The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.
THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
`);
console.log("Local inference runtime bundled.");

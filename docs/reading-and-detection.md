# Local text detection: development and packaging

The optional aggressive-expression detector runs entirely in the browser. Its tokenizer/configuration files are tracked in this repository, but the ONNX weight file and generated browser runtime are intentionally not committed.

## Why `model.onnx` is not in Git

`models/conflict/model.onnx` is 179,977,829 bytes (about 180 MB), which is larger than GitHub's normal 100 MB per-file limit. The repository therefore keeps the model contract and checksum, while the weight file is supplied separately when developing or packaging the extension.

Expected model:

- Path: `models/conflict/model.onnx`
- Size: `179,977,829` bytes
- SHA-256: `ee0a81fb619684f75cf13b2fa10e1827ea5747be52aa9ec86ade36652ba77e67`

The canonical values are also defined in `scripts/model-artifact.mjs` and `models/conflict/CONTRACT.md`.

## Prepare a source checkout

Requirements:

- Node.js 20 or newer recommended
- npm (or a compatible package manager)
- A local copy of the verified `model.onnx`

Install dependencies:

```bash
npm install
```

Register and verify the model:

```bash
npm run prepare:detector -- --from /path/to/model.onnx
```

This command copies the model into `models/conflict/model.onnx` only after its exact size and SHA-256 digest have been verified.

Build the local browser inference runtime:

```bash
npm run build:detector
```

This generates `vendor/detector/`, including the bundled inference worker and the pinned ONNX Runtime Web WASM files. The directory is generated output and is intentionally ignored by Git.

After those steps, the repository root can be loaded with Chrome's **Load unpacked** command.

## Build the release folder

Once dependencies and the model are prepared, run:

```bash
npm run package:extension
```

The command verifies the model, rebuilds the inference runtime, and creates:

```text
dist/DCinside-Gallery-Blocker/
```

That folder contains the runtime files, model, license notices, privacy document, and extension source required for packaging.

Do not create a Chrome Web Store ZIP from the repository root. Package the contents of `dist/DCinside-Gallery-Blocker/` instead.

## Licensing

The extension source is distributed under GPL-3.0. Third-party notices and preserved dataset/runtime licenses belong in `THIRD_PARTY_NOTICES.md` and `licenses/`.

The software license does not itself determine the licensing status of learned model weights. Review the applicable data and model terms before redistributing the model.

# Local AI expression filter: development and packaging

The opt-in expression filter runs entirely in the browser. It folds text that may contain aggressive, insulting, or threatening expressions; it does not judge an author, trigger reports, or take account action. The repository includes the verified ONNX model, tokenizer files, and the pinned browser inference runtime required to use the feature from a normal source checkout.

The current delivery mode is `bundled`: no remote JavaScript, WASM, or arbitrary ONNX graph is downloaded. Because Chrome cannot delete immutable files from an installed extension package, a separate “model delete” control would not recover space and is intentionally not exposed. When the feature is off, the inference worker and content observer remain stopped.

## Tracked model

- Path: `models/conflict/model.onnx`
- Size: `2,404,471` bytes
- SHA-256: `aaf25775067db31d8378b8ec7e0290757f64c509b45636a82db716d6400f1c26`

The canonical values are defined in both `models/conflict/CONTRACT.md` and `scripts/model-artifact.mjs`.

Verify the checked-in model with:

```bash
node --input-type=module -e "import('./scripts/model-artifact.mjs').then(m => m.verifyModel(m.modelFile))"
```

## Browser inference runtime

`vendor/detector/` is tracked so the repository can be loaded directly with Chrome's **Load unpacked** command. It contains the bundled inference worker and the pinned ONNX Runtime Web WASM files.

To rebuild that runtime from the lockfile:

```bash
pnpm install --frozen-lockfile
npm run build:detector
```

## Build the release folder

```bash
npm run package:extension
```

The release folder is created at:

```text
dist/DCinside-Gallery-Blocker/
```

Package the contents of that directory for Chrome Web Store distribution instead of zipping the repository root.

## Licensing

Project licensing is documented in `LICENSE` and `THIRD_PARTY_NOTICES.md`. Dataset notices are preserved under `licenses/`, while runtime-specific notices are kept with `vendor/detector/` and in the ONNX Runtime third-party notice file.

// Unified Manifest V3 background entry for Chromium and Firefox.
// Dependencies expose their APIs on globalThis so the existing background code stays shared.
import "../shared/block-stats-history.js";
import "../shared/release-version.js";
import "../shared/storage/user-block-store.js";
import "../shared/detection-config.js";
import "../../vendor/detector/inference-runtime.mjs";
import "./text-detection.js";
import "./background.js";

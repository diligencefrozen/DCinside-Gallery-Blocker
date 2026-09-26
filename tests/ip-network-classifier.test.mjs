import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync(new URL("../src/shared/ip-network-classifier.js", import.meta.url), "utf8");
const context = { globalThis: {}, decodeURIComponent };
context.globalThis = context;
vm.runInNewContext(source, context);
const { classify } = context.DCBIpNetworkClassifier;

test("IP network classifier distinguishes domestic, foreign and uncertainty", () => {
  assert.equal(classify("118.235.12.1").category, "domestic");
  assert.equal(classify("8.8.8.8").category, "foreign");
  assert.equal(classify("101.99.1.1").category, "anonymizer");
  assert.equal(classify("8.37.1.1").category, "relay");
  assert.equal(classify("").category, "unknown");
  assert.equal(classify("999.1.1.1").category, "unknown");
});

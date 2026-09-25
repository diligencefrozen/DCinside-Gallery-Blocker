#!/usr/bin/env python3
"""Audit the shipped ONNX graph and create a local external-data proof of concept."""
import hashlib
import importlib.metadata
import json
from pathlib import Path
import sys
import types

ROOT = Path(__file__).resolve().parent.parent
DEPS = ROOT / "test-results" / "python-deps"
sys.path.insert(0, str(DEPS))
# The protobuf schema is sufficient for this audit and avoids loading ONNX's optional C++ checker DLL.
onnx_package = types.ModuleType("onnx")
onnx_package.__path__ = [str(DEPS / "onnx")]
sys.modules["onnx"] = onnx_package
from onnx.onnx_ml_pb2 import ModelProto, TensorProto

MODEL = ROOT / "models" / "conflict" / "model.onnx"
REPORT = ROOT / "test-results" / "onnx-model-audit.json"
CONFIG = ROOT / "models" / "conflict" / "required-operators.config"
POC = ROOT / "test-results" / "external-data-poc"

model = ModelProto()
model.ParseFromString(MODEL.read_bytes())
opsets = {item.domain or "ai.onnx": item.version for item in model.opset_import}
operators = {}
for node in model.graph.node:
    domain = node.domain or "ai.onnx"
    operators.setdefault(domain, set()).add(node.op_type)

initializers = []
for tensor in model.graph.initializer:
    raw_bytes = len(tensor.raw_data)
    initializers.append({
        "name": tensor.name,
        "dataType": TensorProto.DataType.Name(tensor.data_type),
        "dims": list(tensor.dims),
        "rawBytes": raw_bytes,
        "dataLocation": TensorProto.DataLocation.Name(tensor.data_location),
    })

config_lines = ["# Generated from models/conflict/model.onnx; domain;opset;operators"]
for domain in sorted(operators):
    config_lines.append(f"{domain};{opsets[domain]};{','.join(sorted(operators[domain]))}")
# ORT's graphOptimizationLevel="all" fuses the residual Gemm at session load.
# A reduced runtime must register this generated kernel as well as graph nodes.
config_lines.append("com.microsoft;1;FusedGemm")
CONFIG.write_text("\n".join(config_lines) + "\n", encoding="utf-8")

POC.mkdir(parents=True, exist_ok=True)
external_model = ModelProto()
external_model.CopyFrom(model)
external_path = POC / "model.onnx"
weights_path = POC / "model.weights"
if weights_path.exists():
    weights_path.unlink()
offset = 0
with weights_path.open("wb") as weights:
    for tensor in external_model.graph.initializer:
        if not tensor.raw_data:
            continue
        payload = bytes(tensor.raw_data)
        weights.write(payload)
        tensor.ClearField("raw_data")
        tensor.data_location = TensorProto.EXTERNAL
        for key, value in (("location", "model.weights"), ("offset", str(offset)), ("length", str(len(payload)))):
            entry = tensor.external_data.add()
            entry.key = key
            entry.value = value
        offset += len(payload)
external_path.write_bytes(external_model.SerializeToString())

def sha256(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

report = {
    "onnxVersion": importlib.metadata.version("onnx"),
    "irVersion": model.ir_version,
    "producerName": model.producer_name,
    "producerVersion": model.producer_version,
    "docString": model.doc_string,
    "graphName": model.graph.name,
    "opsets": opsets,
    "operators": {domain: sorted(values) for domain, values in operators.items()},
    "nodeCount": len(model.graph.node),
    "inputs": [{"name": value.name, "type": str(value.type)} for value in model.graph.input],
    "outputs": [{"name": value.name, "type": str(value.type)} for value in model.graph.output],
    "initializers": initializers,
    "original": {"bytes": MODEL.stat().st_size, "sha256": sha256(MODEL)},
    "externalDataPoc": {
        "graphBytes": external_path.stat().st_size,
        "graphSha256": sha256(external_path),
        "weightsBytes": weights_path.stat().st_size,
        "weightsSha256": sha256(weights_path),
        "combinedBytes": external_path.stat().st_size + weights_path.stat().st_size,
    },
}
REPORT.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(json.dumps(report, ensure_ascii=False, indent=2))

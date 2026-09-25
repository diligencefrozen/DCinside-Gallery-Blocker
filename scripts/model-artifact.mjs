import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createHash } from "node:crypto";

export const modelFile = new URL("../models/conflict/model.onnx", import.meta.url);
export const tokenizerFile = new URL("../models/conflict/tokenizer.json", import.meta.url);
export const modelIdentity = Object.freeze({
  byteLength: 2_404_471,
  digest: "aaf25775067db31d8378b8ec7e0290757f64c509b45636a82db716d6400f1c26"
});
export const tokenizerIdentity = Object.freeze({
  byteLength: 3_500_909,
  digest: "298229bd7e9ca9251eed8f328e0364bdb564da8915466b9fda95a197973ca920"
});

async function verifyArtifact(file, identity, label, missingHint) {
  const details = await stat(file).catch(error => {
    if (error?.code === "ENOENT") {
      throw new Error(`${label}이 없습니다. ${missingHint}`);
    }
    throw error;
  });
  if (!details.isFile() || details.size !== identity.byteLength) {
    throw new Error(`${label}의 파일 크기가 올바르지 않습니다.`);
  }
  const checksum = createHash("sha256");
  for await (const chunk of createReadStream(file)) checksum.update(chunk);
  if (checksum.digest("hex") !== identity.digest) {
    throw new Error(`${label}의 무결성 검증에 실패했습니다.`);
  }
}

export function verifyModel(file = modelFile) {
  return verifyArtifact(file, modelIdentity, "분석 모델", "models/conflict/model.onnx 파일을 확인해 주세요.");
}

export function verifyTokenizer(file = tokenizerFile) {
  return verifyArtifact(file, tokenizerIdentity, "분석 토크나이저", "models/conflict/tokenizer.json 파일을 확인해 주세요.");
}

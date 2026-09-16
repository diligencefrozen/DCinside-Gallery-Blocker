import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createHash } from "node:crypto";

export const modelFile = new URL("../models/conflict/model.onnx", import.meta.url);
export const modelIdentity = Object.freeze({
  byteLength: 179_977_829,
  digest: "ee0a81fb619684f75cf13b2fa10e1827ea5747be52aa9ec86ade36652ba77e67"
});

export async function verifyModel(file) {
  const details = await stat(file).catch(error => {
    if (error?.code === "ENOENT") {
      throw new Error("분석 모델이 없습니다. scripts/prepare-detector.mjs --from <model.onnx 경로>로 먼저 등록해 주세요.");
    }
    throw error;
  });
  if (!details.isFile() || details.size !== modelIdentity.byteLength) {
    throw new Error("분석 모델의 파일 크기가 올바르지 않습니다.");
  }
  const checksum = createHash("sha256");
  for await (const chunk of createReadStream(file)) checksum.update(chunk);
  if (checksum.digest("hex") !== modelIdentity.digest) {
    throw new Error("분석 모델의 무결성 검증에 실패했습니다.");
  }
}

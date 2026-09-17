import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createHash } from "node:crypto";

export const modelFile = new URL("../models/conflict/model.onnx", import.meta.url);
export const modelIdentity = Object.freeze({
  byteLength: 2_404_471,
  digest: "aaf25775067db31d8378b8ec7e0290757f64c509b45636a82db716d6400f1c26"
});

export async function verifyModel(file) {
  const details = await stat(file).catch(error => {
    if (error?.code === "ENOENT") {
      throw new Error("분석 모델이 없습니다. 저장소의 models/conflict/model.onnx 파일을 확인해 주세요.");
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

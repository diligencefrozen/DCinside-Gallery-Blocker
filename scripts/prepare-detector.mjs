import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, rename, rm } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { pipeline } from "node:stream/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { modelFile, verifyModel } from "./model-artifact.mjs";

const arguments_ = process.argv.slice(2);
if (arguments_.length && (arguments_.length !== 2 || arguments_[0] !== "--from")) {
  throw new Error("사용법: node scripts/prepare-detector.mjs [--from 모델파일경로]");
}

if (!arguments_.length) {
  await verifyModel(modelFile);
  console.log("등록된 분석 모델의 무결성을 확인했습니다.");
} else {
  const supplied = pathToFileURL(resolve(arguments_[1]));
  await verifyModel(supplied);
  if (supplied.href !== modelFile.href) {
    await mkdir(new URL("./", modelFile), { recursive: true });
    const pendingFile = new URL(`.model-${randomUUID()}.part`, modelFile);
    try {
      await pipeline(createReadStream(supplied), createWriteStream(pendingFile, { flags: "wx" }));
      await verifyModel(pendingFile);
      await rename(pendingFile, modelFile);
    } finally {
      await rm(pendingFile, { force: true });
    }
  }
  console.log("로컬 분석 모델을 등록하고 검증했습니다.");
}

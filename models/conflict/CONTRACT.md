# 텍스트 분석 모델 계약

- 파일: `model.onnx`, INT8, 179,977,829바이트.
- SHA-256: `ee0a81fb619684f75cf13b2fa10e1827ea5747be52aa9ec86ade36652ba77e67`.
- 로컬 파일 등록: `scripts/prepare-detector.mjs`. 무결성 기준: `scripts/model-artifact.mjs`.
- 입력: 제목·댓글 형식의 문장을 로컬 토크나이저로 변환한 `input_ids`, `attention_mask`, int64 `[batch, sequence]`, 최대 256토큰.
- 출력: `troll_label`, float32 `[batch]` 로짓. sigmoid를 한 번 적용합니다.
- 게시글은 같은 입력 계약을 사용한 실험 기능입니다. 긴 글은 잘릴 수 있으며 출력 점수는 교정된 확률이 아닙니다.
- 가중치와 토크나이저 어휘는 변경하지 않았습니다. 모델을 교체할 때는 입력·출력 이름, 자료형, 차원과 임계값을 다시 검증해야 합니다.

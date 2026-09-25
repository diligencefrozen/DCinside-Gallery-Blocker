# AI 모델·패키지 감사 보고서

측정일: 2026-09-25  
대상 릴리스: `7.3.42.2026`

## 결론

기존 Extension은 현재 ONNX 모델과 다른 Hugging Face WordPiece tokenizer를 사용하고 `attention_mask`를 `feature_weights`로 전달했다. tensor shape는 맞았지만 학습 의미와 달랐고, 정상/공격 점수 역전과 긴 정상 글의 1.0 근접값은 이 입력 계약 위반에서 비롯됐다. 학습 artifact의 문자 1–5-gram TF-IDF tokenizer를 복원한 뒤 동일 증상은 재현되지 않았다.

모델 파이프라인은 이제 계약과 일치하지만 독립적인 130문장 합성 fixture에서 균형 설정 recall이 0.56에 그쳤다. 따라서 기능은 기본 OFF, 게시글 분석 기본 OFF, `실험 기능` 표시를 유지한다. threshold를 작은 표본에 맞춰 새로 튜닝하지 않았고, 학습 validation에서 정한 `0.86 / 0.66 / 0.49`를 복원했다.

## 모델 계약 확인

- positive label은 `1 = aggressive`, `0 = normal`이다.
- `aggressive_score`는 확률이 아닌 보정되지 않은 logit이다. 브라우저에서 sigmoid를 정확히 한 번 적용한다.
- 입력은 `input_ids` int64 `[batch, features]`와 `feature_weights` float32 `[batch, features]`다.
- `input_ids`는 WordPiece token ID가 아니라 문자 1–5-gram vocabulary index다.
- `feature_weights`는 각 n-gram의 sublinear TF-IDF 값이며 한 문장 벡터를 L2 정규화한 값이다. attention mask가 아니다.
- NFKC, 공백 정리, 소문자화 뒤 앞 256 Unicode code point를 사용한다. 특수 token, PAD, CLS/BOS, SEP/EOS는 사용하지 않으며 미등록 n-gram은 버린다.
- 댓글은 raw comment만, 게시글은 `제목: … 댓글: …` 형식으로 만든다. 이는 학습 당시 댓글/게시글 경로와 같다.

고정 artifact:

| 자산 | bytes | SHA-256 |
| --- | ---: | --- |
| `model.onnx` | 2,404,471 | `aaf25775067db31d8378b8ec7e0290757f64c509b45636a82db716d6400f1c26` |
| `tokenizer.json` | 3,500,909 | `298229bd7e9ca9251eed8f328e0364bdb564da8915466b9fda95a197973ca920` |

## 재현 가능한 평가

`tests/fixtures/ai-evaluation.ko.mjs`에 개인정보가 없는 합성 한국어 130문장(positive 50, negative 80)을 두었다. 정상, 일상, 정보, 욕설 언급, 인용, 게임/스포츠, 풍자·농담, DC식 축약/초성/변형, 직접 욕설·모욕, 위협, 공격적 명령을 포함한다. 이는 실제 서비스 분포를 대표하는 공식 corpus가 아니라 회귀와 실패 형태 확인용 fixture다.

| 설정 | threshold | TP | FP | TN | FN | Precision | Recall | F1 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 신중하게 | 0.86 | 18 | 1 | 79 | 32 | 0.9474 | 0.3600 | 0.5217 |
| 균형 있게 | 0.66 | 28 | 3 | 77 | 22 | 0.9032 | 0.5600 | 0.6914 |
| 폭넓게 | 0.49 | 32 | 6 | 74 | 18 | 0.8421 | 0.6400 | 0.7273 |

직접 욕설은 강하지만 위협·간접 적대·공격적 명령 recall이 부족하다. 안정 기능으로 기본 활성화할 수준이라고 판단하지 않았다. 재학습 시에는 최신 DC 문체의 독립 label 자료, 위협/간접 적대 hard example, 인용·욕설 언급 hard negative를 보강하고 calibration을 별도 validation에서 다시 해야 한다.

긴 글 진단의 chunk score는 다음과 같다.

| case | chunk scores | max / mean / median |
| --- | --- | --- |
| 다양한 정상 글 | 0.249, 0.060, 0.098 | 0.249 / 0.135 / 0.098 |
| 반복 정상 글 | 0.067, 0.037, 0.033 | 0.067 / 0.046 / 0.037 |
| 마지막 chunk 공격 | 0.044, 0.017, 0.983 | 0.983 / 0.348 / 0.044 |
| 공격 표현 인용 | 0.032, 0.303, 0.054 | 0.303 / 0.130 / 0.054 |

교정된 tokenizer에서는 긴 정상 글 1.0 현상이 사라졌다. `max`는 마지막 chunk에만 있는 공격을 잡았고 mean/median은 놓쳤으므로 aggregation은 변경하지 않았다.

## ONNX와 Reduced ORT

모델은 opset 17이며 원본 graph 연산자는 `Add, Cast, Constant, Gather, Gemm, Mul, ReduceSum, Relu, Squeeze, Unsqueeze`다. `graphOptimizationLevel: all`이 실행 시 만드는 `com.microsoft.FusedGemm`도 reduced config에 포함했다.

ORT Web 1.27.0, Emscripten 4.0.23, SIMD+threads, MinSizeRel로 custom WASM을 빌드했다.

| 항목 | 기존 | reduced | 변화 |
| --- | ---: | ---: | ---: |
| WASM bytes | 13,479,978 | 4,213,979 | -68.7% |
| loader bytes | 24,180 | 18,372 | -24.0% |
| cold load, Node WASM | 327.9ms | 251.6ms | 해당 실행에서 -76.3ms |
| warm median | 0.0902ms | 0.0942ms | 사실상 동일 |

130개 입력의 기존/reduced 최대 score 차이는 정확히 `0`이었다. Chromium extension worker에서도 최초 추론 339ms, cache 2ms, category batch 5ms, long batch 3ms, 외부 요청 및 경고 없이 통과했다. Reduced ORT는 패키지 내부에만 포함하며 원격 JS/WASM 실행은 사용하지 않는다.

## External data와 tokenizer 분리 PoC

ONNX external-data 변환 결과는 고정 graph 2,530B와 pure tensor weights 2,402,332B였다. ORT Web의 `externalData` 옵션으로 130개를 재평가했고 단일 ONNX와 최대 score 차이는 `0`이었다. 따라서 graph/contract는 Extension에 고정하고 data만 선택 다운로드하는 구조가 기술적으로 가능하다.

tokenizer 실행 코드는 약 2KB의 로컬 JS이고 vocabulary/IDF data는 독립 `tokenizer.json` 3,500,909B다. data만 선택 다운로드할 수 있다. external weights와 tokenizer data를 묶은 실제 PoC ZIP은 비압축 5,903,241B, 압축 2,638,658B다.

## 최종 패키지 실측

`scripts/package-extension.mjs` 뒤 `Compress-Archive -CompressionLevel Optimal`로 측정했다.

| 구성 | 비압축 bytes | ZIP entry 압축 bytes |
| --- | ---: | ---: |
| 전체 확장 | 13,184,909 | 최종 ZIP 5,661,980 |
| AI 관련 전체 | 10,258,965 | 4,092,073 |
| Reduced ORT WASM | 4,213,979 | 1,402,367 |
| ORT loader | 18,372 | 7,660 |
| inference worker | 55,070 | 18,541 |
| ONNX | 2,404,471 | 2,094,289 |
| tokenizer data | 3,500,909 | 545,069 |
| 기타 AI 연결 코드 | 57,631 | 19,200 |

최종 ZIP SHA-256는 `d692b371529ad7a31b2db54899d6a430bc0777a33a7f4ce1c58085be8d0c18ba`이다. 모델·tokenizer·ORT 같은 AI asset 두 디렉터리를 제외한 실측 base ZIP은 비압축 2,983,851B, 압축 1,587,788B다.

선택 설치 구조로 fixed graph와 reduced ORT를 기본 ZIP에 남기고 weights+tokenizer만 받으면 기본 ZIP은 약 3.03MB, 추가 다운로드는 실제 PoC 기준 약 2.64MB다. AI 기능을 기본 배포에서 완전히 제외하는 별도 build라면 약 1.59MB까지 줄일 수 있지만 사용자 승인 없이 제거하지 않았다.

## 선택 설치 판단

설치/삭제 UI는 이번 작업에서 구현하지 않았다. 기술 PoC는 성공했지만 현재 모델의 독립 fixture recall이 낮아, 불안정한 기능을 위한 영구 저장소·다운로드 수명주기를 제품에 추가할 단계가 아니기 때문이다. 가짜 삭제 버튼도 만들지 않았다.

출시 가능한 선택 설치에는 다음이 더 필요하다.

1. 고정 HTTPS release asset과 Chrome Web Store 정책 확인
2. `modelVersion`, `detectorVersion`, `minExtensionVersion`, byte size, SHA-256을 담은 signed/pinned manifest
3. 임시 저장 → size/hash/compatibility 검사 → IndexedDB 원자 commit
4. network/hash/storage 실패 시 기존 정상 자산 유지와 불완전 자산 폐기
5. 실제 데이터 삭제, 버전 rollback, quota/브라우저 재시작 회귀 테스트

현 릴리스 판단에 필요한 사실은 명확하다. 파이프라인 오류는 고쳤고 패키지는 크게 줄었지만 모델 자체의 미탐 문제가 남아 있다. 따라서 bundled 상태를 유지하더라도 기본 OFF·실험 표시가 필요하며, 품질 재학습 전 선택 설치나 기본 활성화를 진행하지 않는다.

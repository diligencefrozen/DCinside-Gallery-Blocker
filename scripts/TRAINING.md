# 공격적 표현 감지 모델 재학습

학습은 저장소 밖의 임시 작업 폴더에서 실행합니다. 파이프라인은 세 archive를 직접 읽지만 그 안의 구현 코드는 import하거나 복사하지 않습니다. seed는 `7392026`으로 고정되어 있습니다.

현재 모델을 만든 입력 archive는 다음 파일 크기와 SHA-256으로 고정합니다. 학습 스크립트는 세 값과 Curse 5,825행, BEEP! labeled 8,367행·unlabeled 2,033,893행, Malicious 10,000행·복구 25행을 확인한 뒤 진행합니다.

| 입력 | 바이트 | SHA-256 |
| --- | ---: | --- |
| Curse-detection-data-master.zip | 219,977 | `d6130305892160a05d52a5231391b45cba68b317b898d26aa5778b5019032d58` |
| korean-hate-speech-master.zip | 95,851,415 | `c917a8b4fb6dafe8cf0286efb275a860f2667ccfa6f18d69c960f19faa985891` |
| korean-malicious-comments-dataset-master.zip | 454,043 | `f2d36d2d3fb5dce46691797039f952dbad45b9e9135a5dd67d61024cf9b4ad85` |

검증 환경의 주요 버전은 Python 3, numpy 2.5.3, scipy 1.18.1, scikit-learn 1.9.1, PyTorch 2.14.0, ONNX 1.22.0, ONNX Runtime 1.30.0, joblib 1.6.0입니다. 브라우저 runtime은 package.json의 ONNX Runtime Web 버전을 사용합니다.

```bash
python3 -m venv /tmp/dcb-detector-venv
/tmp/dcb-detector-venv/bin/pip install -r scripts/requirements-detector.txt
/tmp/dcb-detector-venv/bin/python -B scripts/train-detector.py \
  --curse /path/to/Curse-detection-data-master.zip \
  --hate /path/to/korean-hate-speech-master.zip \
  --malicious /path/to/korean-malicious-comments-dataset-master.zip \
  --work-dir /tmp/dcb-detector-work \
  --output-dir /tmp/dcb-detector-final
```

`--work-dir`에는 provenance, teacher, pseudo reservoir, FP32 후보와 checkpoint가 생기므로 저장소 안 경로를 거부합니다. 최종 `model.onnx`와 `tokenizer.json`만 모델 폴더에 반영하고, `scripts/model-artifact.mjs`, `models/conflict/config.json`, `models/conflict/CONTRACT.md`, `src/shared/detection-config.js`의 두 파일 digest·계약·임계값을 함께 갱신합니다.

중단된 같은 실행을 이어갈 때만 `--resume`을 추가합니다. 작업 폴더의 archive·seed·학습 스크립트 지문이 하나라도 다르면 기존 teacher와 pseudo 자료를 재사용하지 않고 중단합니다.

반영 전 확인 사항은 다음과 같습니다.

- 세 자료의 행 수, malformed 25행 복구, label 방향과 source/aux provenance
- 정규화 group을 먼저 만든 뒤 split했는지와 evaluation 중복 배제
- unlabeled 2,033,893행 전체 순회 및 사람 label 중복 제외
- 후보와 임계값 선택에 validation만 사용했는지
- FP32/INT8의 validation 차이, 고정 evaluation의 전체/source/severity/길이/title 지표
- ONNX 입력·출력 계약과 sigmoid 1회 적용
- Python과 JS의 정규화·TF-IDF feature 일치
- 실제 Chrome worker의 최초 로딩, 반복/4건 batch 추론, 종료 후 worker 해제

평가 수치를 좋게 보이게 만들 목적으로 evaluation에 맞춰 모델·threshold를 다시 고르지 않습니다. 자세한 현재 결과와 알려진 실패 형태는 [모델 카드](../models/conflict/MODEL_CARD.md)에 기록합니다.

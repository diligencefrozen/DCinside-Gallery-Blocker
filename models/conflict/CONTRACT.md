# 공격적 표현 감지 모델 계약

- 모델: `model.onnx`, 2,404,471바이트, SHA-256 `aaf25775067db31d8378b8ec7e0290757f64c509b45636a82db716d6400f1c26`.
- 토크나이저: `tokenizer.json`, 3,500,909바이트, SHA-256 `298229bd7e9ca9251eed8f328e0364bdb564da8915466b9fda95a197973ca920`. NFKC·공백 정리·소문자 변환 후 앞 256개 Unicode code point에서 문자 1–5-gram TF-IDF를 계산합니다.
- 입력: `input_ids` int64 `[batch, features]`, `feature_weights` float32 `[batch, features]`. 한 입력은 최대 1,270개 feature입니다.
- 출력: `aggressive_score` float32 `[batch]` 로짓. 브라우저가 sigmoid를 정확히 한 번 적용합니다.
- 구조: 16차원 학습 임베딩 합산과 32-unit residual MLP. 임베딩은 행 단위 대칭 INT8, 작은 head는 FP32입니다.
- 임계값: 신중하게 `0.86`, 균형 있게 `0.66`, 폭넓게 `0.49`. 별도 validation split으로 정했고 evaluation split은 선택에 쓰지 않았습니다.
- 댓글은 댓글 내용만 사용합니다. 게시글 본문은 제목과 본문을 `제목: … 댓글: …` 형태로 결합하는 시험 기능입니다.
- 출력은 교정된 확률이나 작성자에 대한 판단이 아닙니다. 오탐과 미탐이 모두 생길 수 있습니다.

모델이나 토크나이저를 교체할 때는 [학습 절차](../../scripts/TRAINING.md)에 따라 입력·출력 이름, 자료형, 차원, JS/Python 변환 일치 여부와 임계값을 다시 검증해야 합니다.

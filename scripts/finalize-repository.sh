#!/usr/bin/env bash
set -euo pipefail

python - <<'PY'
from pathlib import Path

def replace_section(text, heading, replacement):
    start = text.index(heading)
    end = text.index('\n---', start)
    return text[:start] + replacement.rstrip() + '\n' + text[end:]

en = Path('README.md')
text = en.read_text(encoding='utf-8')
text = text.replace(
    'The extension UI and filtering logic are built with plain JavaScript, HTML, and CSS. Most features need no external service. The optional on-device aggressive-expression detector uses a local ONNX model and a generated ONNX Runtime Web bundle; source checkouts must prepare those artifacts before using that feature.',
    'The extension UI and filtering logic are built with plain JavaScript, HTML, and CSS. Most features need no external service. The optional on-device aggressive-expression detector also runs locally, and the verified ONNX model plus pinned browser runtime are included in the repository.'
)
text = replace_section(text, '## Run It Locally', '''## Run It Locally

Clone the repository:

```bash
git clone https://github.com/diligencefrozen/DCinside-Gallery-Blocker.git
```

Then:

1. Open `chrome://extensions`.
2. Turn on **Developer mode**.
3. Click **Load unpacked**.
4. Select the project folder containing `manifest.json`.

No dependency installation or build step is required to load the checked-out extension in Chrome. The repository includes the verified local detector model and browser runtime used by the optional on-device aggressive-expression detection feature.

If you want to rebuild the detector runtime or create a fresh release folder, install the pinned dependencies and run:

```bash
pnpm install --frozen-lockfile
npm run build:detector
npm run package:extension
```

The distributable folder is created at `dist/DCinside-Gallery-Blocker/`.''')
en.write_text(text, encoding='utf-8')

ko = Path('README.ko.md')
text = ko.read_text(encoding='utf-8')
text = text.replace(
    '화면과 차단 기능 대부분은 JavaScript, HTML, CSS로 동작하며 별도의 개발자 서버를 사용하지 않습니다. 다만 선택 기능인 기기 내 공격적 표현 감지는 로컬 ONNX 모델과 브라우저용 실행 파일을 사용하므로, 소스 저장소에서 직접 실행할 때는 해당 파일을 한 번 준비해야 합니다.',
    '화면과 차단 기능 대부분은 JavaScript, HTML, CSS로 동작하며 별도의 개발자 서버를 사용하지 않습니다. 선택 기능인 기기 내 공격적 표현 감지도 로컬에서 작동하며, 검증된 ONNX 모델과 브라우저용 실행 파일을 저장소에 함께 포함합니다.'
)
text = replace_section(text, '## 직접 실행하기', '''## 직접 실행하기

저장소를 내려받거나 복제한 뒤 다음 주소를 엽니다.

```text
chrome://extensions
```

그다음:

1. **개발자 모드**를 켭니다.
2. **압축해제된 확장 프로그램을 로드합니다**를 누릅니다.
3. `manifest.json`이 있는 프로젝트 폴더를 선택합니다.

저장소에는 기기 내 공격적 표현 감지에 필요한 검증된 로컬 모델과 브라우저용 실행 파일도 함께 포함되어 있어, Chrome에서 직접 불러오기 위해 별도의 설치나 빌드 과정은 필요하지 않습니다.

감지용 실행 파일을 다시 만들거나 새 배포본을 생성하려면 다음 명령을 사용합니다.

```bash
pnpm install --frozen-lockfile
npm run build:detector
npm run package:extension
```

배포용 폴더는 `dist/DCinside-Gallery-Blocker/`에 생성됩니다.''')
ko.write_text(text, encoding='utf-8')
PY

mkdir -p licenses

cat > LICENSE <<'EOF'
DCinside Gallery Blocker
Copyright (C) 2025-2026 diligencefrozen

This program is free software: you can redistribute it and/or modify it
under the terms of the GNU General Public License version 3 as published
by the Free Software Foundation. This program is distributed without
any warranty; see the complete license below.

EOF
curl --fail --location --retry 3 https://www.gnu.org/licenses/gpl-3.0.txt >> LICENSE

curl --fail --location --retry 3 https://raw.githubusercontent.com/2runo/Curse-detection-data/master/LICENSE -o licenses/Curse-detection-data-LICENSE
curl --fail --location --retry 3 https://raw.githubusercontent.com/kocohub/korean-hate-speech/master/LICENSE.md -o licenses/korean-hate-speech-LICENSE.md
curl --fail --location --retry 3 https://raw.githubusercontent.com/ZIZUN/korean-malicious-comments-dataset/master/LICENSE -o licenses/korean-malicious-comments-dataset-LICENSE
curl --fail --location --retry 3 https://raw.githubusercontent.com/microsoft/onnxruntime/v1.27.0/ThirdPartyNotices.txt -o licenses/ONNX-Runtime-ThirdPartyNotices.txt

cat > THIRD_PARTY_NOTICES.md <<'EOF'
# Third-party notices

DCinside Gallery Blocker code is licensed under GPL-3.0. Copyright (C) 2025-2026 diligencefrozen. See [LICENSE](LICENSE).

## Korean training data

The independent training pipeline uses the supplied archives below. Dataset implementation code and training scripts are not copied. Text normalization, cross-source duplicate grouping, label conversion, teacher training and student distillation are project-specific processing. Source attribution is retained in the development data; it is not a prediction input.

| Dataset | Attribution | License | Preserved notice |
| --- | --- | --- | --- |
| [Curse Detection Data](https://github.com/2runo/Curse-detection-data) | Copyright (c) 2020 2runo | MIT | [License](licenses/Curse-detection-data-LICENSE) |
| [Korean HateSpeech / BEEP!](https://github.com/kocohub/korean-hate-speech) | Jihyung Moon, Won Ik Cho, Junbum Lee (2020) | CC BY-SA 4.0 | [License](licenses/korean-hate-speech-LICENSE.md) |
| [Korean Malicious Comments](https://github.com/ZIZUN/korean-malicious-comments-dataset) | Copyright (c) 2020 ZIZUN | MIT | [License](licenses/korean-malicious-comments-dataset-LICENSE) |

Korean Malicious Comments reuses portions of the first two datasets. Its archive's MIT notice does not remove upstream attribution or license terms. The pipeline preserves all three origins when grouping repeated text.

BEEP! citation: Moon, Jihyung; Cho, Won Ik; Lee, Junbum. *BEEP! Korean Corpus of Online News Comments for Toxic Speech Detection*. Proceedings of SocialNLP 2020, pp. 25–31. [Publication](https://aclanthology.org/2020.socialnlp-1.4/).

Raw datasets, news titles, unlabeled comments, teacher weights, pseudo-label corpora and training checkpoints are development inputs and are excluded from the extension package.

## Model weights

The software GPL-3.0 license is not a determination of the licensing status of learned model weights. In particular, this document does not decide the application of CC BY-SA 4.0 to weights trained using BEEP!. Training-data attribution is retained here and in the model card. Review the applicable data and model terms before redistributing weights; no separate permissive weight license is asserted.

## Browser inference runtime

ONNX Runtime Web is copyright Microsoft Corporation and licensed under MIT. The build preserves its pinned upstream license as `vendor/detector/ONNX-Runtime-LICENSE`, and the upstream v1.27.0 third-party notices as `licenses/ONNX-Runtime-ThirdPartyNotices.txt`; both accompany the runtime in the installation package. Runtime and model files execute locally; user posts and comments are not sent to any of the dataset projects or model-training services.
EOF

find . -type f -name .DS_Store -delete

npm install --global pnpm@9.15.9
pnpm install --frozen-lockfile
node --input-type=module -e "import('./scripts/model-artifact.mjs').then(m => m.verifyModel(m.modelFile))"
npm run package:extension

test -f dist/DCinside-Gallery-Blocker/models/conflict/model.onnx
test -f dist/DCinside-Gallery-Blocker/vendor/detector/ort-wasm-simd-threaded.wasm
test -f dist/DCinside-Gallery-Blocker/LICENSE
test -f dist/DCinside-Gallery-Blocker/THIRD_PARTY_NOTICES.md
test -f dist/DCinside-Gallery-Blocker/licenses/ONNX-Runtime-ThirdPartyNotices.txt

rm -f .github/finalize-detector.trigger
rm -f .github/workflows/finalize-detector-metadata.yml
rm -f .github/finalize-repository.trigger
rm -f .github/workflows/finalize-repository.yml
rm -f scripts/finalize-repository.sh

git config user.name "github-actions[bot]"
git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
git add -A
git commit -m "fix: finalize detector artifacts and release metadata"
git push origin HEAD:main

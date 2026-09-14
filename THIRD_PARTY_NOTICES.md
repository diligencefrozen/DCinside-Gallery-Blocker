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

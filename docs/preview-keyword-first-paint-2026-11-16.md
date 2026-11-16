# 미리보기 키워드 숨김 선노출 수정

## 확인된 원인

`renderPreview()`는 원문 DOM을 먼저 연결하고, `applyPreviewFeatureBridge()`는 그 이후 저장소와 사용자 차단 저장소를 기다린 뒤 키워드를 검사했다. 이 비동기 경계에서 원문이 먼저 표시됐다. 댓글 추가 경로만 별도 `visibility:hidden` 처리를 사용하고 있어 초기 본문·댓글과 일관되지 않았다. 제목은 일치해도 그대로 남았으며, 안내 배지에도 사용자 지정 금칙어 원문을 표시했다. 읽음 기록 역시 필터 완료 전에 발생했다.

## 수정 파일과 동작

- `src/content/core/content_script.js`: 제목·본문·댓글을 필터 시작 시 즉시 가린다. `opacity:0`으로 텍스트 측정·배치를 유지하고 `inert`로 키보드 접근을 막는다. 판정 완료 후에만 표시하며 이전 비동기 작업이 새 렌더를 해제하지 못하도록 작업별 소유권을 확인한다.
- 같은 파일: 공유 런타임 설정 캐시를 재사용한다. 기존 콜백 저장소 경로도 유지하며 조회 오류를 기본 OFF로 처리하지 않는다. 오류 시 새로고침 안내만 표시한다.
- 같은 파일: 제목 일치 시 대체 제목, 직접 입력 키워드 배지는 ‘사용자 지정 키워드’를 표시한다. 카테고리 이름은 유지한다. 숨기기의 ‘이번만 보기’는 제목·본문과 댓글에서 작동하고 강한 차단 규칙보다 우선하지 않는다.
- 같은 파일: 읽음 기록을 필터 완료 후로 이동한다. 페이지 추가·댓글 갱신도 동일한 가림을 사용한다. 저장 데이터·차단 규칙·버전·권한 변경 없음.
- `tests/preview-keyword-first-paint.test.cjs`: 두 브라우저의 첫 표시, 캐시 재열기, OFF/대상 설정, 카테고리·강한 차단 우선순위, 구 응답 경쟁, 저장소 실패·재시도, 500댓글 추가·갱신, 닫기, 기존 콜백 저장소를 검증한다.

## 전후 재현

Windows / Playwright Chromium·Firefox headless / 합성 게시글·댓글 / 설정 읽기를 직접 보류했다가 180ms 대기와 스크린샷 촬영 후 해제 / 브라우저별 전후 1회. 기준 소스는 `704bd95`이다. 금칙어가 들어 있는 텍스트의 DOM 연결·레이아웃·상위 표시 스타일을 매 `requestAnimationFrame`에서 검사하고 대기 중/판정 후 스크린샷을 함께 남겼다.

| 설정 대기 중 지표 | Chromium 이전 → 이후 | Firefox 이전 → 이후 |
| --- | --- | --- |
| 금칙어 노출 가시성 샘플 / 총 샘플 | 12/15 → 0/15 | 15/16 → 0/20 |
| 읽음 기록 요청 | 1 → 0 | 1 → 0 |
| 공유 캐시 사용 시 직접 sync 조회 | 1 → 0 | 1 → 0 |

샘플 수는 스크린샷과 엔진 스케줄링에 따라 달라진다. 이 결과는 GPU 프레임 영상이나 실서비스 속도 벤치마크가 아니라, 의도적으로 느린 설정 응답에서의 표시 순서 검증이다. 전체 관찰 구간에서도 수정 후 노출 샘플은 양쪽 모두 0회였다. 실제 로그인·디시 서버 쓰기 요청은 수행하지 않았다.

## 실행한 검증

- `node --check src/content/core/content_script.js`, `node --check tests/preview-keyword-first-paint.test.cjs`, `git diff --check`: 통과.
- `DCB_PREVIEW_BASELINE=704bd95 node --test tests/preview-keyword-first-paint.test.cjs`: 2 통과. 기준 소스의 선노출이 발생해야 통과하는 재현 모드다.
- `node --test --test-concurrency=1 tests/preview-keyword-first-paint.test.cjs tests/preview-activity-layout.test.cjs tests/preview-ux.test.cjs`: 기존 관련 검사 14 통과, 선택적 프로파일 4 건너뜀. 신규 검사 2건은 합성 데이터가 기존 객체의 본문을 직접 변경하여 갱신을 기다리다 실패했다. 실제 갱신 경로처럼 새 객체를 넘기도록 수정했다.
- `node --test tests/preview-keyword-first-paint.test.cjs`: 실패한 파일만 재실행하여 2 통과. 이후 저장소 콜백 오류 보호를 추가하고 같은 파일만 재검증하여 최종 2 통과. 미해결 실패 없음.
- `node tests/preview-regression.cjs`: 미디어·필터·반응형·포커스·닫기 회귀 통과.

최종 관련 검사 합계 16 통과, 선택적 프로파일 4 건너뜀. 전체 테스트와 프레임 속도 벤치마크는 이번 표시 순서 수정과 직접 관련된 회귀로 범위를 확인해 생략했다. 원본/수정 스크린샷과 JSON은 `test-results/preview-keyword-first-paint/{before,after}/`, 로그는 `test-results/preview-keyword-{baseline,regression,fix,media}.log`에 있다.

## 적용과 한계

새 설치용 폴더로 확장프로그램을 다시 로드한 뒤 기존 갤러리 탭을 새로고침한다. 백업 복원이나 설정 초기화는 필요 없다. 되돌리려면 이전 설치 폴더를 다시 로드한다.

이 수정은 미리보기 텍스트의 선노출을 막는다. 서버 응답시간 단축이나 확장 외부 원문 페이지의 모든 차단 기능 개선을 의미하지 않는다. 실제 로그인 환경과 사이트 테마별 동작은 별도 실사용 확인 범위다.

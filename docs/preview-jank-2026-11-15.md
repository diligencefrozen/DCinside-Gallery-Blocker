# 미리보기 댓글 추가 시 버벅임 개선

기준 커밋 `ebec87c`. 확장 버전은 `7.3.51.2026`으로 유지한다. 변경은 미리보기 콘텐츠 소스와 관련 시험에 한정하며 저장 데이터·서버 요청 제한·기능 ON/OFF·작성폼 정책·디자인은 변경하지 않는다.

## 확인한 병목과 수정 파일

`src/content/core/content_script.js`:

- 댓글 80개를 추가할 때 각 행마다 미디어 속성을 바꾼 직후 화면 영역과 이미지 위치를 측정했다. 즉시/180ms 보정 처리 모두 반복하여 브라우저가 배치할 수 없는 레이아웃 계산이 발생했다. 이제 미디어 정규화를 먼저 완료하고 화면 영역은 배치당 1회, 이미지 위치는 배치당 최대 8개만 읽은 후 요청 힌트와 캐시 이미지 교체를 수행한다. 이미지가 없으면 위치 측정도 생략한다. 기존 디코드 캐시·lazy loading은 유지한다.
- 키워드 검사에서 `innerText` 읽기와 행 숨기기를 번갈아 수행했다. 이제 이번 댓글 묶음의 텍스트를 먼저 읽고 차단/숨김 결과를 적용한다.
- 댓글 추가 때 이미 처리된 답글 버튼까지 다시 검색했다. 새 댓글과 중복 ID가 발생한 기존 댓글만 갱신한다. 중복 ID의 잘못된 답글/삭제 동작은 계속 금지한다. 작성기가 준비된 상태의 기존 메타데이터 동기화는 유지한다.
- 스레드 개수 표시가 같으면 DOM을 다시 쓰지 않는다.

`tests/preview-activity-layout.test.cjs`: 활동량·메모·키워드 숨기기·이미지를 함께 켠 전후 측정 모드, 배치당 위치 측정 상한, 숨긴 댓글 수 보존, 추가 댓글의 중복 ID 회귀 검사를 추가했다.

## 전후 측정

Windows / Playwright headless Chromium 151.0.7922.34, Firefox 153.0. 로컬 합성 페이지, 동일 입력 댓글 2,000개·고유 UID 100개·댓글마다 이미지, 활동량 캐시와 메모 사용. 서버 요청은 fixture로 대체했다. 처음 80개를 표시한 뒤 80개씩 세 번 추가하여 DOM 320개 상태를 측정했다. 같은 페이지에서 열기/닫기 3회, 엔진별 총 9회 추가 클릭 표본이다. 순서는 수정 전→후이며 무작위 반복 실험은 아니다.

| 지표 | Chromium 전→후 | Firefox 전→후 |
|---|---:|---:|
| 댓글 추가 클릭의 동기 처리 시간 중앙값 | 43.7→26.9ms | 85→34ms |
| 3회 추가 중 화면 영역 측정 | 480→6회 | 480→6회 |
| 전체 getBoundingClientRect 호출 | 960→54회 | 960→54회 |
| 레이아웃 계산 횟수 | 297→12회 | CDP 지표 미지원 |
| 레이아웃 작업 시간 중앙값 | 96.9→37.5ms | CDP 지표 미지원 |
| 작업 종료 후 스크롤 프레임 p95의 중앙값 | 5.1→5.1ms | 5→16.0ms |

댓글 추가의 동기 처리 시간은 각각 약 38%, 60% 감소했다. 이 수치는 전체 미리보기 로딩·통신 시간이 아니다. Firefox 스크롤 p95는 개선되지 않았으므로 전체 스크롤 성능이 향상됐다고 주장하지 않는다. 짧은 headless 스크롤 표본의 프레임 간격은 실사용 모니터의 주사율과도 다를 수 있다.

첫 댓글 DOM 감지 시간은 cold 1회+warm 2회를 합한 중앙값으로 Chromium 108→93ms, Firefox 343→194ms였다. 그러나 Firefox cold 단일 표본은 1,035→3,035ms로 악화됐다. 브라우저 초기화·관찰자 전달·파싱을 분리한 실사이트 원인까지 확인한 결과가 아니며, 첫 로딩 지연은 잔여 검토 대상이다. 본문 fetch 시간, 실사용 네트워크, GPU/실화면 스크롤에 대한 개선 보장으로 일반화하지 않는다.

측정 중 키워드로 숨긴 댓글은 320개 중 64개, 추가 활동량 요청 0건, 작성폼 iframe 0개로 유지됐다. 입력 2,000개를 전량 렌더링한 결과는 아니다.

## 실행 명령과 산출물

```powershell
$env:DCB_PREVIEW_INTERACTION_PROFILE='1'
$env:DCB_PREVIEW_BASELINE='ebec87c'
node --test --test-name-pattern='preview interaction profile' tests/preview-activity-layout.test.cjs
Remove-Item Env:DCB_PREVIEW_BASELINE
node --test --test-name-pattern='preview interaction profile' tests/preview-activity-layout.test.cjs
Remove-Item Env:DCB_PREVIEW_INTERACTION_PROFILE
node --test tests/preview-activity-layout.test.cjs
node tests/preview-regression.cjs
node tests/preview-compose.test.cjs
```

전후 프로파일 각 2개 검사 통과. 일반 활동량/미리보기 회귀 10개 통과(별도 실행한 프로파일 2개는 기본 모드에서 skip). 미디어 회귀 스크립트 통과. Chromium 작성폼 회귀 88개 시나리오 통과(초안·답글·인증·중복·늦은 응답·20회 열기/닫기의 DOM/리스너 정리 포함). 변경 JS/CJS 문법과 diff 공백 검사 통과. 전체 테스트는 변경 범위 밖이므로 생략했다.

측정 JSON: `test-results/preview-activity/{before,after}/{chromium,firefox}-interaction.json`.
로그: `test-results/preview-interaction-before.log`, `preview-interaction-after.log`, `preview-jank-regression.log`, `preview-jank-media.log`, `preview-jank-composer.log`.

업데이트 후 확장과 갤러리 탭을 새로고침한다. 기존 설정·차단 기록·메모·백업을 다시 가져올 필요는 없다. 이전 소스로 교체해도 저장소 마이그레이션은 필요 없다.

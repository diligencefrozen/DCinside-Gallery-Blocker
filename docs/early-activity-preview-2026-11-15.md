# 초기 활동량 차단·미리보기 처리 범위·수동 백업

기준 커밋 `5b181ed`, 확장 버전 `7.3.51.2026` 유지. 기존 저장 키, 차단 기준, 요청 제한, 캐시 유효기간, 확인 중 가리기 설정은 변경하지 않았다.

## 변경 및 확인된 원인

- `src/ui/options/dc-records-import.js`, `options.html`: 가져오기 직전의 강제 파일 다운로드를 제거했다. 통합 백업으로 이동하는 수동 링크를 제공하고 사이드 메뉴에 📥를 추가했다. 저장소의 가져오기 취소/부분 실패 복구는 유지한다.
- `src/background/content-script-profiles.js`, `background.js`, `src/content/core/feature-loader.js`: 활동량 필터가 document_idle/idle 우선순위로 시작되던 경로를 앞당겼다. 등록 프로필 revision만 14로 변경했다. Chrome/Firefox 모두 document_start 프로필과 의존성을 선언하고 Firefox 초기 주입에도 반영했다. 이미 로드된 모듈의 추가 lazy 주입 요청을 생략한다.
- `src/content/user/account-activity-blocker.js`, `src/shared/dom-mutation-bus.js`: 정상 캐시에 있는 차단 판정을 idle 스케줄러·80ms 증분 지연 전에 적용한다. 공유 Observer의 opt-in 즉시 구독으로 새 DOM도 observer microtask에서 처리한다. 다른 구독자는 기존 프레임 배치를 유지한다. 문서 루트가 아직 없는 초기 단계는 DOMContentLoaded에서 보완한다. 추가 네트워크 조회는 하지 않는다.
- `src/content/core/content_script.js`, `src/content/user/user-memo.js`: 댓글 추가 시 기존 댓글·본문까지 반복 검사하던 미디어/메모/UID/IP 처리 범위를 추가 댓글로 제한한다. 메모는 여러 행을 한 번에 처리하고 전체 문서 도구 정리를 생략한다. 필요 없는 본문/댓글 innerText 읽기도 생략한다. 미디어 보정 타이머는 대기 중인 행을 합치며 종료 후 등록을 해제한다.

사용자가 관찰한 정확한 0.4초 지연을 실사이트에서 재현·계측한 것은 아니다. 코드의 idle/증분 지연과 합성 페이지의 캐시 적용 시점을 확인했다. 저장소 읽기 이전 또는 미조회 UID의 서버 결과 이전까지 무조건 첫 페인트를 막는 기능은 아니다. 미조회 대상은 기존 `holdWhileChecking` 설정을 따르며 실패/만료 결과를 0건으로 바꾸지 않는다. 전체 페이지를 일괄 가리거나 기존 설정을 자동 변경하지 않는다.

## 검증

Windows, Playwright Chromium 151.0.7922.34 / Firefox 153.0. 익명 합성 DOM·로컬 저장소 fixture를 사용했다. 실제 서버 호출은 하지 않았다.

```text
node --test --test-concurrency=1 tests/activity-first-paint.test.cjs tests/dom-mutation-bus.test.cjs tests/preview-activity-layout.test.cjs tests/records-installed.test.cjs tests/memo-restored-display.test.cjs tests/critical-filter-first-paint.test.cjs
node --test --test-concurrency=1 tests/activity-first-paint.test.cjs tests/memo-restored-display.test.cjs tests/preview-activity-layout.test.cjs tests/records-installed.test.cjs tests/runtime-performance.test.cjs
node --test --test-name-pattern='cached low activity|activity profiles|restored memo|incremental memo' tests/activity-first-paint.test.cjs tests/memo-restored-display.test.cjs tests/preview-activity-layout.test.cjs
node --test tests/activity-first-paint.test.cjs
node tests/preview-regression.cjs
node scripts/package-extension.mjs
```

- 변경 JS/CJS의 `node --check`, `git diff --check` 통과.
- 첫 묶음의 초기 Chromium 차단 검사는 실패했다. 초기 문서 루트 없는 경우의 적용을 보완하고, 테스트 초기화 스크립트를 실제 의존 순서로 합쳤다. 수정 후 양쪽 브라우저 통과.
- 추가한 pending 검사에서는 기존 미조회 UID가 도중에 실패 캐시를 받아 Firefox 검사가 실패했다. 실패 캐시와 신규 미조회 UID를 분리한 fixture로 수정했다. 최종 초기 차단 3개 통과. 일시 보기, 후속 DOM 변경, pending 설정, OFF 해제 포함.
- 두 번째 묶음 21개 통과. 마지막 메모 범위 보정 후 메모/증분 검사 4개 통과, 초기 차단은 위의 최종 결과로 대체한다.
- DOM bus 3개, 기존 critical first-paint 4개 통과. 전체 선택 범위에서 고유 28개 테스트 통과. 별도 미리보기 회귀 스크립트도 통과.
- 설치된 확장에서 Chromium/Firefox 가져오기·양쪽 저장소 반영·선택적 되돌리기 통과. Chromium 다운로드 이벤트 0건, Firefox 임시 프로필의 자동 백업 파일 0건.
- 미디어 sanitize, 반응형, 동영상·투표, 디시콘·글자콘, 포커스/닫기 회귀 통과.
- 전체 테스트 및 실사이트 로그인·30분 프로파일링은 이번 범위에서 미실행. 모든 환경에서 0ms 차단 또는 전체 미리보기 속도 개선을 보장하지 않는다.

로그: `test-results/nov15-targeted.log`, `nov15-final-fixes.log`(중간 실패 포함), `nov15-activity-final.log`, `nov15-preview.log`, `nov15-perf-isolated.log`, `nov15-package.log`.
화면: `test-results/records-chromium.png`, `records-firefox.png`, `records-popup.png`.

## 전후 작업량·시간

동일 fixture에 댓글 80개를 추가한 뒤 메모 refresh 호출 내부 시간만 측정했다. 전: `DCB_PREVIEW_BASELINE=HEAD`로 기준 커밋 소스를 읽어 실행. 후: 단독 테스트 파일의 `incremental memo work` 검사 실행. 브라우저/조건당 1회이며 중앙값/p95가 아니다. 중간 다중 테스트 파일 동시 실행의 시간은 비교에서 제외했다.

| 엔진 | 입력 댓글 수 | 메모 방문 작성자 전→후 | refresh ms 전→후 |
|---|---:|---:|---:|
| Chromium | 50 | 130→80 | 13.9→6.9 |
| Chromium | 500 | 160→80 | 10.3→5.7 |
| Chromium | 2,000 | 160→80 | 10.5→5.7 |
| Firefox | 50 | 130→80 | 17→13 |
| Firefox | 500 | 160→80 | 19→12 |
| Firefox | 2,000 | 160→80 | 14→20 |

500/2,000은 전체 입력 수다. 기존 페이지 분할로 측정 직전 실제 기존 DOM은 80행이며 2,000행 동시 렌더 성능을 뜻하지 않는다. 메모 정리의 전체 문서 검색은 모든 조건에서 1→0회. Firefox 2,000 입력의 단일 시간 샘플은 악화되어 일률적인 속도 개선으로 보고하지 않는다. 전체 입력 지연·스크롤 p95·CPU·네트워크 시간은 이번 측정 대상이 아니다. 원본 JSON은 `test-results/preview-activity/{before,after}/*-incremental-memo.json`에 있다.

## 적용 및 되돌리기

설치 폴더/ZIP을 갱신한 뒤 확장과 기존 갤러리 탭을 새로고침한다. 백업 재가져오기는 필요 없다. 자동 파일 다운로드만 제거했으며 수동 통합 백업과 가져오기 취소는 계속 사용할 수 있다. 문제 발생 시 이전 소스로 교체하고 확장·갤러리 탭을 새로고침한다. 저장 스키마를 변경하지 않아 별도 데이터 되돌리기가 필요 없다.

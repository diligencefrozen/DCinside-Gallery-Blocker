# 7.3.52.2026 개발 결과

기준은 develop 커밋 641a301과 manifest 7.3.51.2026이다. 사용자가 지정한 develop ZIP에서 manifest 경로는 확인했지만 이후 파일을 다시 열 수 없어 전체 내용 동일성은 검증하지 못했다. 11월 13일 인수인계 ZIP과 CODEX_START_HERE.md는 확인되지 않아 대화에 붙여넣은 전문을 기준으로 작업했다.

## 기능과 저장 호환성

| 기능 | 구현 및 검증 범위 |
|---|---|
| 이번 글 계속 보기 | 현재 문서에서 갤러리·글 번호·경로로만 허용한다. 댓글 필터와 저장 설정은 그대로 적용된다. 양 엔진에서 본문 변경 후 유지와 다음 글 경고를 검사했다. |
| 비회원 차단 | IP, 닉네임 정확 일치, 일부 포함을 선택한다. v2의 기존 nick:은 부분 일치, nick-exact:는 정확 일치다. 최초 필터, 본문, 미리보기와 해제 경로를 수정했다. 양 엔진에서 같은 IP의 정확·부분 매칭과 선택 저장을 검사했다. |
| 차단 OFF 댓글 | 회원은 한 번 눌러 추가하고, 비회원과 중복 규칙은 적용할 조건을 고른다. 기존 목록을 유지하고 ON 전환 시 다시 숨긴다. 댓글 2,000개에서 화면에서 먼 행까지 버튼을 만들지 않는지 검사했다. |
| 네이티브 메뉴 | 이전 읽음 CSS가 행 전체에 opacity를 적용해 겹치는 다음 행 아래에 메뉴를 그렸다. 공식 PC 프로그래밍 갤러리에서 실제 작성글 검색 메뉴를 열고 인접 행에 읽음 표시를 부여해 비교했다. Chromium·Firefox 모두 수정 전 메뉴 중앙 hit-test 실패, 행 opacity 0.84. 수정 후 모두 성공, 행 opacity 1. |
| 기록 가져오기 | 팝업과 옵션에서 독립 메뉴에 진입한다. 공식 PC·모바일 메모 파일은 원래 범위를 유지한다. 붙여넣기는 메모와 전역 차단으로 분류하고, 불명확한 줄은 표시한다. 차단 적용은 추가 확인이 필요하다. 메모·v2 변경 버킷·실행 취소 기록을 로컬 저장소에 한 번에 기록한다. 일반 메모 변경도 백그라운드 큐에서 키 단위로 병합한다. 양 브라우저에 설치해 충돌 건너뛰기, 혼합 입력, 실제 저장, 수동 수정·재등록 후 선택적 취소를 검사했다. |
| 활동량 | 가시 범위를 우선 처리하고 식별한 회원 UID를 로컬 대기열에 중복 없이 등록한다. 알람은 활성 갤러리 탭에서 설정·세션을 재확인한다. 캐시가 있으면 우선 사용하고 약 6시간 뒤 재검사한다. 48시간 동안 다시 보지 않은 후보는 다음 큐 로드에서 제외한다. 서비스 토큰을 대기열에 저장하지 않는다. 3초 최소 간격과 10분 12회 전역 한도를 사용한다. 미확인·실패·세션 부재를 0건으로 표시하지 않는다. 100개 UID 중복 제거, 새 워커 인스턴스에서 기한 복구, 전역 예산 대기, 성공 후 6시간 재예약은 모의 워커/응답으로 검사했다. |

가져오기 전 다운로드한 dcb-records-before-import JSON은 **옵션 → 백업 불러오기**에서 메모와 차단 목록을 복원한다. 실행 취소는 가장 최근에 반영된 가져오기를 대상으로 한다. 파일 복원은 두 기록을 백업 시점으로 되돌리므로 이후 수동 편집을 유지하려면 실행 취소를 사용한다. 전체 확장 백업의 이전 형식 및 기존 메모 JSON 가져오기 경로도 유지했다. 공식 앱 바이너리, 공식 웹 차단 파일과 갤러리별 차단 파일은 검증된 형식이 없어 가져오지 않는다.

## 실제 검사

- 기존 Node 단위/계약 묶음 38/38. 기존 브라우저 묶음 66/66. 전체 묶음 후 변경한 경로는 해당 테스트만 재실행했다. 아래 숫자들은 서로 중복되므로 합산하지 않는다.
- 메모·차단·활동량·첫 페인트·공식 백업 관련 최종 단계 묶음 26/26. 화면 근접 렌더링·예약 대기열 수정 후 관련 묶음 6/6. 탭 간 캐시 반영 수정 후 관련 묶음 6/6.
- Chromium 설치형 추론 통합 검사와 로컬 추론 런타임 통과. 기존 통합 검사에 중립 텍스트를 공격성 양성으로 기대한 부분, 제거된 offscreen API, 예전 UI 문구·고정 작성자 폭 및 정의되지 않은 결과 변수 참조가 있었다. 양성 fixture와 현재 서비스 워커 및 열 경계 기준으로 수정했다.
- Chromium 7.3.51 → 7.3.52 같은 프로필 업그레이드에서 레거시 차단·메모·차단 OFF 보존을 확인했다. Firefox 임시 설치와 옵션 문서 재로드는 통과했다. 확장 자체 runtime.reload 이후 BiDi가 문서 재연결 단계에서 시간 초과되어 Firefox 재설치·버전 업그레이드 보존은 미검증이다.
- npm 실행 파일이 없어 package.json의 Node 명령을 직접 실행했다. pnpm 래퍼의 패키지 관리자 실행 실패 후 동일 패키징 스크립트를 직접 실행해 성공했다.

주요 실행 명령

~~~sh
node --test tests/*.test.mjs
node --test --test-concurrency=1 --test-force-exit tests/*.test.cjs
node --test tests/records-author-controls.test.cjs tests/records-installed.test.cjs
node tests/extension-integration.cjs
node tests/detector-runtime.cjs
node tests/activity-layout-profile.cjs <기준-또는-수정본> <결과.json>
node scripts/package-extension.mjs
~~~

## 성능

Windows, 격리된 실제 엔진, 목록 100행과 합성 댓글, 동일 UID 반복, 활동량·키워드 숨기기·이미지 필터 동시 활성. 각 조건 1회, 첫 프레임은 스크립트 주입 시작부터 측정했다. 스크롤 p95는 45프레임 기준이다. 요청은 모의 활동량 조회다.

| 엔진 | 댓글 수 | 첫 프레임 ms | 스크롤 p95 ms | DOM 변경 | 요청 |
|---|---:|---:|---:|---:|---:|
| Chromium | 50 | 200 → 178 | 5 → 5 | 2012 → 1862 | 1 → 1 |
| Chromium | 500 | 257 → 256 | 5 → 5 | 8042 → 7442 | 1 → 1 |
| Chromium | 2000 | 621 → 605 | 5 → 5 | 28142 → 26042 | 1 → 1 |
| Firefox | 50 | 128 → 133 | 5 → 5 | 2012 → 1862 | 1 → 1 |
| Firefox | 500 | 204 → 223 | 5 → 5 | 8042 → 7442 | 1 → 1 |
| Firefox | 2000 | 482 → 557 | 5 → 5 | 28142 → 26042 | 1 → 1 |

Firefox 첫 프레임은 세 조건에서 모두 느려졌다. 단일 실행으로 통계적 개선이나 회귀 원인을 단정할 수 없다. 마지막 탭 간 캐시 갱신·알람 변경은 기능 테스트로 검증했으며 위 성능 비교는 초기 렌더 변경 시점의 측정이다. 6시간 실제 경과, Firefox 서명 배포본 업그레이드, 실제 모바일 앱 및 모바일 사이트 전체 메뉴·로그인 조합은 시험하지 않았다. 확장 패키지는 압축을 풀어 개발자 모드 또는 Firefox 임시 확장으로 시험하는 용도다.

## 변경 파일

- docs/release-7.3.52.2026.md
- manifest.json
- README.ko.md
- src/background/activity-queue.js
- src/background/background-entry.js
- src/background/background.js
- src/background/content-script-profiles.js
- src/content/appearance/visited-posts.css
- src/content/core/content_script.js
- src/content/core/critical-filter-bootstrap.js
- src/content/core/feature-loader.js
- src/content/image/image-account-filter.js
- src/content/keyword/keyword-blocker.js
- src/content/user/account-activity-blocker.js
- src/content/user/block-target.js
- src/content/user/cleaner-userblock.js
- src/content/user/ctx-probe.js
- src/content/user/user-memo.js
- src/shared/storage/user-block-store.js
- src/ui/options/dc-records-import.js
- src/ui/options/official-memos.js
- src/ui/options/options.html
- src/ui/options/options.js
- src/ui/popup/popup.js
- src/ui/popup/user-block-list.js
- src/ui/shared/writer-preferences.js
- tests/comment-author-browser.test.cjs
- tests/extension-integration.cjs
- tests/official-memos.test.cjs
- tests/records-author-controls.test.cjs
- tests/records-installed.test.cjs
- tests/writer-preferences.test.cjs

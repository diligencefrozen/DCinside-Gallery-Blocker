# 7.3.52.2026 개발 결과

## 2026-11-17 후속 변경

미리보기의 사진 순번 중복·위치를 수정하고 내부 상단/댓글 이동 버튼을 추가했다. 첫 진입에서 전체 문서의 중복 미디어 처리와 작성자 검색을 줄였다. 활동 확인 실패는 제목 아래 진한 카드로 분리했다. 자동 기록 가져오기는 일반·시크릿 창 선택, 접근 확인, 실제 읽기 탭의 모드 검증과 시크릿 기록의 저장 지속 안내를 제공한다. 실제 설치형 Chromium·Firefox에서 두 모드의 합성 기록 분리와 원본 보존을 확인했다. 성능 수치와 범위는 [후속 보고서](preview-navigation-and-private-import.md)에 있다. 버전과 릴리스 빌드는 유지한다.

## 2026-11-16 증분 개발 안내

최신 흐름은 **디시 차단·메모 자동 불러오기**다. 사용자가 디시 페이지나 설정 모달을 열 필요 없이, 확장이 임시 백그라운드 페이지에서 이 브라우저의 검증된 차단·메모 저장 항목을 읽고 진행 막대·범위·건수를 표시한다. 완료 후 미리보기와 사용자 적용 확인을 거친다. 사이트 원본 기록·로그인 쿠키·토큰은 변경하거나 수집하지 않는다. 갤러리별 메모는 사이트와 같은 갤러리 ID 범위를 보존한다. 갤러리별 차단·OFF 차단·미확인 식별자는 보류한다. 사용자가 목록 창을 직접 열어야 하는 수동 DOM 읽기 UI와 안내는 제거했다. 파일·목록 붙여넣기 대체 경로는 유지한다.

활동량 필터가 켜진 목록에서는 글 이동 전에 작성자를 확인하며, 저활동 판정 글은 목록에서 숨긴다. 미확인 클릭은 확인을 기다리고 실패 시 명시적으로 확인 없이 열거나 취소할 수 있다. 미리보기의 다중 사진에는 순번을 표시하고, 세로 동영상 조작부가 화면 안에 들어오도록 조정했다. 실제 AI 모델로 가린 글·댓글에는 기기 내 AI 분석 안내와 짧은 모션을 표시하고 기본 규칙으로 처리한 경우를 구분한다. 상세 페이지의 댓글 바로가기는 현재 글의 전체 댓글 수를 함께 표시한다. [후속 구현·검증 보고서](reading-activity-and-preview-update.md)에 근거와 제약을 기록했다.

디시 PC/모바일의 긴 목록·본문·댓글에는 우측 하단 상단 이동 버튼을 추가했다. 현재 스크롤 영역을 구분하고 자동 새로고침·플로팅바 위에 배치한다. 최신 구현과 검사 결과는 [자동 가져오기 및 상단 이동](automatic-records-and-scroll-top.md)에 있다. 아래 수동 DOM 중심 항목은 앞선 개발 단계의 기록이다.

아래 초기 직접 가져오기·외부 링크 경고 검증 당시 manifest는 7.3.51.2026이었다. 현재 기준 소스는 7.3.52.2026이며 11월 17일 후속 단계에서 추가 버전 변경·릴리스 빌드·업로드는 하지 않았다. 실제 사용자 등록 기록 검증과 합성 프로필 검사, 아래 기존 개발 결과의 범위를 구분해야 한다.

- 옵션의 ‘디시인사이드에 등록된 목록 직접 불러오기’에서 열린 PC 디시 설정 DOM을 명시적으로 읽고, 유형·범위·상태·중복·충돌·보류 사유를 미리 본 뒤 지원하는 전역 기록을 병합한다. 기존 파일·붙여넣기·직전 가져오기 되돌리기를 유지한다.
- **외부 링크 이동 경고 변경:** 확장 활성 상태에서 PC 디시 갤러리의 자체 외부 링크 이동 경고를 자동으로 OFF로 유지한다. 사용자가 사이트에서 다시 ON으로 바꾸어도 OFF로 유지한다. 이 변경으로 외부 사이트 이동 전 디시가 제공하던 안내가 제거된다. Chrome/Firefox 세이프 브라우징, 인증서 경고, 확장 자체 링크 보호는 변경하지 않는다.
- 갤러리별 차단·메모는 기존 적용 키로 갤러리 종류까지 구별할 수 없어 직접 가져오기에서는 보류한다. OFF 규칙·불명확한 식별자·전체 IP도 보류하며 전역 승격·IP 범위 확대·필터 자동 활성화를 하지 않는다. 공식 메모 백업의 기존 범위 복원은 유지한다.
- 현재 기기·브라우저의 열린 목록을 읽는 단방향 가져오기다. 실시간 동기화나 계정의 서버 전체 목록 조회가 아니다. 실제 로그인 등록 행의 검증 및 모바일 직접 수집은 완료되지 않았다.

이번 변경의 근거·검증·제약은 [직접 가져오기 조사](dc-native-records-development.md)와 [작업 결과](dc-native-import-handoff.md)를 참고한다.

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

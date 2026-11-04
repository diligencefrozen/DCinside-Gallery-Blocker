# 미리보기·디시콘 성능 수정 기록

기준: 작업 폴더의 `3f836ec` 이후 연속 작업. 1차 수정은 `5115ede`에 포함되었고, 이 문서는 후속 초기 로딩 개선까지 다룬다. 새 ZIP 경로는 확인되지 않아 최신 작업 폴더를 사용했다. 인수인계서는 사용자가 채팅으로 제공한 내용을 반영했다.

## 확인한 원인과 변경 파일

| 파일 | 확인한 문제와 수정 |
| --- | --- |
| `src/content/user/writer-layout.js` | 미리보기 작성자 배치가 없는 클래스도 매번 제거해 class mutation → 공유 Observer → 배치 재실행을 반복했다. 실제 값이 바뀔 때만 DOM을 수정한다. |
| `src/background/preview-comment.js` | 디시콘 읽기가 진행 중인 상태에서 닫기·재열기로 요청이 겹치거나, 늦은 응답이 글자콘 창을 덮을 수 있었다. 원문 jQuery 요청의 수명을 관찰해 진행 중 읽기를 재사용하고, 선택된 팝업만 표시한다. 빈 목록·로그인 요구·HTTP 오류·필수 목록 필드 누락을 구분한다. 종료 시 Observer·인증 폴링·rAF·읽기 요청을 정리한다. |
| `src/content/core/content_script.js` | 작성창은 원문 전체 `load`까지 기다렸다. 같은 원문 문서의 DOMContentLoaded 완료와 사이트 jQuery 초기화 순서를 확인한 뒤 준비하며, 이미지·광고 완료를 추가로 기다리지 않는다. 초기 지연 로드 정책과 단일 iframe은 유지하고 닫기 시 준비 타이머도 해제한다. |
| `src/background/content-script-profiles.js` | 실제 unpacked 확장의 작성 iframe에서 두 cleaner가 settings cache보다 먼저 실행되어 `.get` TypeError를 냈다. allFrames/document_start 프로필에 필요한 공통 의존성을 먼저 넣었다. 내부 프로필 버전만 갱신했다. |
| `src/shared/dom-mutation-bus.js` | 구독 추가 때마다 Observer를 재생성하고 미처 전달하지 않은 변경을 버렸다. 관찰 옵션이 같으면 재사용하고, 옵션 변경 시 대기 중 기록을 보존한다. 이전 구독의 disposer가 같은 ID의 새 구독을 지우지 않도록 했다. |

원문 목록 API·선택 이벤트·패키지 캐시를 사용한다. 별도 목록 API, 인증 우회, 자동 쓰기/재전송, 권한 추가는 없다. 로그인 확인으로 작성 iframe이 다른 페이지로 이동하지 않으며 인증값·비밀번호를 메시지나 성능 로그에 기록하지 않는다.

## 스크롤 측정

Windows, Playwright Chromium, 1100×850, CPU 4배 제한. 같은 모의 본문/댓글과 4개 댓글당 이미지 1개, 실제 미리보기·작성자 배치·공유 Observer를 사용했다. 준비 후 1.8초 동안 스크롤했다. cold는 새 페이지, warm은 같은 페이지에서 닫고 재개방한 상태이며 각각 5회 측정했다. 서버·GPU·OS에 따라 사용자 체감 수치는 달라진다. 프레임 간격은 rAF 표본이며 실제 GPU dropped-frame 비율로 환산하지 않았다.

| 댓글 / 상태 | Task ms 전 중앙값 / p95 | Task ms 후 중앙값 / p95 | DOM 변경 전→후 중앙값 | 프레임 p95 전→후 중앙값(ms) |
| --- | --- | --- | --- | --- |
| 50 / cold | 309 / 332 | 153 / 166 | 2900 → 0 | 50 → 33.4 |
| 50 / warm | 307 / 321 | 143 / 149 | 3200 → 0 | 33.4 → 33.4 |
| 500 / cold | 1441 / 1467 | 256 / 270 | 27000 → 0 | 50 → 50 |
| 500 / warm | 1375 / 1429 | 196 / 198 | 29000 → 0 | 49.9 → 49.9 |
| 2000 / cold | 2200 / 2236 | 867 / 879 | 40000 → 0 | 199.9 → 33.5 |
| 2000 / warm | 2081 / 2339 | 616 / 679 | 44000 → 0 | 150 → 50 |

2,000개 cold의 TaskDuration 중앙값 감소는 60.6%다. 각 그룹은 5회이며 이 표의 p95는 5개 표본 중 최댓값이다.

이 수치는 스크롤 구간의 메인 스레드 TaskDuration 합계다. 50/500개에서도 작업량은 줄지만 프레임 p95가 동일할 수 있다. 2,000개에서는 수정 후에도 일부 Long Task가 남아 있으며, 모든 환경에서 끊김이 없다는 뜻은 아니다.

자료: `test-results/preview-scroll-before.json`, `preview-scroll-after.json`. 별도 trace 실행의 측정값은 tracing 비용이 있어 표와 섞지 않는다.

## 실제 사이트와 초기 작성창

실제 unpacked Chromium MV3 확장, 격리한 비로그인 프로필에서 사용자가 제공한 게시글을 사용했다. 진입 목록만 링크 1개의 fixture이고, 본문·댓글·원문 iframe·사이트 스크립트·디시콘 목록/이미지는 실서버에서 읽었다. 댓글 등록·삭제·투표 endpoint는 테스트에서 차단하고 시도 횟수가 0인지 검사했다.

정상 응답 시 패키지 10개, 목록/이미지 표시, 다른 패키지 선택, 페이지 버튼, 닫기·재열기, 첨부 카드와 글자콘 전환을 확인했다. 최근 사용 목록은 비로그인 세션에 `not_login`을 반환하여 로그인 필요 안내와 작성창 보존을 확인했다. 로그인 계정의 최근 목록 내용은 미검증이다.

검사 도중 `/dccon/lists`가 HTTP 200이지만 `target: icon`에 필수 `list`가 없는 응답을 반환한 적이 있다. 같은 시점 원문에서도 아이콘 0개·팝업 숨김을 재현했다. 이는 확장 내부 렌더 실패와 구분해야 하며, 서버가 해당 응답을 낸 이유까지 확인한 것은 아니다. 이후 정상 목록 응답도 관찰했다. 누락 데이터를 추측하거나 우회 요청을 보내지 않고 즉시 실패 안내를 표시하도록 했다.

확인한 공식 코드: [디시콘 클라이언트](https://gall.dcinside.com/_js/dccon/dccon.js?v=261026). 이 클라이언트는 `temp.list`를 사용한다. 초기 iframe에서는 DOMContentLoaded와 전체 load 사이 약 2초의 대기를 관찰했다. 후속 수정은 사이트 ready 콜백의 실행 순서를 보존하면서 그 추가 대기를 제거한다.

2026-11-04, 같은 게시글에 명시적 댓글창 열기 동작을 사용한 cold/warm 각 5회 결과(ms). 외부 네트워크·사이트 응답 변동이 포함되어 있다.

| 상태 | 본문 준비 전→후 중앙값 | 입력 가능 전 중앙값 / p95 | 입력 가능 후 중앙값 / p95 |
| --- | --- | --- | --- |
| cold | 974 → 968 | 4459 / 5537 | 3415 / 3846 |
| warm | 160 → 175 | 1636 / 1945 | 1703 / 1819 |

최초 입력 가능 중앙값은 23.4% 감소했다. warm 중앙값은 약간 늘었으므로 재개방 속도 개선을 주장하지 않는다. 변경 후 첫 표본은 iframe DOMContentLoaded 964ms, loadEnd 0인 상태에서 편집기가 준비됐다. 4초 이미지 지연 회귀도 별도로 통과했다.

디시콘 정상 목록은 수정 전 5/10, 수정 후 6/10이었다. 나머지는 사이트 응답에 list 필드가 없었다. 원문에서도 발생한 외부 응답 문제로 정상화 완료를 선언할 수 없으며, 이 성공률 차이를 코드 개선 효과로 해석하지 않는다. 수정 후 정상 응답에서 선택창 표시 중앙값은 cold 683ms, warm 200ms였다(각 정상 표본 3개). 실패 안내는 기존 약 15.3초에서 120~169ms로 바뀌었다. 새 원문 요청이나 자동 재시도는 추가하지 않았다.

로그: `test-results/live-readonly-before-2026-11-04.json`, `live-readonly-after-2026-11-04.json`. 모든 쓰기 시도 0회. 스크린샷: `test-results/live-readonly-after-2026-11-04.png`.

사이트 자체의 `document.domain` 설정은 기존 sandbox에서 SecurityError를 낸다. 이 오류를 숨기기 위해 sandbox를 완화하지 않았다. 초기 프로필의 settings cache TypeError와는 별개다.

## 회귀와 수명 검사

| 검사 | 결과 |
| --- | --- |
| Node 계약/단위 검사 | 38/38 통과 |
| 전체 Chromium browser suite | 46/46 통과; 댓글 작성 71 시나리오·추천 43 시나리오 포함 |
| 미리보기 회귀 | 통과: 미디어/설문, 필터, 반응형, 포커스 |
| 공유 Observer | 대기 변경 보존, 동일 ID 교체/해제, 20개 구독에서 Observer 재사용 통과 |
| 수정 관련 JS 구문 | 11개 파일 통과 |
| 실제 MV3 디시콘/작성창 | 10회 측정 완료; 불완전한 서버 목록 4회로 전체 성공 아님(exit 2) |
| 별도 AI 확장 통합 검사 | 실패: 감지 placeholder 대기 timeout. 수정 전 3f836ec에서도 동일 실패 확인 |

수정/추가 테스트: `preview-compose.test.cjs`, `preview-scroll-profile.cjs`, `preview-live-readonly.cjs`, `dom-mutation-bus.test.cjs`, `critical-filter-first-paint.test.cjs`, `preview-regression.cjs`. 기존 미리보기 회귀의 차단 안내 문구 기대값도 현 UI로 갱신했으며, 실패 시에도 테스트 브라우저를 닫는다. AI 통합 검사의 이후 검증 항목은 실행되지 않았으므로 전체 확장 통합 통과로 표기하지 않는다.

기존 first-paint 테스트 3개는 현재 코드의 hot-cache/fail-open 정책 및 동적 프로필 등록과 달랐다. 이를 단순 통과 처리하지 않고 warm cache의 차단·허용 행 첫 페인트, cold cache의 노출 유지, 설정 OFF, 동적 행 및 재로드를 검사하도록 갱신했다. 제품 기본값은 바꾸지 않았다.

20회 작성창 열기/닫기 후 GC 기준 document 130→130, DOM node 13,654→13,654, JS event listener 39→39였다. 이 짧은 반복에서는 증가가 없었으며 장시간 전체 브라우저의 누수 부재를 보증하는 결과는 아니다. 원문 이미지 응답을 4초 지연시킨 별도 회귀에서도 `document.readyState === interactive`일 때 텍스트 입력과 디시콘 선택이 가능했고 쓰기 요청은 없었다.

## 재현 및 설치

```powershell
node --test tests/*.test.mjs
node --test tests/*.test.cjs
node tests/preview-regression.cjs
node tests/extension-integration.cjs
node tests/preview-scroll-profile.cjs --check --runs=5
$env:DCB_LIVE_READONLY='1'
node tests/preview-live-readonly.cjs --runs=5
```

`--before` 스크롤 측정은 `test-results/perf-before/`에 저장한 수정 전 소스 4개를 사용한다. 실제 확장 비교는 `DCB_EXTENSION_ROOT`로 보관한 수정 전 확장 폴더를 지정한다. `--trace --runs=1`은 Chrome Performance에서 열 수 있는 별도 trace를 만든다. 실서버 테스트는 실패·로그인 요구를 정상 선택 성공으로 세지 않는다.

설치: Chrome 확장 관리에서 이 작업 폴더를 가리키는 확장을 새로고침하고 이미 열려 있던 DCinside 탭도 새로고침한다. 작성 중인 초안이 있으면 먼저 보관한다. manifest 권한·버전과 저장 설정 형식은 변경하지 않았다.

롤백: 변경분을 보관한 뒤 적용한 수정 커밋만 되돌리거나, 수정 전 `3f836ec` 소스의 별도 폴더를 로드한다. 다른 사용자 변경과 설정을 삭제하는 전체 reset/설정 초기화는 필요하지 않다.

남은 검증: 사용자 로그인 세션의 유료/최근 목록, 실서버 댓글·콘 등록과 삭제, Firefox 실제 브라우저, 수 시간 사용·실제 트랙패드·GPU/GIF/동영상 부하의 전수 조합. 모의 인증/등록 통과를 실서버 인증/등록 성공으로 표현하지 않는다. 프로젝트 전체의 일괄 성능 개선률도 주장하지 않는다.

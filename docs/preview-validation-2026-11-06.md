# 미리보기 콘·성능 검증 기록

2026-11-06, Windows / Playwright Chromium / 비로그인 격리 프로필에서 검사했다.

사용자가 지정한 개발 버전은 7.3.50.2026이다. 작업 시작 시 저장소 HEAD는
`19afdb0`, manifest는 7.3.49.2026이었다. 다운로드 원본 ZIP의 SHA-256은
`f04740728a53abca2826198fdeb54f8da50bc6c11efdd0e4cd2fe45a7667953a`로 일치했다.
ZIP과 저장소의 src/tests/manifest 113개 파일은 CRLF/LF를 정규화하면 내용이 모두 같았다.
이번 작업에서 manifest를 지정 개발 버전으로 변경했다. 비교용 원본은
`test-results/preview-1106-baseline/`에 보관했고 비교본도 버전 표시는 7.3.50으로 맞췄다.

사용자가 지정한 [실베스트 476197번 글](https://gall.dcinside.com/board/view/?id=dcbest&no=476197&_dcbest=9&page=1)에서는
수정 전후 모두 미리보기 10/10회와 원문 5/5회 콘 선택창이 열렸다.
수정 전후 글자콘 입력·배경색 선택·첨부를 확인했다.
3회 반복 첨부/상호 전환 검사는 각 실행의 첫 warm 표본에서 수행했다.
추가 수정본 검사에서는 배경색과 글자색 양쪽의 첨부 카드 반영을 3회 확인했다.
자료는 `test-results/live-readonly-user-colors-1106.json`이다.
원문의 아이콘/글자콘 등록 버튼은 누르지 않았고, 미리보기에서는 첨부까지만 검사했다.
쓰기 경로는 네트워크에서 차단했으며 쓰기 시도는 0회였다.
사용자가 겪은 당시의 먹통 증상은 이 비로그인 환경에서 재현되지 않았다.

| 확인한 문제 | 근거와 적용 범위 |
| --- | --- |
| body에 남은 패널을 미리보기가 찾지 못함 | 모의 원문에서 패널을 버튼 뒤로 재삽입하지 않고 표시하면 수정 전 2.5초 대기 실패. 같은 iframe 문서의 유일한 숨김 패널을 클릭 시 추적하고, 사이트가 표시한 뒤 작성창으로 옮긴다. 사이트가 재열기 때 패널을 다시 body로 옮기는 경우도 검사했다. 실제 지정 글은 네이티브 코드가 정상 재삽입해 이 실패가 나타나지 않았다. |
| 글자콘 native 핸들러가 늦으면 클릭에 피드백 없음 | 700ms 늦게 핸들러를 설치한 모의 원문으로 검사. 이제 준비 상태와 15초 제한 안내가 표시된다. 사용자가 닫고 다시 누르면 첨부된다. 자동 클릭이나 자동 전송은 수행하지 않는다. |
| 이미 포함된 댓글을 두 번 처리 | 본문 응답에 댓글 500개가 있는 모의 글에서 preview 콘텐츠 처리 이벤트 2회와 댓글 DOM 재생성 확인. 댓글이 이미 완성돼 있으면 최종 화면을 한 번 렌더한다. 별도 댓글 읽기가 필요한 글은 본문 선표시를 유지한다. |
| 서버 응답에 디시콘 list 누락 | 최초 탐색에 사용한 475940번 글에서 10회 중 2회 HTTP 200 + list 누락 관찰. 이후 원문 대조를 포함한 동일 글 측정에서는 정상 응답. 서버가 누락 응답을 준 이유는 미확정이며 목록을 추측해 복원하지 않았다. |

변경 파일은 다음과 같다.

| 파일 | 변경 |
| --- | --- |
| `manifest.json` | 지정 개발 버전 7.3.50.2026 |
| `src/background/preview-comment.js` | 클릭한 선택창의 패널 추적, 표시 후 같은 작성창으로 복귀, 글자콘 대기/실패 안내 |
| `src/content/core/content_script.js` | 댓글이 포함된 응답의 중복 부분 렌더 제거, 댓글 개수 판정 재사용 |
| `tests/preview-compose.test.cjs` | body에 머무는 두 종류의 패널, 3회 첨부/취소/전환, 늦은 핸들러, 타임아웃 후 재시도 |
| `tests/preview-performance.test.cjs` | 한 번의 콘텐츠 처리 계약, 500댓글 cold/warm 계측, 별도 Chrome trace |
| `tests/preview-live-readonly.cjs` | 지정 URL 지원, 원문 대조, 본문/댓글 rAF 시각, 색상/반복 첨부, 설치 초기화 완료 대기 |
| `tests/preview-scroll-profile.cjs` | 댓글 20개 조건 추가 |
| `tests/fonts-browser.test.cjs` | 글꼴 적용을 기다린 후 작성자 글꼴 보존 판정 |
| `tests/comment-author-browser.test.cjs` | 본문 글꼴 전환 후 공유 DOM bus와 작성자 배치 반영을 기다린 후 기존 범위 판정 |

실사이트는 1100×850, cold는 새 프로필의 첫 열기, warm은 같은 목록에서 닫고 다시 열기다.
각각 5회이며 표는 중앙값 / p95(ms)다. 표본 5개의 p95는 최댓값이다.
본문/댓글은 DOM이 표시 가능한 첫 rAF 시각으로 측정했으며 GPU paint 완료를 직접 측정한 값은 아니다.
작성창은 activation부터 편집기가 보이는 시각, 선택창/첫 이미지는 디시콘 버튼 클릭부터의 시간이다.
입력 시간은 편집기 준비 후 Playwright fill 소요 시간이다.

| 구간 | cold 전 | cold 후 | warm 전 | warm 후 |
| --- | --- | --- | --- | --- |
| 본문 표시 가능한 첫 프레임 | 488 / 541 | 438 / 469 | 125 / 133 | 121 / 133 |
| 댓글 준비 프레임 | 657 / 718 | 633 / 660 | 125 / 133 | 122 / 133 |
| 작성창 표시 | 2540 / 2896 | 2098 / 2240 | 1438 / 1569 | 1286 / 1338 |
| 입력 조작 | 19 / 32 | 22 / 54 | 28 / 35 | 21 / 62 |
| 디시콘 선택창 | 319 / 976 | 171 / 963 | 188 / 268 | 191 / 230 |
| 첫 아이콘 이미지 로드 | 431 / 993 | 229 / 976 | 279 / 350 | 255 / 311 |

자료는 `test-results/live-readonly-user-before-1106.json`과
`test-results/live-readonly-user-after-final-1106.json`이다.
네트워크·사이트 응답·브라우저 캐시의 변동이 포함된다. 지정 글은 본문 뒤 댓글을 별도 조회하는 경로였으며,
이번에 줄인 중복 렌더 조건과 다르다. 위 감소분을 패치 효과나 모든 글의 개선율로 해석하지 않는다.
warm 선택창 중앙값은 소폭 증가했다.

500댓글 모의 응답은 동일 HTML과 장치에서 원본→수정본을 순차 실행했다.
cold는 캐시가 없는 새 글 URL, warm은 같은 글을 재개방하는 조건이며 브라우저 프로세스는 유지한다.
각각 5회, CPU 제한 없음. 댓글/사이트 요청은 모두 fixture다.

| 구간 | cold 전 | cold 후 | warm 전 | warm 후 |
| --- | --- | --- | --- | --- |
| openPreview 완료, 중앙값 / p95(ms) | 158 / 267 | 79 / 210 | 54 / 64 | 46 / 57 |
| CDP TaskDuration 증가량, 중앙값 / p95(ms) | 189 / 291 | 105 / 238 | 70 / 99 | 70 / 78 |
| preview 콘텐츠 처리 횟수 | 2 | 1 | 1 | 1 |

이 조건의 cold 메인 스레드 작업 중앙값은 약 44.4% 줄었다.
자료는 `test-results/preview-embedded-before.json`, `preview-embedded-after.json`이다.
추가 trace 실행은 측정 오버헤드가 있어 위 표에서 제외했다.
10회 전체 trace에서 Layout 이벤트는 65→60회, UpdateLayoutTree는 95→90회였다.
`preview-embedded-before-traced.trace.json`과 `preview-embedded-after-traced.trace.json`을
Chrome Performance에서 열어 볼 수 있다.

실사이트의 기존 sandbox에서 다음 오류가 수정 전후 나타났다.
`SecurityError: Failed to set the 'domain' property on 'Document': Assignment is forbidden for sandboxed iframes.`
이 오류가 있는 표본에서도 콘 입력·색상·첨부가 통과했다. 이번 증상의 원인으로 확정하지 않았다.

검증 결과와 범위는 다음과 같다.

| 검사 | 결과 |
| --- | --- |
| Node 단위/계약 | 38/38 통과 |
| Chromium 작성창 | 후속 수정 포함 85 시나리오 통과, 모의 전송·인증·답글·삭제 및 360/540/1100px 포함 |
| Chromium 전체 suite | 후속 수정 포함 50/50 통과. 최종 `browser-final-submit-auth-1106.log` |
| 미리보기 별도 회귀 | 통과. sanitization, 반응형, 동영상/설문, 콘 필터, 포커스/닫기 |
| 스크롤 20/50/500/2000 | cold/warm 각 5회, 총 40회 통과. settled DOM mutation 0 |
| 별도 MV3 확장 통합 | 실패. AI 감지 placeholder 10초 대기 timeout. 보관한 원본 19afdb0에서도 동일 실패 |
| 지정 글 원문/미리보기 | 수정 전후 각각 원문 5회 및 미리보기 10회 통과, 쓰기 시도 0 |
| 실제 마이너/미니/인물갤 | 각각 원문 1회, 미리보기 cold/warm 2회 통과. 색상/첨부/3회 전환, 쓰기 시도 0 |

추가 실사이트 대상은 [마이너 asdf12/83075](https://gall.dcinside.com/mgallery/board/view/?id=asdf12&no=83075&page=1),
[미니 nobirthgall/18059](https://gall.dcinside.com/mini/board/view/?id=nobirthgall&no=18059&page=1),
[인물 yujinan/614](https://gall.dcinside.com/person/board/view/?id=yujinan&no=614)였다.
`live-readonly-minor-1106.json`, `live-readonly-mini-1106.json`,
`live-readonly-person-1106.json`에 기록했다.

스크롤은 1100×850, CPU 4배 제한, 1.8초 구간의 CDP TaskDuration 증가량을 측정했다.

| 댓글 수 | cold 중앙값 / p95(ms) | warm 중앙값 / p95(ms) |
| --- | --- | --- |
| 20 | 110 / 120 | 103 / 106 |
| 50 | 127 / 140 | 118 / 120 |
| 500 | 234 / 246 | 162 / 177 |
| 2000 | 673 / 680 | 437 / 442 |

40회 모두 반복 DOM 변경은 0이었다. 2000댓글에는 최대 117ms의 Long Task가 남아 있다.
이 스크롤 측정은 수정본의 회귀 점검이며 전후 스크롤 개선율을 산출하지 않았다.
자료는 `test-results/preview-scroll-after-1106.json`이다.

최초 브라우저 전수 검사에서는 새로 추가한 body 재이동 시나리오가 실패했다.
재열기 직전 작성창 안에 있던 패널도 추적하도록 보완한 뒤 작성창 79 시나리오가 통과했다.
실사이트 수정본의 첫 재실행은 새 프로필의 설치 기본값이 테스트 설정을 덮어 목록 링크가 숨겨져 실패했다.
테스트가 설치 transaction 완료와 runtime 설정 반영을 확인하도록 수정했고 지정 글 10회 검증을 완료했다.
이 준비 단계 실패는 콘 선택 실패와 구분해 `live-readonly-user-after-1106.json`에 보존했다.

전체 브라우저 검사 중 한 실행에서는 기존 글꼴 테스트가 예상 18.2px 대신 13px을 읽어 실패했다.
처음 실행에서는 같은 글꼴 검사가 통과했고, 다른 브라우저 검증 종료 후 재실행에서도 통과했다.
다음 전수 검사에서는 본문 140% 확대 직후 작성자 도구 범위를 판정해 실패했다.
두 fixture는 이번에 변경한 미리보기 코드를 로드하지 않는다.
원본 소스를 별도로 로드한 글꼴/작성자 fixture 12개는 3회 모두 통과했다.
코드상 글꼴 변경 통지는 Promise와 rAF를, 작성자 배치는 공유 DOM bus와 다음 rAF를 거친다.
테스트가 글꼴 갱신과 작성자 배치 완료를 기다리도록 보완했고, 기대값과 판정 범위는 유지했다.
보완한 12개 검사도 3회 모두 통과했다.
이후 전체 Chromium suite 50개가 한 번의 최종 실행에서 모두 통과했다.
글꼴·작성자 판정의 크기 기대값, 넘침 한계, 복원 조건은 기존 값으로 검사했다.
전수 실패 로그는 `browser-suite-final-1106.log`, `browser-suite-isolated-1106.log`,
대조 로그는 `layout-baseline-1-1106.log`부터 3개,
보완 후 로그는 `layout-synchronized-1-1106.log`부터 3개다.
별도 AI 감지 통합은 수정본과 원본 모두 같은 대기 단계에서 실패했으며 이후 통합 검증 항목은 실행되지 않았다.
자료는 `extension-integration-1106.log`, `extension-integration-before-1106.log`이다.

로그인 계정의 유료/최근 콘, 실제 서버 댓글 등록·삭제, Firefox, 장시간 GPU/GIF 부하는 미검증이다.
모의 갤러리 유형 검사는 메인/마이너/미니/인물을 포함한다.
사용자는 증상 당시 비로그인이었다고 확인했다. 설치 경로·당시 설정은 확인되지 않았다.
전체 증상 해결 판정에는 해당 설치 환경에서의 추가 확인이 필요하다.

아래 명령으로 검사할 수 있다.

```powershell
node --test tests/*.test.mjs
node --test --test-concurrency=1 tests/*.test.cjs
node tests/preview-regression.cjs
node tests/preview-scroll-profile.cjs --check --runs=5
node tests/preview-performance.test.cjs --profile-embedded
node tests/preview-performance.test.cjs --profile-embedded --trace
$env:DCB_LIVE_READONLY='1'
$env:DCB_ARTICLE_URL='https://gall.dcinside.com/board/view/?id=dcbest&no=476197&_dcbest=9&page=1'
$env:DCB_PROFILE_LABEL='manual-readonly'
node tests/preview-live-readonly.cjs --runs=5 --dcbest
```

코드 적용은 Chrome 확장 관리에서 이 저장소 폴더를 가리키는 확장을 새로고침하고,
작성 중인 내용을 보관한 다음 DCinside 탭도 새로고침한다.
개발용 설치 ZIP은 문서 끝의 경로에 제공한다.

**기술직갤 660893번 글의 후속 확인**

사용자는 [gisulzik/660893](https://gall.dcinside.com/mgallery/board/view/?id=gisulzik&no=660893&page=1)에서
첨부 카드는 보이지만 최종 등록 시 “연결하지 못했습니다. 입력 내용은 유지됩니다.”가 나온다고 설명했다.
브라우저는 Chrome, 설치 방식은 스토어다. 앞선 첨부 성공 검사는 실제 등록 검증과 범위가 다르다.

Chrome 기본 프로필에서 읽은 설치 패키지는 7.3.49.2026이었다.
Google의 공개 CRX 응답도 7.3.49.2026이었고 두 패키지의 댓글/미리보기 소스는 일치했다.
이 확인은 설치된 코드만 읽었으며 사용자 쿠키·비밀번호·브라우징 기록은 수집하지 않았다.
저장소의 기존 dist 폴더는 7.3.47, 두 기존 ZIP은 7.3.46/47이었다.
로컬 dist의 상태를 스토어 오류의 원인으로 확정하지 않는다.

오류 문구는 쓰기 전 댓글 조회 또는 인증에서 예외가 난 경우에 해당한다.
해당 글에서 확장과 같은 댓글 조회 필드를 사용한 읽기 전용 probe는
HTTP 200, comments 배열 9개, 유효한 total_cnt를 반환했다.
모든 필수 입력 필드가 존재했고 Turnstile mode는 2였다.
응답 본문·토큰·입력값은 로그에 저장하지 않았다.
자료는 `live-readonly-gisulzik-read-probe-1106.json`이다.

현행 [공식 댓글 클라이언트](https://gall.dcinside.com/_js/comment.js?v=261106-kc)는
빈 댓글 목록의 null 응답을 처리한다.
기존 확장은 이를 항상 배열로 요구했다. 모의 서버가
`{comments:null,total_cnt:0}`을 주면 첫 비회원 글자콘 등록 전에 실패했고,
실제 서버 쓰기 없이 재현 테스트의 실패를 확인했다.
목록 null과 명시적인 총수 0만 빈 배열로 정규화하도록 수정했다.
총수 5와 null 목록 등 불일치 응답은 계속 실패로 판정한다.
이 결함이 현재 사용자의 기술직갤 오류를 일으켰는지는 미확정이다.

등록 전 조회 실패는 응답 형식 오류와 연결 오류로 구분해 안내하고,
인증 예외도 인증 안내로 분리했다. 이때 첨부와 입력을 유지하고 명시적 재클릭만 허용한다.
실제 쓰기 이후 결과 불명확 상태는 기존 중복 전송 방지 경로를 따른다.
테스트는 빈 댓글 첫 등록과 불일치 응답 후 보존·명시적 재시도를 추가했다.
수정 전 실패 로그는 `preview-submit-before-1106.log`에 있다.

실사이트 진단에 `--probe-comment-read`, `--profile-live`, `--trace-live`,
`--real-list`, `--without-backdrop` 옵션을 추가했다.
프로파일은 URL query/hash, 요청 본문·헤더, 입력값을 제외한다.
첫 진단의 진입 목록은 링크 하나의 fixture였고 원문 작성 iframe은 실제 사이트였다.
편집기 준비 직후 2초에는 TaskDuration 612ms와 최대 60ms Long Task 5개가 관찰됐다.
스크롤 1.8초는 373ms, 글자콘 대기 2초는 102ms였고 두 구간에는 Long Task가 없었다.
글자콘 대기 중 picker 높이는 353px, 높이 변경 메시지는 0회였다.
이는 프로파일 오버헤드가 있는 한 표본이다. 지속적인 버벅임이 해결됐다고 판정하지 않는다.
자료는 `live-readonly-gisulzik-profile-1106.json` 및 같은 이름의 CPU/timeline 파일이다.

같은 날짜의 공식 `txtcon.js?v=261106-kc`는 `data-kcap-hide` 아래의 CAPTCHA 자리표시자를
필수 입력에서 제외하고, 서버가 `code_fail`을 반환하면 `kcap_open(no)`로 입력을 연다.
확장도 이 흐름을 따르도록 수정했다. 숨김 자리표시자를 활성 인증으로 오인해
요청 전 차단하는 경우를 디시콘·글자콘 모의 서버로 재현했다.
인증 요구 후 첨부 유지, 입력칸 노출, 사용자 재클릭당 요청 1회도 검사했다.
수정 전 로그는 `preview-kcaptcha-before-1106.log`이다.
기술직갤의 최초 HTML에서는 이 숨김 자리표시자가 발견되지 않아 해당 사용자의 원인으로 확정하지 않는다.

실제 기술직갤 목록을 배경으로 두고 blur 사용/제거를 한 번씩 추가 비교했다.
본문·원문 iframe·사이트 스크립트는 모두 실서버에서 읽었고 쓰기 시도는 0회였다.

| 구간 | blur 사용 Task ms | blur 제거 Task ms |
| --- | --- | --- |
| 작성창 준비 후 2초 | 561 | 814 |
| 스크롤 1.8초 | 715 | 650 |
| 글자콘 대기 2초 | 210 | 257 |

한 표본씩이며 사이트 광고·스크립트 로딩 변동과 tracing 비용을 포함한다.
일관된 개선이 확인되지 않아 blur 제거는 테스트용 비교에만 사용했다.
CPU profile의 스크롤 구간에서 확장 JS 자체 표본은 각각 약 9.7/9.8ms였다.
대부분의 차이는 브라우저 내부 작업·사이트 로딩에 걸쳐 있어 특정 확장 함수가
지속적인 버벅임의 원인이라고 단정할 수 없다.
자료는 `live-readonly-gisulzik-real-blur-1106.json`,
`live-readonly-gisulzik-real-plain-1106.json` 및 대응하는 CPU/timeline 파일이다.

Turnstile 필드 구성 자체의 예외도 인증 단계로 구분한다.
이 경우 쓰기 0회와 첨부 보존, 인증 API 복구 후 명시적 재클릭 1회를 모의 검사했다.
최종 단위 검사는 38/38, 전체 브라우저는 50/50(작성창 85 시나리오) 통과했다.
별도 미리보기 회귀도 통과했다. 로그는 `node-final-auth-1106.log`,
`browser-final-submit-auth-1106.log`, `preview-final-submit-1106.log`다.

현재 수정본의 설치용 폴더와 버전을 포함한 ZIP을 다시 생성했다.
파일은 `dist/DCinside-Gallery-Blocker-7.3.50.2026.zip`, 압축 해제 로드 폴더는
`dist/DCinside-Gallery-Blocker/`다. manifest와 댓글·미리보기 소스의 SHA-256을 작업 소스와 대조했다.
ZIP SHA-256은 `23033d984e275f874c88040eb8e09f0b519ed62958b44948a979c3f63ddae64d`다.

최종 설치 폴더 자체를 로드한 실제 기술직갤 목록 검사에서 글자콘 첨부와
등록 전 댓글 읽기 HTTP 200을 cold/warm 두 번 확인했다. 쓰기 시도는 0회였다.
디시콘 목록은 두 번 모두 HTTP 200에 list가 없어 검사 종료 코드 2였다.
같은 시점 원문도 아이콘 0개·패널 숨김이었다. 이 실행은 전체 E2E 통과로 세지 않는다.
자료는 `live-readonly-gisulzik-packaged-final-1106.json`이다.

이 로컬 빌드는 스토어 게시와 별개이며, 실제 사용자 환경의 등록 성공 및
버벅임 해소는 여전히 확인이 필요하다.

개발본을 확인할 때는 스토어 확장을 잠시 끄고, ZIP을 별도 폴더에 압축 해제한 다음
`chrome://extensions`의 개발자 모드에서 해당 manifest가 있는 폴더를 로드한다.
기존 설정을 같은 조건으로 비교하려면 확장 옵션의 내보내기/불러오기를 사용한다.
DCinside 탭을 새로고침한 뒤 확인한다.

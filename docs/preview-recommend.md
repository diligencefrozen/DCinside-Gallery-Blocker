# 미리보기 개추·비추 직접 요청 — 2026-10-28

## 계약 확인

- 공식 [recommend_box.js?v=261026](https://gall.dcinside.com/_js/recommend_box.js?v=261026), [kcaptcha.js](https://gall.dcinside.com/_js/kcaptcha.js)를 읽기 전용으로 확인했다.
- 추천 스크립트 SHA-256: `974496BAC9EDD76CEA258B6F2952821DBEA966BBD23B3E0491D9C2422CF070BE`.
- 공개 일반 갤러리 원문의 기본 추천 버튼을 Chromium에서 실행하되 **모든 POST를 네트워크 전송 전에 차단**해 요청 계약을 비교했다. 실제 추천은 전송하지 않았다. 보안 필드 값은 기록하지 않았다.
- `POST /board/recommend/vote`: 현재 `_view_form_`의 직렬화 필드(중복 이름 포함)에 `ci_t`, `id`, `no`, `mode=U|D`, `code_recommend`, `_GALLTYPE_`, `link_id`를 추가한다. 원문 Referer, credentials, XMLHttpRequest 헤더와 공식 3시간 Firstcheck 쿠키 처리를 유지한다.
- `true||추천수||회원추천수` / `true||비추천수`만 성공으로 처리한다. 모호한 응답의 GET 재조회는 성공 판정이 아니며 POST를 재시도하지 않는다.
- 코드 정책은 `all` / `recommend` / `non_recommend`를 구분한다. 추천 이미지 요소의 실제 `data-type`과 갤러리 정보로 공식 `/kcaptcha/image_v3/` 경로를 사용한다. 댓글 CAPTCHA는 재사용하지 않는다.

## 변경 범위

기존 버튼의 실제 클릭을 MAIN에서 처리한다. 기존 댓글 iframe이 준비되었으면 폼을 읽기만 하고, 없으면 원문 HTML을 GET한다. 준비 단계는 핸들러만 설치하므로 추천용 iframe이나 추가 원문 조회가 발생하지 않는다. 코드가 필요한 방향에만 작은 입력 행을 표시한다.

단일 진행 중 요청, 방향별 완료/불확정 잠금, 화면 종료 시 취소와 늦은 응답 억제를 적용했다. 닫았다 다시 열거나 background가 재시작되어도 페이지의 비밀값 없는 상태를 유지한다. 쿠키·폼 보안값·코드 답은 extension messaging, storage, 미리보기 캐시에 전달하지 않는다. 인증 불가/불확정 상태에서만 원문 링크를 제공한다.

댓글 인증 성공 문구 두 곳만 `인증 완료`로 변경했다. 인증 후 등록·삭제는 여전히 명시적 사용자 동작이 필요하다. 본문 설문 `/board/poll/vote` 코드는 변경하지 않았다.

## 검증과 경계

- `node tests/preview-recommend.test.cjs`: 일반/마이너/미니/인물 × 로그인/비로그인, 한 번 요청, iframe 재사용/GET fallback, 실제 요청 필드·Referer, 중복 클릭, 방향별 코드·오답·갱신·만료, 제한·HTTP 오류·타임아웃, 종료·전환·재열기, 좁은 화면/테마, 설문 iframe, 비밀값 메시지 누출을 모의 Chromium에서 검증한다.
- `node tests/preview-compose.test.cjs`: 기존 댓글 27개 시나리오 및 인증 성공 문구/자동 제출 없음 검증.
- `node tests/preview-performance.test.cjs`, `node --test tests/preview-contextmenu.test.mjs tests/preview-read-bridge.test.mjs`: 기존 미리보기/읽기 브릿지 회귀 검증.
- 실제 계정의 추천 성공, 보안코드 정답 제출, 마이너/미니/인물의 실서버 인증과 Firefox 현장 동작은 **미검증**이다. 사용자 승인 테스트 글/계정 없이 실서버 POST를 실행하지 않았다. 모의 성공은 실서버 성공 보장이 아니다.

설치 시 기존 확장 프로그램을 다시 로드한다. manifest 버전·권한 변경은 없다. 롤백은 이번 변경 diff를 역적용한 뒤 확장을 다시 로드한다.

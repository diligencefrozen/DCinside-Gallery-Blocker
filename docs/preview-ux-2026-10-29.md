# 미리보기 UX 검증 — 2026-10-29

## 수정 파일과 동작

- `src/shared/ip-network-classifier.js`, `ip-network-fast-classifier.js`: 완전한 IP 토큰과 작성자 소유의 명시적인 IP 요소만 사용. 빈 값·깨진 값은 unknown, 해외 배지 제외.
- `src/content/core/critical-filter-bootstrap.js`, `src/content/cleaner/cleaner-foreign-ip.js`, `src/content/user/member-ip-view.js`: 날짜·닉네임·다른 답글의 IP 오인 방지, 동적 변경과 설정 해제 시 복원.
- `src/content/core/content_script.js`: 동일한 IP 근거 정책, 추천 버튼·접근성·reduced-motion, 기존 iframe을 재사용하는 답글 도킹과 스크롤 보존.
- `src/background/preview-comment.js`: 원문 도구·등록 버튼 배치, 대상별 미디어 선택 유지, 유형별 전송·인증·등록 결과 확인.
- `tests/anonymous-mini-ip.test.cjs`, `tests/preview-compose.test.cjs`: 재현·회귀 테스트.

추천 전송 로직(`preview-vote.js`), manifest, 권한, 독립적인 익명 차단 정책은 이번 UX 작업에서 변경하지 않았다. 새 ZIP/원문 HTML 경로는 확보되지 않아 최신 작업 폴더와 공식 페이지·스크립트를 기준으로 작업했다.

## 공식 계약과 보안

확인한 공식 스크립트: `https://gall.dcinside.com/_js/dccon/dccon.js?v=261026`, `https://gall.dcinside.com/_js/dccon/txtcon.js?v=261020`, `https://gall.dcinside.com/_js/common.js?v=261028-2`.

디시콘은 `/dccon/insert_icon`에 package/detail ID, 글자콘은 `/txtcon/insert`에 텍스트·색상 필드를 보낸다. 부모/답글 매핑과 인증 필드는 원문 계약을 따른다. 미디어용 기존 CAPTCHA 키 쌍과 일반 텍스트 댓글의 새 키 쌍을 분리했다.

원문 선택·최근 사용·패키지 목록 UI를 재사용하되 선택 직후 자동 제출은 막고 명시적 등록 클릭에만 전송한다. CAPTCHA 완료 콜백에서는 전송하지 않는다. 비밀번호·토큰은 원문 프레임 세션에만 두며 확장 메시지·로그·영구 저장소로 내보내지 않는다.

성공은 응답 `ok`, 목록 재조회에서 새 댓글 하나·댓글 수 증가·부모 매핑·내용 일치를 함께 확인한다. 실제 디시콘 결과에는 `detail` 속성이 없어 선택 이미지 주소도 대조한다. 다른 이미지/텍스트의 추가는 성공으로 인정하지 않는다. 실패 시 초안/선택 유지, 불확정 쓰기는 잠금, 자동 재전송 없음.

## 테스트 결과

| 검사 | 결과 |
| --- | --- |
| `node tests/preview-compose.test.cjs` | 51개 통과 |
| `node tests/anonymous-mini-ip.test.cjs` | 통과 |
| `node tests/preview-recommend.test.cjs` | 43개 통과; 모의 서버 |
| `node tests/preview-performance.test.cjs` | 통과 |
| `node --test tests/ip-network-classifier.test.mjs tests/preview-contextmenu.test.mjs tests/preview-read-bridge.test.mjs` | 6개 통과 |
| 변경 JS/CJS 구문 검사, `git diff --check` | 통과 |

댓글 검사는 일반·답글·중첩 답글, 연속 작성, 삭제, 초안·선택 보존, CAPTCHA/v2/v3/Turnstile 모의 흐름, 거절/403/429/503/불확정/내용 불일치, 중복·오래된 응답, sender 검증을 포함한다. 360/540/1100px, 댓글 20/50개의 도킹·스크롤·iframe 동일성도 확인했다. 높이 검사는 비동기 리사이즈가 실제 반영될 때까지 기다린다.

기존 통합 실패: `critical-filter-first-paint.test.cjs` 3개(콜드 캐시 가림 기대, 오래된 hot-cache 준비 조건, 정적 manifest 주입 순서 기대). `preview-regression.cjs`는 차단 안내 문구 기대값 불일치에서 중단. 기대값을 완화하지 않았으며 이후 항목이나 전체 npm 테스트의 통과를 주장하지 않는다.

## 실서버 검증과 남은 확인

사용자가 지정한 [미니갤 테스트 게시글](https://gall.dcinside.com/mini/board/view/?id=nobirthgall&no=18059&page=1)의 **원문 UI**에서 비회원으로 등록하고 실제 댓글 DOM을 확인했다.

| 유형 | 일반 댓글 | 답글 |
| --- | --- | --- |
| 글자콘 | 80250, 기능테스트 | 80284, 부모 80250, 답글테스트 |
| 디시콘 | 80285 | 80286, 부모 80285 |

인앱 브라우저에는 개발 확장이 로드되지 않아 수정된 미리보기의 전송은 모의 서버에서 검증했다. 원문 등록 성공은 수정 확장의 실사이트 E2E 성공과 다르다. 실제 CAPTCHA, 로그인 계정, 다른 갤러리 유형의 미디어 등록, Firefox, 원문 전체 팝업의 작은 화면 조합은 현장 검증이 남았다.

P1은 공개 작성자 DOM(IP/UID 없음, 날짜 포함)과 날짜형 IP·중첩 답글 픽스처에서 검증했다. 다만 제공 페이지의 예전/수정 파서 모두 IP를 빈 값으로 읽었으므로 보고된 본문 소실을 그 페이지에서 직접 재현하지 못했다. 원인 후보 차단·회귀 검증 완료이며 정확한 현장 원인은 미확인이다.

증거 이미지(Git 제외): `test-results/preview-media-live.jpg`, `preview-docked-20.png`, `preview-docked-50.png`. 테스트 댓글은 결과 확인을 위해 남겨 두었다.

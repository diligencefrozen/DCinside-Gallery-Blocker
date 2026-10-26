# 미리보기 댓글 작성 (1단계)

## 확인한 등록 계약

2026-10-26에 다음 공식 공개 자료를 직접 확인했다.

- [PC 댓글 스크립트](https://gall.dcinside.com/_js/comment.js?v=261021-5): `.repley_add` 처리, `/board/forms/comment_submit`, `addReplyForm`, `/board/comment/`, Turnstile 처리.
- [공개 게시글](https://gall.dcinside.com/board/view/?id=programming&no=1476608): 네이티브 입력 폼 및 등록 버튼의 직접 이벤트. 일반 입력·클릭을 거치기 전에는 `document.service_code`가 준비되지 않는다.
- [공통 스크립트](https://gall.dcinside.com/_js/common.js?v=261023): 네이티브 제출은 비회원 비밀번호를 저장할 수 있으므로 해당 제출 핸들러를 호출하지 않는다.

등록은 `POST /board/forms/comment_submit`이다. 본문은 `id`, `no`, `memo`, `reply_no`, 페이지의 검증 필드·알림 설정·갤러리 유형·인증값을 사용한다. 답글은 네이티브 DOM의 부모를 `c_no`, 클릭한 댓글을 `reply_no`로 보낸다. 조회 JSON의 `no`는 댓글 ID이고 `c_no`는 답글의 부모 ID다.

## 동작과 제한

- 댓글쓰기를 누를 때만 같은 출처의 원문 iframe을 로드한다. 입력 폼과 사이트 인증 위젯을 팝업 안에서 표시한다. 사용자 입력·버튼의 원래 보안 이벤트를 보존한다.
- 네이티브 등록 버튼의 실제 클릭/키보드 활성화만 전송한다. 사이트의 직접 보안 핸들러가 거절하면 멈추며, 이후 문서 위임 제출 핸들러는 차단한다. CAPTCHA 자동 재전송·비밀번호 저장·등록+추천은 호출하지 않는다.
- 확장 메시지는 엄격하게 검증한 원문 폼 준비만 허용한다. 비밀번호·쿠키·토큰은 메시지, 캐시, storage, 로그로 보내지 않는다. 읽기 브릿지는 댓글 등록 주소를 거부한다.
- 등록 전후에 댓글을 조회하고, 새로운 ID·내용·부모 및 총 개수가 확인된 경우에만 성공을 알린다. 확인이 불가능하면 초안을 유지하고 해당 초안의 재전송을 잠근다. 서버 응답을 근거 없이 성공으로 간주하지 않는다.
- 텍스트 초안과 답글 대상만 탭 메모리에 최대 32개 보관한다. 닫기·글 전환 후 다시 댓글쓰기를 열면 복구한다. 비밀번호는 보관하지 않는다.
- 필터 재적용·댓글 부분 갱신·같은 글 새로고침은 iframe을 교체하지 않는다. 성공 시 해당 글의 미리보기 캐시를 제거한다. 다른 글로 이동한 뒤 이전 응답으로 화면을 갱신하지 않는다.
- 갤러리 정책에 따른 로그인·이미지 CAPTCHA·추가 reCAPTCHA·권한 제한·삭제글·공유 댓글 스트림 등 확인할 수 없는 경우에는 원문 링크로 안내한다. Turnstile은 사이트 자체 위젯으로만 처리한다.

## 검증 범위

`node tests/preview-compose.test.cjs`: Chromium 모의 서버에서 네 가지 갤러리 유형, 일반 댓글·대댓글·답글의 답글, 로그인/비회원, 인증 거절, 403/429/503, 알 수 없는 응답, 중복 클릭, 초안·iframe 보존, 늦은 응답, 메시지 출처 제한을 검증한다.

실제 공개 PC 게시글의 iframe 접근·폼 표시·텍스트 입력은 확인했다. 실서버 댓글 등록은 수행하지 않았다. 로그인 계정, Firefox, 모바일 원문, 실제 CAPTCHA 통과 후 등록은 별도 검증이 필요하다.

실행 결과:

- `node tests/preview-compose.test.cjs`: 19개 시나리오 통과.
- `node tests/preview-performance.test.cjs`: 통과.
- `node tests/preview-regression.cjs`: 수정 전부터 1100px 댓글 가로 넘침 검사 실패.
- `node --test tests/dccon-hiding.test.cjs tests/comment-author-browser.test.cjs tests/preview-contextmenu.test.mjs`: 13개 중 6개 통과, 7개 실패. 실패는 변경하지 않은 디시콘 숨김·작성자 메모·글꼴 표시 코드의 검사이며 이번 범위에서 수정하지 않았다.
- 변경 JavaScript 구문 검사와 `git diff --check`: 통과.

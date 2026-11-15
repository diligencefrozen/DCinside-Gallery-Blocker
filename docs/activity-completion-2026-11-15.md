# 작성자 활동량 누락·예약 결과 표시 개선

기준 `84e63ee`, manifest `7.3.51.2026` 유지. 요청 한도를 늘리거나 다른 조회 엔드포인트를 추가하지 않았다.

## 확인된 코드 경로와 수정

- `src/content/user/account-activity-blocker.js`: 화면 밖 작성자를 viewport 대기시키기 전에 성공 캐시부터 표시한다. UID별 작성자 집합으로 같은 계정의 목록·댓글을 함께 갱신한다. 기존에는 대기 배지가 없는 작성자에 식별용 속성이 없어서 다른 탭의 캐시 갱신 대상에서 빠질 수 있었다. 이제 배지 생성 여부와 조회 대상 추적을 분리했다.
- 같은 파일: 예약 재조회 응답을 현재 문서에 바로 반영한다. 로컬 storage 변경 이벤트가 오지 않아도 조회 성공이 표시된다. 실패한 재검증이 유효한 기존 성공 숫자를 덮지 않는다. 메모리의 빠른 재시도가 끝난 항목도 영속 alarm 조회 성공으로 갱신된다.
- 같은 파일: 후보 등록 메시지가 실패하면 30초에서 최대 5분까지 지연을 늘려 재전송한다. 숨겨진 문서에서는 타이머를 중단하고 복귀 시 이어간다. 작성자가 제거되면 UID별 DOM 참조도 정리한다.
- 같은 파일: 불명확한 `—` 대신 `대기`, `조회 중`, `요청 대기`, `세션 없음`, `재시도 대기`, `조회 불가`를 표시한다. 상세 원인과 예정 시간은 title/aria-label로 제공한다. 없는 숫자를 0으로 만들지 않는다.
- `src/background/activity-queue.js`: alarm 실행 직전에 공유 캐시를 확인하여 이미 완료된 UID를 다시 요청하지 않는다. 첫 탭에 세션 토큰이 없으면 다른 활성 갤러리 탭에서 확인한다. 토큰 없는 탭 하나가 모든 UID를 장시간 미루지 않게 했다. 모두 토큰이 없으면 하나의 1분 마감 시간으로 대기하며 네트워크 요청은 하지 않는다. 서버 예산·쿨다운은 여전히 전체 대기열에 적용한다.
- `tests/activity-completion.test.cjs`, `tests/activity-request-budget.test.cjs`: 위 경로와 요청 제한의 회귀 테스트 추가.

사용자 화면에서 각각의 `—`가 어떤 실제 응답 때문에 발생했는지는 로그 없이 확정할 수 없다. 위 결함은 소스와 합성 브라우저 환경에서 확인한 경로다.

## 실행한 검증

Windows, Chromium 151 / Firefox 153. 실제 사이트 요청은 전부 로컬 합성 응답으로 대체했다.

```text
node --check src/content/user/account-activity-blocker.js
node --check src/background/activity-queue.js
node --check tests/activity-completion.test.cjs
git diff --check
node --test --test-concurrency=1 tests/activity-completion.test.cjs tests/activity-layout.test.cjs tests/preview-activity-layout.test.cjs tests/activity-first-paint.test.cjs
node --test tests/activity-request-budget.test.cjs
node --test --test-name-pattern='alarm queue' tests/records-author-controls.test.cjs
```

20 + 2 + 1 = **23개 통과**. 요청 한도 검사와 기존 alarm 검사는 첫 실행에서 sandbox의 자식 프로세스 `spawn EPERM`으로 시작하지 못했고, 허용된 실행 환경에서 정상 통과했다. 제품 코드 실패는 없었다. 관련 검사만 실행했으며 전체 테스트는 생략했다.

- 100개 고유 UID·목록 100행·댓글 2,000개: 등록 첫 실패 후 재시도로 전부 등록, UID 중복 없음.
- 성공 캐시가 있는 화면 밖 UID: 목록 1행+댓글 20행 모두 표시. 추가 네트워크 0건.
- 다른 탭의 성공 캐시: 대기 배지가 없던 UID도 21행 모두 갱신. 추가 네트워크 0건.
- alarm 응답: storage 이벤트 없이도 21행 모두 갱신. 해당 모의 조회 1건.
- 정지 구간 200ms DOM mutation 0회, 목록·댓글 제거 후 추적 작성자 참조 0개. 장시간 메모리 프로파일링 결과를 뜻하지 않는다.
- 100 UID 동시 모의 요청+중복 UID: 실제 fetch 12회, 요청 간격 3초 이상. 나머지는 BUDGET/COOLDOWN. 재시작 직후 추가 fetch 없음.
- HTTP 429의 7,200초 Retry-After: 워커 재시작 후에도 대기, 만료 뒤 재개.
- 기존 초기 가림·활동량 배치·미리보기 닫기/재열기·토큰 지연·댓글 페이지 분할·키워드/이미지 보기 검사 통과.

로그: `test-results/activity-completion.log`, `activity-request-budget.log`, `activity-alarm-regression.log`.

## 유지되는 한계·적용

10분당 12회는 확장 내부의 안전 예산이며 디시가 보장한 무제한 허용 조건이 아니다. 서버 차단 가능성 0 또는 모든 계정 즉시 조회는 보장할 수 없다. 미조회 회원이 많은 페이지는 순차 완료까지 기다려야 하며, 세션 없음·비공개/삭제·잘못된 응답·서버 제한은 숫자 대신 상태로 표시한다. 빠른 화면 내 재시도 종료 후에도 기존 영속 대기열이 재조회한다. 원래의 48시간 후보 보존과 활성 갤러리 탭 필요 조건은 유지한다.

실제 사용자 로그인 세션·서버 장시간 허용량·특정 계정 응답은 미검증이다. 과도한 실서버 시험 트래픽은 보내지 않았다. 설정·메모·차단 기록·백업 스키마는 바꾸지 않았다. 확장과 갤러리 탭을 새로고침하면 적용되며, 백업을 다시 가져올 필요는 없다.

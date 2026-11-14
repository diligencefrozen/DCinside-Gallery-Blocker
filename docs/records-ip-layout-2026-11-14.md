# 익명 미니갤 IP 판정 · 활동량 배치 · 가져오기 UX

버전 7.3.51.2026 유지. 기존 차단 v2 저장소, 메모 키/갤러리 범위, 사용자 설정, 백업 스키마를 변경하지 않았다.

## 원인과 수정

### IP 없는 익명 콘텐츠의 해외 판정

메모 기능의 `extractIp()`가 작성자 전체 텍스트 또는 부모 영역에서 숫자를 부분 매칭했다. 날짜도 IP 후보가 되어 메모 버튼의 `data-memo-ip`에 들어갈 수 있었다. 공유 IP 판정기는 이 파생 속성을 명시적 IP로 다시 신뢰했다. 초기 목록 필터는 `[data-ip]` 배지 자체를 작성자 후보로 검사하는 경로도 있었다.

메모는 공통 IP 판독기를 사용하며, 판독기가 아직 로드되지 않았을 때는 원래 작성자에 명시된 유효 IP만 사용한다. 공통/초기/미리보기 판독기는 메모 버튼·통신사 배지·활동량 배지의 파생 정보를 신원 근거로 삼지 않는다. 실제 IP가 없거나 날짜와 모호한 경우 숨기지 않는다. 기존 잘못된 메모를 자동 삭제하거나 변환하지 않는다.

두 브라우저의 합성 미니갤 DOM에서 메모 ON + 해외 IP 숨김 ON, 날짜·시간, 오염된 과거 배지, 중첩 답글, 실제 국내/해외 IP, 설정 OFF 및 IP 제거 후 복원을 검증했다. 사용자가 보고한 특정 시간대의 실사이트 세션 자체는 확보하지 못했으므로 이 경로와 제보 현상의 동일성은 실사이트에서 추가 확인이 필요하다.

### 활동량 누락

스크린샷만으로 특정 작성자의 실패 이유를 확정할 수 없다. 세션 토큰 없음, 응답 실패, 안전 예산 대기, 서버 제한, 아직 화면에 들어오지 않은 작성자의 지연 조회를 구분해야 한다. 확장 내부 안전 예산은 모든 탭 합산 10분당 12회, 최소 요청 간격 3초이며 변경하지 않았다.

활동량 배지의 `pointer-events:none` 때문에 배지 위에서 상태 툴팁을 확인하기 어려웠다. 배지에 마우스를 올려 원인과 재조회 예정 시각을 확인할 수 있게 하고 접근성 설명도 추가했다. 예산 대기와 서버 응답 제한을 서로 다른 문구로 표시한다. `—`를 실제 0건으로 바꾸거나 요청 제한을 우회하지 않는다. 이전에 추가한 캐시·가시성·미리보기 닫기 정리 및 세션 재개 경로를 유지했다.

### 긴 제목과 활동량

제목 셀의 float 배지가 긴 링크를 다음 줄로 밀었다. 원래 table-cell을 유지하며 활동량 공간을 예약하고 배지를 세로 중앙에 고정했다. 배지 글꼴은 목록에서 10px, 해당 제목은 최대 12px로 줄인다. 그래도 긴 제목은 말줄임표로 표시하며 원래 링크와 댓글 수 링크를 유지한다. 새 ResizeObserver나 반복 폭 측정을 추가하지 않았다.

### 가져오기

- 출처 → 목록 종류 → 미리보기와 저장의 3단계로 정리했다.
- 기본 입력은 붙여넣기이며 메모/차단/혼합을 명확히 구분한다. 메모 모드에서는 차단 규칙을 만들지 않는다.
- `global` 대신 ‘모든 갤러리’를 표시한다. 특정 갤러리 메모는 별도 선택 후 ID를 입력한다. 공식 웹 메모 파일은 원본 범위를 유지한다.
- 차단 목록 모드에서 `식별자-설명`은 식별자만 차단 후보로 사용한다. 설명을 다른 차단 대상이나 메모로 저장하지 않는다. 모든 차단은 전체 범위 확인 체크 후 적용한다.
- 단독 이름은 닉네임 정확 일치, `uid:` 접두부는 회원 ID, 유효 IP는 앞 두 자리 규칙이다. 예시·설명과 결과 라벨로 이 차이를 표시한다.
- 기존 값 유지가 기본이며 백업/덮어쓰기 선택/입력 지우기/선택적 되돌리기를 유지한다. 큰 붙여넣기의 미리보기는 180ms 동안 입력을 모아서 처리하고, 입력 중에는 이전 결과를 저장할 수 없게 한다.
- 팝업에서 확장 메모 가져오기와 디시 앱·웹 기록 가져오기를 구분하고, 후자는 전용 옵션 화면을 연다.
- 확인된 PC웹·모바일웹 메모 파일 파서는 유지했다. 공식 앱 백업 파일 및 웹 차단 백업 파일 지원을 추가하지 않았다. 해당 출처는 확인 가능한 텍스트 붙여넣기로만 처리한다.

## 변경 파일

| 파일 | 역할 |
|---|---|
| `src/shared/ip-network-classifier.js`, `ip-network-fast-classifier.js` | 파생 IP 근거 차단 |
| `src/content/core/content_script.js` | 미리보기 IP 판독 동일 적용 |
| `src/content/user/user-memo.js` | 날짜/부모 텍스트에서 IP 추정 제거 |
| `src/content/user/account-activity-blocker.js` | 활동량 상태·예정 시각·접근성 설명 |
| `src/content/appearance/writer-layout.css` | 제목/배지 한 줄 배치와 툴팁 |
| `src/ui/options/options.html`, `dc-records-import.js` | 단계별 가져오기 UI·범위·미리보기 |
| `src/ui/options/official-memos.js` | 명시적인 차단 목록 모드의 식별자-설명 해석 |
| `src/ui/popup/popup.html` | 가져오기 진입점·문구 구분 |
| `tests/anonymous-mini-ip.test.cjs` | 메모와 IP 필터 동시 실행, 양 브라우저 |
| `tests/records-ux-layout.test.cjs` | 분류·범위·초기화·긴 제목·좁은 화면 |
| `tests/records-installed.test.cjs` | 설치 상태에서 팝업 및 차단/메모 저장·취소 |
| `tests/official-memos.test.cjs`, `preview-activity-layout.test.cjs` | 변경된 UI 선택과 상태 문구, 비동기 가시성 검사 |

## 검증

Windows, Playwright Chromium 151 / Firefox 153. 비식별 합성 데이터, 임시 브라우저 프로필을 사용했다. 사용자 실제 차단/메모 자료나 세션을 테스트 서버로 전송하지 않았다.

총 37개 관련 테스트를 선별 실행하여 최종 통과했다. 첫 묶음은 16 통과/6 실패였다. 초기 목록 판독 결함을 보완하고, 새 기본 입력 방식·정상 해외 작성자 배지·가시성 콜백 시점·표 경계의 반 픽셀 높이 차이를 테스트에 반영한 후 실패한 검사만 다시 실행했다. 관련 미해결 실패는 없다.

실행 명령:

```text
node --check <수정 JavaScript 파일들>
node --test --test-concurrency=1 tests/ip-network-classifier.test.mjs tests/anonymous-mini-ip.test.cjs tests/records-ux-layout.test.cjs tests/records-installed.test.cjs tests/activity-layout.test.cjs tests/preview-activity-layout.test.cjs tests/official-memos.test.cjs
node --test --test-concurrency=1 tests/anonymous-mini-ip.test.cjs tests/records-ux-layout.test.cjs tests/official-memos.test.cjs
node --test --test-name-pattern='pagination' tests/preview-activity-layout.test.cjs
node --test tests/anonymous-mini-ip.test.cjs
node --test --test-name-pattern='records workflow' tests/records-ux-layout.test.cjs
node --test --test-concurrency=1 tests/critical-filter-first-paint.test.cjs tests/comment-author-browser.test.cjs
node --test --test-name-pattern='popup explains' tests/records-installed.test.cjs
```

- 실제 설치 상태의 차단 v2·메모 병합/동시 편집 보존/선택적 되돌리기: Chromium 및 Firefox 통과.
- 미리보기 2,000댓글 페이지 분할, 가시 영역 조회, 20회 캐시 재열기: 양 브라우저 통과.
- 초기 페인트 차단, 작성자 메뉴·메모·UID 배치: Chromium 14개 통과.
- 전체/AI 테스트와 장시간 실사이트 프로파일링은 변경 범위 밖이므로 미실행. 새로운 전체 성능 개선 수치를 주장하지 않는다.

스크린샷: `test-results/records-ip-fix/*-import.png`, `*-titles.png`, `test-results/records-popup.png`. 버전은 그대로이며 저장소 마이그레이션이 없어 이전 소스로 복원해도 기존 데이터를 유지한다.

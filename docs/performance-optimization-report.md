# 성능 최적화 작업 보고서

## 확인된 병목

`src/content/cleaner/cleaner.js`와 `src/content/cleaner/cleaner-search.js`는 기능이 켜진 동안 `MutationObserver` 콜백마다 모든 사용자 선택자에 대해 `document.querySelectorAll()`을 실행했다. 메인·검색 페이지의 결과가 여러 번 나뉘어 삽입되면 같은 문서를 반복 순회하게 되므로, DOM 변경량이 많을수록 CPU와 스타일/레이아웃 처리 부담이 커지는 구조였다. `cleaner-anonymous.js`도 변경마다 전체 작성자 목록을 다시 수집하고 있었다.

## 변경 내용

- 초기 적용 시의 전체 정리는 그대로 유지한다.
- 이후 MutationObserver 콜백은 추가된 요소와 그 하위 트리만 검사한다.
- `:has()`처럼 변경 대상 자체가 새로 선택자에 부합하는 경우를 위해 mutation target은 `matches()`만 수행한다.
- 비회원 차단은 초기 전체 스캔 뒤 추가·변경된 서브트리의 작성자와 해당 글/댓글만 재평가한다.
- 기능이 꺼져 있거나 선택자 목록이 비어 있으면 기존처럼 observer를 해제한다.

## 변경 전후 비용

변경 전에는 mutation 1회마다 선택자 수를 `S`, 문서 요소 수를 `D`라 할 때 대략 `O(S·D)`의 전체 문서 탐색이 발생했다. 변경 후에는 초기 1회만 `O(S·D)`이고, 동적 삽입은 추가된 서브트리 크기를 `A`라 할 때 `O(S·A)`로 제한된다. 이미 존재하는 문서 전체를 매번 다시 찾는 호출은 제거했다.

실제 Chromium Performance 측정은 현재 실행 환경의 브라우저/esbuild 프로세스 생성이 `EPERM`으로 거부되어 완료하지 못했다. 따라서 이 보고서는 실행 시간 감소율을 수치로 주장하지 않으며, 브라우저 프로파일은 설치 후 동일한 페이지·동일한 삽입 시나리오로 재측정해야 한다.

## 검증

- `node --check`로 `src` 아래 JavaScript 전체 문법 검사 통과.
- `git diff --check` 통과.
- 설치용 폴더를 갱신하고 `dist/DCinside-Gallery-Blocker-optimized.zip`을 생성했다.
- ZIP SHA-256: `7D6D6CB8AA63C170BE2F10222F8EF44710F319A7096A51809D0AE605C1E738A1`.

## 남은 검증 항목

Chromium에서 메인 페이지·검색 결과에 대량의 동적 삽입을 재현해 Long Task, CPU 시간, querySelectorAll 호출 수를 변경 전후로 비교해야 한다. 댓글·목록·설정 ON/OFF 회귀 테스트도 브라우저 환경에서 실행해야 한다.

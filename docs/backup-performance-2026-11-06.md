# 백업 복원 후 작성자 표시 성능

2026-11-06, 사용자가 제공한 `dcb-settings-2026-10-07T14-51-53-607Z.json`의
설정 조합을 격리된 Chromium MV3 프로필에서 복원해 검사했다.
옵션 화면의 실제 파일 불러오기 경로를 사용했다.
측정용 복원에서는 계정·결제 메타데이터 3개 키를 제외했다.
백업의 차단 목록·메모 내용·인증값은 결과 로그와 테스트 소스에 기록하지 않았다.

백업에는 댓글 AI 감지, 계정 활동 필터, UID/통신사/메모 표시, 105% 글꼴,
키워드 숨김, 이미지 댓글/글자콘 숨김, 20초 자동 새로고침 등이 명시적으로 켜져 있었다.
복원 시 이 값이 활성화되는 흐름을 확인했다.
복원 함수가 이번 백업의 기능을 추가로 대거 켜는 결함은 발견하지 못했다.

원인은 여러 작성자 표시 기능이 같은 DOM을 관찰하는 경로에서 확인했다.

| 경로 | 재현과 수정 |
| --- | --- |
| 닉네임 title → UID 갱신 → 스타일 변경 → 전체 재배치 | 잘린 닉네임에 같은 title을 계속 대입했다. UID 모듈이 이를 관찰해 같은 스타일시트를 다시 쓰고 옮겼으며 작성자 배치가 다시 실행됐다. 값이 바뀔 때만 title과 UID 속성/스타일을 수정한다. |
| 화면 밖 작성자의 정밀 배치 | 화면 밖 수백 개 작성자까지 폭·폰트·자식 치수를 읽으며 style 쓰기와 layout 읽기를 반복했다. 기존 작성자 경계 관찰에 viewport 관찰을 더해 화면 주변 400px부터 정밀 배치한다. 스크롤/동적 삽입/크기 변경 시 해당 작성자를 갱신한다. |

수정 전 최소 회귀에서 정지된 작성자 UI가 0.5초 동안 DOM을 6,695번 변경했다.
수정 후 같은 검사에서 0번이었다.
멀리 떨어진 작성자의 geometry 읽기는 접근 전 39회에서 0회로 줄었고,
스크롤로 접근한 뒤에는 기존 작성자 열 범위 검사를 통과했다.
동일한 UID 스타일시트 재설정·이동 검사도 3회에서 0회가 됐다.
별도 CSS 디자인이나 설정 복원 정책을 변경할 필요 없이 이 경로를 수정했다.

실제 전체 확장을 로드한 500댓글 fixture를 사용했다.
1100×850, CPU 제한 없음, Google Fonts 응답은 빈 CSS로 고정했다.
기본값 → 열린 탭에서 백업 복원 → 같은 페이지 재로드 → 스크롤 순서로 측정했다.
복원된 최상위 boolean과 AI/계정 필터의 하위 boolean을 원본 값과 대조했다.
수정본 3회 모두 AI 엔진 상태는 ready였고 메모 컨트롤 501개가 생성됐다.

| 구간 | 수정 전 DOM 변경 / Task ms | 수정 후 DOM 변경 / Task ms |
| --- | --- | --- |
| 열린 탭에 복원 | 13,505 / 10,092 | 4 / 525 |
| 복원 후 재로드 | 25,005 / 18,198 | 4 / 437 |

수정 전은 첫 진단 1회, 수정 후는 새 프로필 3회의 중앙값이다.
Task는 CDP TaskDuration 증가량이다.
2초 관측을 요청했지만 수정 전에는 큰 작업이 측정 명령의 처리를 지연시켰다.
따라서 위 값을 고정 2초의 CPU 점유율로 환산하지 않는다.
수정 전 CPU profile의 실제 기록 길이는 복원 구간 약 10.7초, 재로드 구간 약 16.5초였다.
profile 자체에도 비용이 있다.

스크롤에서는 첫 수정 뒤에도 UID 스타일 재삽입으로 80~95ms 프레임 간격과
90~125ms Long Task가 관찰됐다. UID 스타일/속성 갱신까지 줄인 최종본의
3회 결과는 다음과 같다.

| 지표 | 최종본 중앙값 |
| --- | --- |
| 요청한 관측 구간 | 2초 |
| 실제 관측 구간 | 2,001ms |
| TaskDuration 증가량 | 1,338ms |
| Layout / Style | 169 / 120ms |
| rAF 간격 p95 | 10ms |
| Long Task | 0회 |

rAF는 headless 브라우저 표본이며 실제 모니터 FPS로 환산하지 않는다.
스크롤 중 새 작성자 배치와 AI 감지의 가시 영역 처리가 실행되므로 DOM 변경은 존재한다.
정지된 화면의 반복 배치와 스크롤 시 필요한 갱신을 각각 검사했다.
실기기 GPU/GIF/동영상과 계정 활동 실서버 조회 비용은 추가 확인이 필요하다.

| 검사 | 결과 |
| --- | --- |
| Node 단위/계약 | 38/38 통과 |
| 전체 Chromium suite | 53/53 통과, 작성창 85 시나리오 포함 |
| 작성자 표시 | 10개 검사 통과. 긴 이름/UID/메모, OFF 복원, 새 답글, 네이티브 메뉴, 화면 밖→스크롤 포함 |
| 별도 미리보기 회귀 | 통과 |
| 실제 백업 + 기술직갤 미리보기 | 원문/댓글 읽기, 디시콘 패키지·선택·첨부, 글자콘 배경/글자색·첨부·3회 전환 통과. 쓰기 시도 0 |

실사이트 대상은 `gisulzik/660893`였다. 당시 실제 목록 2페이지에서 링크를 찾았다.
첫 페이지에서 글을 찾지 못한 준비 단계 실패를 기록한 뒤 페이지를 지정해 재검사했다.
실제 서버 댓글 등록과 삭제는 수행하지 않았다.
브라우저의 기존 sandbox document.domain 오류와 사이트 TagError가 관찰됐으며,
백업 진단에서는 예외의 이름만 기록했다.

결과 자료는 모두 git에서 제외된 `test-results/`에 있다.

- `backup-before-1106.json`과 구간별 CPU profile
- `backup-final-uid-1106.json`, `backup-final-uid-2-1106.json`, `backup-final-uid-3-1106.json`
- `backup-unit-1106.log`, `backup-browser-1106.log`, `backup-preview-1106.log`
- `live-readonly-backup-live-page2-1106.json`

수정 파일은 `src/content/user/writer-layout.js`, `src/content/user/uid-badge.js`다.
회귀는 `tests/comment-author-browser.test.cjs`에 추가했다.
`tests/backup-performance.cjs`는 백업을 옵션 화면에서 복원하는 성능 진단이고,
`tests/preview-live-readonly.cjs`는 같은 백업의 실사이트 읽기 전용 검사도 지원한다.
사용자 백업 JSON은 저장소에 추가하지 않았다.

```powershell
$env:DCB_BACKUP_PATH='<백업 파일의 전체 경로>'
$env:DCB_PROFILE_LABEL='backup-local'
node tests/backup-performance.cjs --groups
node --test tests/*.test.mjs
node --test --test-concurrency=1 tests/*.test.cjs

$env:DCB_LIVE_READONLY='1'
$env:DCB_ARTICLE_URL='https://gall.dcinside.com/mgallery/board/view/?id=gisulzik&no=660893&page=1'
$env:DCB_LIST_PAGE='2'
$env:DCB_PROFILE_LABEL='backup-live-local'
node tests/preview-live-readonly.cjs --runs=1 --real-list --probe-comment-read
```

실사이트 목록 페이지는 게시글 이동에 맞춰 지정한다.

설치용 개발 빌드는 `dist/DCinside-Gallery-Blocker-7.3.50.2026-backup-performance.zip`이다.
ZIP SHA-256은 `1d7d9e4aa5b6fbdc00e77f540ed9e155ccc0e7b2d68dc70582389458e99e3e6f`다.
압축 해제 로드용 폴더는 `dist/DCinside-Gallery-Blocker/`이며,
manifest와 변경한 두 작성자 모듈의 해시가 작업 소스와 같은지 확인했다.

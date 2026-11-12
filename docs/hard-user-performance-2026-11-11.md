# 디시갤 차단기 7.3.51.2026 성능·호환성 검증

Windows의 격리된 Firefox 153과 Chromium 151에서 11월 11일 백업의 기능 설정을 옵션 복원 경로로 적용했다. 차단 대상과 메모는 같은 개수의 합성 데이터로 치환했고 결제 필드는 제외했다. 개별 이미지 차단은 백업에서 꺼져 있어 해당 재현에서만 켰다. 지정된 원본 ZIP의 동일성을 확인하지 못해 같은 manifest 버전의 Git 89a8cf5를 비교 기준으로 사용했다.

## 미리보기

100행 목록과 긴 본문에서 사용자 입력 후 자동화 도구가 본문 DOM을 확인하기까지의 시간(ms)이다. 네트워크는 합성 응답으로 고정했다. 각 브라우저와 버전에서 댓글 수별 최초 1회와 재열기 6회, 총 21회를 측정했다. 확인 주기는 약 100ms여서 작은 차이의 해석에는 한계가 있다. 재열기 p95는 6회 중 최댓값이다.

| 브라우저 | 댓글 | 최초 전→후 | 재열기 중앙값 전→후 | 재열기 p95 전→후 |
|---|---:|---:|---:|---:|
| Firefox | 50 | 316→177 | 203→129 | 219→140 |
| Firefox | 500 | 3272→158 | 980→143 | 1021→155 |
| Firefox | 2000 | 35728→189 | 3884→134 | 29463→150 |
| Chromium | 50 | 284→232 | 144→116 | 151→123 |
| Chromium | 500 | 594→125 | 466→112 | 488→128 |
| Chromium | 2000 | 1825→151 | 1768→120 | 2468→133 |

Firefox Profiler의 21개 측정 구간에서 콘텐츠 프로세스 메인 스레드 CPU 시간 합계는 102945→3505ms였다. 이 값은 본문만 읽은 세션을 포함한다. 2000댓글을 실제로 읽으러 이동하면 첫 80개 확인에 Firefox 1457ms, Chromium 496ms가 추가로 들었다(각 1회). 앞선 버전은 본문을 표시할 때 이미 전체 댓글을 만들었다.

본문·댓글·작성폼을 분리했다. 댓글 영역 접근 시 조회와 변환을 시작하고, 큰 목록은 80개씩 붙인다. 작성폼은 접근·작성·답글 동작에서 깨우고 기존 네이티브 인증과 편집기를 사용한다. 읽기 전용 실사이트 Chromium 1회에서 cold/warm 작성기 준비는 2887/1582ms, 첫 입력은 35/22ms였다. 게시 요청은 0회였다. 실사이트 SecurityError 4건은 수집한 정보만으로 출처를 판별하지 못했다.

## 원문과 장시간 사용

Firefox 하드유저 원문 500댓글 대조군의 스크롤 프레임 간격 p95는 105→20ms였다(조건별 1회). Firefox 지연 주입 배치는 6→5회였다. Firefox Profiler에서 UID 추출과 계정 활동 대기열 재검사가 상위 비용으로 관찰되어 대기열을 한 번씩 순회하도록 변경했다. 작성자 폭 측정은 여전히 비용이 크다. Chromium 원문 500댓글에서 별도 연속 측정한 p95는 25→50ms, 재대조는 30→45ms였다. Chromium 원문 스크롤 개선은 달성하지 못했다.

Chromium 4배 CPU 제한 스크롤 시험은 20/50/500/2000댓글 각각 cold/warm 5회, 총 40개 표본에서 정지 후 DOM 변경이 0이었다. 2000댓글 warm 스크롤 프레임 p95의 중앙값은 66.6ms였다. Firefox에서 전·후 각각 미리보기를 닫고 30분 대기한 끝에 작성 iframe은 0개였다. 별도 두 갤러리 탭 시험은 마지막으로 확인한 기록이 Chromium 8분, Firefox 9분이다. 누적 메모리·리스너와 두 브라우저 전체에 대한 30분 무누수 보장은 검증 범위 밖이다.

## 이미지와 가져오기

실제 일반·마이너 게시글에서 PC 경고의 spoiler_warning/​spoiler_inner와 모바일 경고의 spoiler/​spoiler-inner를 확인했다. PC에서 경고 닫기도 확인했다. 경고를 이미지 차단 대상에서 제외했다. 저장된 URL은 동기 조회하고 문서 루트 생성 직후에 스타일과 감시를 설치한다. 실제 두 엔진의 파서 지연 재현에서 수정 전에는 DOMContentLoaded 전 원본이 보였고 수정 후에는 숨겨졌다. 모든 네트워크·저장소 타이밍을 포괄하는 결과는 아니다.

| 출처 | 지원 및 검증 |
|---|---|
| 공식 PC웹 메모 | 실제로 내보낸 dcbackup_PC .dcdata 파일로 검증 |
| 공식 모바일웹 메모 | 실제로 내보낸 dcbackup_M .txt v4 파일로 검증 |
| 직접 작성한 텍스트 | UID 또는 IP와 메모를 탭/하이픈으로 구분. 모호한 줄은 검토 대상으로 표시 |
| 공식 앱 | 실제 내보내기 샘플 미확보. 호환성 미확인 |
| 공식 웹 차단 목록 | PC·모바일 설정 화면 확인. 검증한 파일 형식이 없어 자동 가져오기 미지원 |

옵션의 이용자 메모 관리에서 파일과 범위·충돌을 확인한 뒤 가져온다. 기본은 기존 값 유지다. 적용 전 메모 백업을 다운로드하고, 같은 옵션 화면에서 방금 가져오기를 취소할 수 있다. 가져온 뒤 직접 편집한 항목은 취소할 때 보존한다. DCB 전체 설정은 기존 백업 불러오기에서 복원한다. 이전 버전으로 복귀하려면 현재 설정을 내보낸 다음 기존 확장 소스와 변경 전 백업을 사용한다.

## 변경 파일

- 부트스트랩과 주입 순서 — src/background/background.js, src/background/content-script-profiles.js, src/content/core/feature-loader.js
- 미리보기·댓글·네이티브 작성기 수명 — src/content/core/content_script.js
- 이미지와 활동량 판정 — src/content/image/image-blocker.js, src/content/image/image-account-filter.js, src/content/user/account-activity-blocker.js
- 익명 표시·작성자 배치·범위별 메모 — src/content/appearance/writer-layout.css, src/content/user/writer-layout.js, src/content/user/user-memo.js
- 주제 명칭·공식 파일 미리보기·복원과 취소 — src/ui/popup/popup.html, src/ui/options/options.html, src/ui/options/options.js, src/ui/options/official-memos.js
- 검증 — tests/backup-performance.cjs, tests/hard-user-preview-profile.cjs, tests/helpers/synthetic-profile-backup.cjs, tests/helpers/native-preview-document.cjs, tests/image-first-paint.test.cjs, tests/official-memos.test.cjs, tests/comment-author-browser.test.cjs, tests/preview-compose.test.cjs, tests/preview-lifecycle.test.cjs, tests/preview-scroll-profile.cjs

Node 계약 검사 38개, 브라우저 회귀 묶음 63개 통과. 후속 작성자·메모·미리보기 검사 15개 통과. 작성폼 모의 회귀는 88개 시나리오 통과. preview-regression과 preview-scroll-profile --check --runs=5도 통과했다. 별도 Firefox 작성기 시간 측정의 기준 버전에서 준비 확인이 시간 초과되어 Firefox 작성폼 전후 수치는 제출하지 않는다. 실계정 로그인·등록·삭제는 수행하지 않았다.

공식 근거: [디시 공지](https://gall.dcinside.com/board/view/?id=know&no=428), [모바일 이용자 메모](https://m.dcinside.com/userMemo/board/de), [모바일 차단 설정](https://m.dcinside.com/userBlock/common/board/opennamu).

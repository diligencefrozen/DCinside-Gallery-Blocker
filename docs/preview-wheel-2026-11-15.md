# 열린 미리보기 휠 스크롤 끊김 수정

사용자 확인: 주된 불편은 본문을 여는 순간보다 **열린 미리보기의 스크롤**이다. 이전 댓글 추가 클릭 측정과 구분하여 실제 `mouse.wheel()` 입력을 사용했다. 기준 소스 `2382b2b`, manifest `7.3.51.2026` 유지.

## 확인된 문제와 변경

- `src/content/core/content_script.js`: 표시된 댓글이 80개뿐인데도 그 하단의 작성 영역이 근접 감지되어 원문 작성기 iframe이 실행됐다. Chromium/Firefox 합성 휠 검사 모두 iframe 1개가 생겼다. 미표시 댓글/대기 중인 댓글이 남아 있으면 근접 감지만으로 작성기를 깨우지 않는다. 마지막 댓글까지 표시한 뒤에는 다시 근접 감시를 연결한다. 직접 작성·답글 클릭과 저장된 초안 복원 경로는 유지한다.
- 같은 파일: 자동 스크롤 추가는 한 번에 80개 대신 16개를 처리하여 프레임당 작업을 제한한다. '댓글 더 보기'를 직접 누르는 경우는 기존 80개를 유지한다. 댓글을 버리거나 총 조회량을 제한하지 않으며 기존 키워드·이미지·사용자 필터를 적용한다.
- `src/content/user/writer-layout.js`: CSS로 줄바꿈하는 미리보기 댓글 작성자에는 너비 측정용 ResizeObserver/IntersectionObserver 등록을 생략한다. 초기 배치·이름/메모 변경·닫기 정리는 유지하고, 일반 게시판 및 원문 댓글의 너비 조정은 바꾸지 않는다.
- `tests/preview-activity-layout.test.cjs`: 실제 휠 프로파일, 부분 목록의 작성기 수면, 마지막 댓글 도달 시 준비, 직접 답글 기동, 닫기 후 iframe 제거 검사 추가.

배경 흐림은 켬/끔 순서 및 역순으로 확인했다. 초기 Firefox 표본에서 큰 차이가 있었으나 역순에서는 재현되지 않았다. 원인으로 단정하거나 디자인을 축소하지 않고 기존 효과를 유지했다.

## 전후 측정

Windows, Playwright headless Chromium 151.0.7922.34 / Firefox 153.0. 입력 댓글 2,000개·고유 UID 100개·활동량 성공 캐시·메모·키워드 숨기기 ON·댓글 이미지. 동일한 위치에서 휠 600px × 40회, 입력 사이 30ms. 엔진별 전후 각 3회. 서버 요청은 합성 응답이다.

아래는 회차별 값의 중앙값이다. '최대 프레임 간격'은 각 회차 최대값 3개의 중앙값이며 전체 표본의 p95가 아니다.

| 지표 | Chromium 전→후 | Firefox 전→후 |
|---|---:|---:|
| 최대 프레임 간격 | 55→20.1ms | 65→25ms |
| 50ms 초과 프레임 수 | 1→0 | 1→0 |
| 프레임 간격 p95 | 5.1→5.1ms | 15→15ms |
| 스크롤 중 작성기 iframe | 1→0 | 1→0 |
| DOM mutation | 2,572→2,058 | 2,573→2,060 |
| 작성자 fit 함수 호출 | 379→544 | 364→544 |
| 실제 마운트된 댓글 | 160→144 | 160→144 |
| 마지막 scrollTop | 24,000→23,679px | 21,440→21,440px |
| 추가 활동량 요청 | 0→0 | 0→0 |

큰 단발 작업을 나누어 끊김이 줄었다. 프레임 p95가 향상된 것은 아니다. 작은 배치를 여러 번 추가하므로 fit 함수 호출 총수는 늘었지만, 미리보기 댓글의 함수는 너비 계산을 하지 않는다. 같은 휠 입력 후 필요한 주변 댓글만 더 작게 준비하여 마운트 수가 16개 적다. Chromium은 끝 위치도 321px 차이가 있으므로 완전히 동일한 DOM/이동 거리의 CPU 벤치마크로 해석하지 않는다. 전체 기능을 끄거나 실제 요청 한도를 올리지 않았다.

배경 흐림 초기 표본의 Firefox 830ms 최대 프레임은 역순에서 재현되지 않아 대표 전후 수치에 사용하지 않았다. 이 검사는 실사이트 로그인 상태·동영상/GIF 디코드·GPU·장시간 사용 전체를 대표하지 않는다. Firefox는 Chromium Long Task API가 없어 동일한 Long Task 수로 비교하지 않았다.

## 검증 명령

```powershell
$env:DCB_PREVIEW_SCROLL_PROFILE='1'
$env:DCB_PREVIEW_BASELINE='2382b2b'
node --test --test-name-pattern='continuous wheel profile' tests/preview-activity-layout.test.cjs
Remove-Item Env:DCB_PREVIEW_BASELINE
node --test --test-name-pattern='continuous wheel profile' tests/preview-activity-layout.test.cjs
Remove-Item Env:DCB_PREVIEW_SCROLL_PROFILE
node --test --test-concurrency=1 tests/preview-activity-layout.test.cjs tests/comment-author-browser.test.cjs
node tests/preview-compose.test.cjs
node tests/preview-lifecycle.test.cjs
```

배경 효과 분리 검사에는 `DCB_PREVIEW_BLUR_AB=1`, 역순에는 `reverse`를 사용했다. 수정 전 최초 휠 검사는 예상과 달리 iframe 1개가 생성되어 실패했고, 이후 기준 측정에서는 이를 결함으로 기록하도록 바꾸었다. 수정 후 검사는 iframe 0개를 요구한다.

결과: 전후 휠 프로파일 각 2개 통과. 일반 회귀 22개 통과, 별도 실행 모드의 프로파일 4개 skip. 작성폼 88개 시나리오와 수명주기 스크립트 통과. 마지막 댓글에서 자동 준비, 직접 답글의 즉시 기동, 닫기 후 iframe 제거를 Chromium/Firefox 모두 확인했다. 변경 JS/CJS 문법 및 diff 검사 통과. 전체 테스트와 실제 사용자 로그인 페이지 검증은 이번 범위에서 미실행이다.

작업 중 기능 수정과 최초 휠 검사 부분은 기존 커밋 `cc56920`에 반영되어 해당 커밋을 보존했다. 후속 검증 커밋과 배포 파일에는 이 기능 수정과 최종 테스트가 모두 포함된다.

원본 측정: `test-results/preview-activity/{before,after}/{chromium,firefox}-wheel.json` 및 `*-wheel-ab*.json`.
로그: `test-results/preview-wheel-baseline.log`, `preview-wheel-after.log`, `preview-wheel-blur-reverse.log`, `preview-scroll-regression.log`, `preview-scroll-composer.log`, `preview-scroll-lifecycle.log`.

업데이트 후 확장과 열린 갤러리 탭을 새로고침한다. 저장 설정·메모·차단 목록·백업 스키마는 유지하며 재가져오기가 필요 없다. 문제 발생 시 이전 소스로 바꾸고 다시 로드할 수 있다.

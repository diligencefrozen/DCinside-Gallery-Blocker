# 디시 자체 기록 연동: 7.3.52.2026 개발 작업 결과

이 문서는 초기 수동 DOM 경로의 개발 기록이다. 이후 사용자 요구에 따라 기본 흐름은 사이트 페이지를 직접 열 필요가 없는 자동 수집으로 변경했다. 최신 범위·메모 모델·검증 결과는 [자동 가져오기 및 상단 이동 보고서](automatic-records-and-scroll-top.md)를 참고한다. 수동 DOM 읽기는 고급 대체 경로로 유지한다.

작업일: 2026-11-16 (한국 시간). 기준은 작업공간 `develop`의 `256a3de`, manifest `7.3.51.2026`이다. 지정된 이름의 `DCinside-Gallery-Blocker-v7.3.51.2026-Chrome-Firefox-Store.zip`은 작업공간과 Downloads에서 발견하지 못해 ZIP과 전체 파일 동일성은 확인하지 못했다. 기존 작업공간의 기능을 유지하는 증분 변경이다.

manifest 버전은 바꾸지 않았고 릴리스 빌드·스토어 업로드도 하지 않았다. 제공하는 개발 소스 스냅샷은 검토용 소스이며 새 배포용 확장 패키지가 아니다. 실제 등록 항목이 들어 있는 계정 DOM 검증은 릴리스 전 남은 작업이다.

## 직접 읽기 안내·페이지 선택 보완

목록 창을 열지 않은 상태에서 ‘직접 읽기 실패’가 표시된 사용자 보고를 확인했다. 수집기는 사이트에 표시된 목록을 읽기 때문에 갤러리 페이지를 열거나 ‘설정’ 메뉴만 연 상태에서는 읽을 목록이 없다. 안내를 ‘디시 페이지로 이동 → 설정 → 차단 설정/이용자 메모의 목록 창 열기 → 확장으로 돌아와 읽기’ 3단계로 구체화하고, 이 경우에는 미지원 실패 대신 ‘목록 창 열기 필요’와 읽으려던 페이지를 표시한다. 이용자 메모 목록은 글목록 페이지에서 열도록 안내한다.

함께 확인한 페이지 선택 문제도 수정했다. 여러 디시 탭이 있으면 처음부터 임의의 첫 탭을 고르지 않으며, 목록에 갤러리 ID를 표시한다. ‘디시 PC웹 열기’로 생성한 새 탭을 선택하고, 열린 페이지를 다시 찾을 때는 이전 수집 미리보기를 무효화한다. 이전 탭의 기록을 다른 탭의 미리보기로 오인해 적용하는 일을 방지한다. 새 탭의 페이지 로딩이 늦으면 URL 필터 조회에서 일시적으로 빠질 수 있어, 생성한 탭의 출처가 검증된 `pendingUrl`도 선택 목록에 포함한다. 실제 목록 읽기는 페이지 로딩 후 확정 URL을 다시 검증한다.

격리된 Chromium·Firefox에서 실제 공개 PC 사이트의 설정 메뉴와 차단/메모 목록을 열어 수집기가 인식하는 것을 확인했다. 옵션에 해당하는 다른 탭으로 전환해도 모달이 유지되고 읽기가 성공했다. 목록은 빈 새 프로필로 검사했으며, 실제 등록 항목이 있는 로그인 계정의 파싱 검증을 대신하지 않는다. 근거: `test-results/native-records/modal-investigation.json`.

후속 수정 검증: 직접 가져오기 UI **5/5**, 기존 공식 메모·설치형 가져오기·붙여넣기/화면 회귀 **10/10** 통과. 실제 Chromium 설치형에서 새 페이지 응답을 800ms 지연시켜도 새 탭 선택이 유지되는 것을 확인했다. 안내의 번호 목록 배치도 양 엔진에서 검증했다. 이 후속 변경은 옵션 화면과 테스트·문서에 한정하며 원본 사이트 기록이나 저장/되돌리기 모델은 변경하지 않는다.

## 구현

설정 → 디시 기록 가져오기에 ‘디시인사이드에 등록된 목록 직접 불러오기’를 추가했다. 사용자는 같은 브라우저의 디시 PC 갤러리에서 차단 또는 메모 설정을 직접 열고 목록을 확인한 뒤, 확장 옵션으로 돌아와 읽기를 명시적으로 실행한다. 페이지를 여는 것과 목록을 읽는 것은 별도 동작이다. 전체·갤러리별 탭, 갤러리 선택, 검색·다음 페이지를 자동으로 조작하지 않는다.

수집기는 HTTP(S) `gall.dcinside.com` 최상위 프레임과 실행 전후 URL을 확인한다. 현재 열린 DOM에서 단어·식별 코드·닉네임·IP 및 메모 식별자·본문·색상을 읽는다. 원본 유형과 `scope`, `galleryId`, `galleryType`, `enabled`, `source:'dc-native'`를 보존한다. 사이트의 실제 차단·메모 코드가 식별 코드/pcode를 작성자의 `data-uid`와 비교하는 것을 확인한 경우에만 UID로 매핑한다. 닉네임은 UID로, IP 두 자리는 전체 IP로 바꾸지 않는다.

미리보기는 범위·유형·원본 ON/OFF·중복·충돌·적용 가능·보류 사유를 표시한다. 기본은 병합, 기존 메모 유지다. 기존 메모 덮어쓰기는 별도 체크이며 차단은 미리보기 확인 후 적용한다. 필터 ON/OFF는 변경하지 않는다. 보류·수집 참고 항목은 적용 후에도 화면에 남는다. 기존 붙여넣기 및 공식 PC `.dcdata`·모바일웹 `.txt` 메모 백업 가져오기는 유지한다.

| 직접 가져오기 항목 | 처리 |
|---|---|
| ON 전역 이용자 차단: 검증된 UID, 구분 가능한 닉네임, IP 두 자리 접두부 | 기존 `dcb.recordsImport` → `DCBUserBlockStore` 로컬 v2 버킷에 병합 |
| ON 전역 차단 단어 | 기존 `storage.sync.blockedKeywords`에 병합, `keywordBlockEnabled` 유지 |
| 전역 UID/IP 메모 | 기존 로컬 `userMemos`에 본문·색상·원본 메타정보 보존 |
| OFF 또는 상태 미확인 차단 | 보류, 자동 활성화하지 않음 |
| 갤러리별 차단 | 갤러리 종류를 포함한 적용 구조가 없어 보류, 전역 승격하지 않음 |
| 직접 읽은 갤러리별 메모 | 기존 키 `gallery:<id>:uid/ip:<value>`가 갤러리 종류를 구분하지 못하므로 보류. 공식 메모 백업의 기존 범위 복원은 유지 |
| 불명확한 식별자·전체 IP·인식 불가 행 | 사유 표시 및 보류, 추정 저장하지 않음 |

적용된 원본 메타정보는 로컬 `dcbNativeImportMetadata`에 보존하고 같은 undo journal로 되돌린다. 보류 항목은 활성 저장소에 쓰지 않는다. 같은 목록을 다시 적용해도 차단·메모·키워드가 증가하지 않으며 실질적인 변경이 없으면 직전 undo를 보존한다. 가져온 뒤 수동 편집하거나 삭제 후 재등록한 항목은 선택적 undo로 보호한다.

메모·변경 버킷·메타정보·undo는 한 번의 로컬 write로 반영한다. 키워드는 sync 저장소라 로컬과 단일 원자 write를 할 수 없다. 먼저 `dcbRecordsImportPending`을 기록하고 sync 저장 후 로컬 최종 반영과 pending 해제를 함께 한다. 오류나 워커 중단 시 가져오기가 만든 키워드 차이만 보상 복구한다. 복구도 실패하면 실패로 보고하고 다음 워커 실행/키워드 변경/가져오기에서 재시도한다. 시작 복구와 키워드 편집은 공통 큐를 기다린다. 옵션 키워드 편집도 기존 백그라운드 메시지를 사용하도록 연결했다.

저장 이벤트와 기존 캐시 갱신 경로를 유지한다. 설치형 Chromium 검사에서 이미 열린 목록·게시글의 이용자 차단, 댓글 키워드 필터, 메모 표시가 가져오기 직후 반영되고 undo로 해제되는 것을 확인했다. Chromium/Firefox 설치형 저장 검사에서 기존 메모·수동 수정·중복·필터 OFF 유지와 undo를 확인했다.

## 디시 자체 외부 링크 경고

`manifest.json`에 PC 갤러리 전용 MAIN world `document_start` 스크립트를 추가했다. 확장이 브라우저에서 활성화된 동안 디시 자체 외부 링크 이동 경고를 자동으로 OFF로 유지한다. 확장의 갤러리 차단 ON/OFF는 이 기능의 활성 스위치가 아니다.

공개 디시 코드에서 unchecked가 경고 OFF를 뜻하며 `OutLink.toggleWarning({checked:false})`가 `outlink_warning='N'`과 비공개 경고 캐시를 함께 갱신하는 것을 확인했다. 이 사이트 함수를 사용하고 초기화·사이트 UI 재활성화·다른 탭 변경·새로고침·클릭 전 stale cache를 처리한다. 설정 팝업을 열 필요가 없다. 실패 시 HTML의 `data-dcb-outlink-state`, `data-dcb-outlink-reason`과 콘솔에 원인을 남긴다. 다른 디시 설정, 쿠키·토큰, 브라우저 설정은 읽거나 변경하지 않는다.

**보안상 변경:** 외부 사이트로 이동하기 전에 디시가 제공하던 안내가 제거된다. Chrome/Firefox의 세이프 브라우징·인증서 경고와 확장 자체 링크 보호는 그대로다. 릴리스 노트·README·개인정보 안내에 이 사실을 명시했다. 확인한 API는 `gall.dcinside.com`에만 있어 다른 호스트에는 임의의 우회 동작을 추가하지 않았다.

## 검증

최종 단위·계약 검사: **50/50 통과**. 신규 저장·복구 검사 12개를 포함한다. 최종 전체 브라우저 묶음은 **121개 중 117개 통과·실패 0·선택적 성능 프로필 4개 건너뜀**, 약 292초다. 전체 검사 후 페이지 선택 변경 시 이전 미리보기를 무효화하는 UI 보강도 해당 양 엔진·설치형 묶음 3/3으로 재검증했다.

- 직접 DOM 수집 3/3: Chromium·Firefox, 빈/닫힌 목록, 독립 ON/OFF, 전체/갤러리 범위, 특수문자·색상, IP 접두부, 변경 DOM·개수 불일치·검색·페이지 나누기 감지, 읽기 중 변경, 10,000건 한도, 위장 출처 거절.
- 직접 가져오기 UI 3/3: 두 엔진의 합성 DOM 흐름 및 Chromium 실제 설치형 scripting→collector→background→storage. 미리보기·보류·충돌·중복 두 번·undo·필터 OFF 유지·원본 DOM 무변경, 열린 화면의 필터/메모 갱신.
- 기존 공식 메모 4/4, 설치형 가져오기 3/3: Chromium/Firefox 파일·붙여넣기·신규 native payload·색상·특수문자·수동 변경·실제 저장·문서 재로드.
- 외부 링크 경고 회귀 5/5 및 **실제 공개 페이지 설치형 8조합 통과**: Chromium/Firefox × 일반·마이너·미니·인물. 확장 없는 격리 프로필에서 경고 표시를 먼저 확인했다. 확장 설치 후 ON 재설정·새로고침·실제 포인터 클릭으로 `example.com` 목적지가 열리며 디시 경고가 없는 것을 확인했다. 실제 로그인 세션은 사용하지 않았다.
- 기존 전체 검사에서 발견한 익명 미니 IP 2건·키워드 카테고리 1건 실패는 HEAD에서도 동일하게 재현됐다. 제품 수정 없이 mock의 callback/Promise 지원과 JSON 차단 키 검증을 현재 API 계약에 맞춰 정정했다. 해당 묶음 재검사 통과.

```powershell
node --test --test-isolation=none tests/*.test.mjs
$env:PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS='1'
node --test --test-concurrency=1 --test-force-exit tests/*.test.cjs
node tests/dc-outlink-live.cjs
git diff --check
```

Playwright의 이 Windows 호스트 사전 검사가 `msvcp140_1.dll` 미발견을 보고했지만, 제공된 Firefox 바이너리는 정상 실행했다. 위 환경변수는 테스트 런처의 호스트 의존성 사전 검사만 생략하며 브라우저 보안 보호를 변경하지 않는다. 검사 로그: `test-results/native-records/full-browser.log`. 실제 외부 이동 결과: `test-results/dc-outlink-live/result.json`, 양 브라우저 baseline/off PNG. 미리보기 PNG: `test-results/native-records/`.

검사 브라우저는 Playwright Chromium 및 Firefox다. 사용자의 Chrome 프로필이나 로그인 데이터는 사용하지 않았으며 Chrome 정식 배포판의 해당 로그인 세션 검증을 대신하지 않는다.

## 남은 확인과 제한

- 제공된 HTML도 목록이 비어 있어 실제 등록 행이 있는 로그인 브라우저의 DOM·동적 렌더링은 미검증이다. 공개 사이트 템플릿과 동작 코드를 근거로 한 개발본이며 결과에 항상 이 제한과 불완전 범위를 표시한다. 빈 DOM을 서버 목록 없음으로 해석하지 않는다.
- 공개 차단·메모 구현은 현재 기기/브라우저의 사이트 로컬 데이터를 사용한다. 계정의 서버 전체 목록·다른 기기 목록을 가져온다고 보장하지 않는다. 모달에 아직 로드되지 않은 항목, 다른 갤러리·메모 범위·다음 페이지는 자동 수집하지 않는다. 사이트 UI에서 읽은 상태는 저장되지 않은 편집 내용을 포함할 수 있으므로 사용자가 목록을 확인해야 한다.
- 직접 읽기는 PC 갤러리만 지원한다. 모바일 직접 수집, 로그인/비로그인 실제 데이터 조합, 사이트가 앞으로 추가할 페이지 나누기는 추가 검증이 필요하다. 공식 웹 메모 백업과 목록 붙여넣기를 유지한다.
- 갤러리별 차단·메모는 갤러리 종류까지 보존하는 적용 모델을 별도로 마련하기 전까지 보류한다. 기존 공식 백업 경로가 갤러리 종류별 구별을 새로 지원하게 된 것은 아니다.
- 단방향 가져오기다. 실시간 자동 동기화, 확장→사이트 차단·메모 쓰기, 추정 내부 저장 API, 로그인 토큰·쿠키 수집은 구현하지 않았다.
- 추가 확장 권한은 없다. 기존 `scripting`·host 권한을 명시적 DOM 읽기에 사용한다. native 읽기는 ISOLATED world, 외부 링크 경고 처리만 검증된 PC 출처의 MAIN world에서 동작한다.

공개 소스 URL·해시와 세부 DOM 근거는 [조사 문서](dc-native-records-development.md)에 있다.

## 변경 파일

제품: `manifest.json`, `src/content/core/dc-outlink-off.js`, `src/content/dc-native-records-collector.js`, `src/shared/storage/user-block-store.js`, `src/background/background.js`, `src/ui/options/options.html`, `src/ui/options/dc-records-import.js`, `src/ui/options/options.js`.

검사: `tests/native-records-store.test.mjs`, `tests/native-records-ui.test.cjs`, `tests/dc-native-collector.test.cjs`, `tests/dc-outlink-off.test.cjs`, `tests/dc-outlink-live.cjs`, `tests/records-installed.test.cjs`, `tests/anonymous-mini-ip.test.cjs`, `tests/keyword-categories.test.cjs`.

문서: `README.ko.md`, `README.md`, `PRIVACY.md`, `docs/release-7.3.52.2026.md`, `docs/dc-native-records-development.md`, 이 문서.

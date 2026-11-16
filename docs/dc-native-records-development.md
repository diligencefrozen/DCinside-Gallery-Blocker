# 디시 자체 기록 직접 가져오기 개발 근거

초기 DOM 수집 조사 기록이다. 현재 경로는 여기서 확인한 사이트 저장 형식을 사용하는 자동 수집이며, 상세 내용은 [자동 수집 보고서](automatic-records-and-scroll-top.md)에 있다. 수동 DOM 읽기 UI는 제거했다. 아래 내용은 개발 조사·회귀 검사 기록이며 현재 사용자 절차가 아니다.

2026-11-16 공개 PC 웹 소스와 사용자가 제공한 설정 HTML을 기준으로 조사했다. 실제 항목이 등록된 로그인 세션의 DOM은 확인하지 못했다. Chrome의 열린 사용자 창은 Computer Use가 현재 URL을 충분히 확인할 수 없어 접근을 중지했다. 따라서 아래 구현과 합성 DOM 검사가 실제 로그인 계정의 전체 목록 수집 검증을 대신하지 않는다. 버전 변경과 릴리스 패키징 전 등록된 목록으로 별도 검증해야 한다.

## 확인한 공개 소스

| 소스 | 확인한 내용 | 내려받은 내용의 SHA-256 |
|---|---|---|
| [PC 프로그래밍 갤러리](https://gall.dcinside.com/board/lists/?id=programming) | `#user_block`, 전체·갤러리별 패널, 4종 입력, `block_word-tmpl` | `EB575618147A62CB1B565B65539126AC75AB8203297D3636435EDF11820AD60D` |
| [user_block.js?v=261106-2](https://gall.dcinside.com/_js/user_block.js?v=261106-2) | 저장·로드·실제 차단 매칭·템플릿 렌더 | `FD2D1A2AFBD928EB9DF8AD205B3CB51C6A40D98BC6D10CF767FD503E6C02A438` |
| [head_scripts_combined.min.js?v=1794465317](https://gall.dcinside.com/_js/minify/head_scripts_combined.min.js?v=1794465317) | `UserMemo` 저장·로드·식별자 매칭·메모 렌더 | `655D09A9D1109B38404216DAFA10C1B361AFFF36FCD3480E3188A1D653CFA405` |
| [이용자 메모 목록 템플릿](https://gall.dcinside.com/ajax/user_memo_ajax/list) | 공개 `UserMemo.winList()`에 명시된 GET 경로의 HTML, `user_memo_row-tmpl` | `2A8AC543E06CF8CCA23507E6D32F880B109F0F514DD15EAFB405762EBCC9BA41` |

조사용 원본은 `test-results/dc-native-research/`에 있으며 배포 코드에 포함하지 않는다. 공개 문서의 GET 요청만 사용했다. 로그인 쿠키·토큰·사용자 프로필 저장소를 조사하거나 내부 저장 엔드포인트를 추정하지 않았다. 위 소스는 사이트 변경에 따라 달라질 수 있다.

## 사이트 데이터의 의미

`user_block.js`의 `ub_save_conf()`는 `localStorage.block_all`과 `localStorage.block_parts`에 `on`, `word`, `id`, `nick`, `ip`를 저장한다. `ub_load_conf()`가 이를 읽고, `ub_set_words()`가 `||`로 나눈 값을 `<span class="block_word">`로 렌더한다. 전체 설정과 갤러리별 설정의 활성 상태는 각각 `.setting_onoff button.on`으로 읽으며, 탭의 선택 상태와 별개다. OFF 규칙도 목록에는 존재한다.

`UserMemo`는 `crossDomainStorage`를 통해 gall 출처의 `localStorage.user_memo`를 사용한다. 공개 메모 UI도 메모를 등록한 기기에서 확인한다고 설명한다. 따라서 수집 결과는 현재 브라우저·기기의 사이트 UI에서 읽은 기록이며, 로그인 계정의 서버 목록이나 다른 기기의 목록을 전부 조회했다는 의미가 아니다. 빈 DOM은 서버 데이터 없음의 근거로 사용하지 않는다.

식별 코드의 매핑은 이름만으로 추정하지 않았다. `user_block.js`의 `_chk_str()`는 `type === 'id'`일 때 작성자의 `data-uid`를 읽어 정확히 비교한다. `UserMemo.renderWriterMemoBadges()`도 `pcodeMemos[작성자 data-uid]`를 조회한다. 이 근거로 차단 `id`와 메모 `pcode`는 `targetType:'uid', identityVerified:true`로 내보내며 `nativeTargetType`에 원래 유형을 남긴다. 닉네임은 `nick`으로, IP는 원문 그대로 유지한다. IP처럼 보이는 UID 등 확장 토큰 모델에서 다른 유형으로 재분류될 수 있는 값은 저장 정규화 단계에서 보류해야 한다.

## DOM 수집의 경계

`src/content/dc-native-records-collector.js`의 `DCBNativeCollector.collect()`는 옵션 화면의 명시적 실행으로 주입된다. 허용 출처는 HTTP(S) `gall.dcinside.com`의 최상위 프레임이다. 사이트 함수 호출, 사이트 저장소 접근, 네트워크 요청, 쿠키·토큰 접근, 자동 탭 선택, 등록·삭제·저장을 하지 않는다.

사용자가 연 차단 설정 모달에서는 전체 패널과 현재 선택한 갤러리 패널의 DOM을 읽는다. 다른 갤러리의 이름 목록을 규칙으로 해석하지 않으며 자동 선택하지 않는다. 메모에서는 현재 선택한 전체/현재 갤러리 범위만 읽는다. `#user_memo_setting.gall_setting`의 클래스 이름은 전역 여부를 결정하지 않는다. 메모 범위는 `.tab_menubox button.on`의 `.all` 여부로 구별한다.

차단 행은 각 유형 입력과 같은 `.set_cont`의 `ul.block_list.word > li .block_word`에서 읽는다. 메모 행은 `.nik`의 식별자, `.mone`의 본문과 색상, 체크박스의 `식별자-본문` 값을 교차 확인한다. 색상·특수문자와 IP 접두부를 보존한다. 활성 토글 표시가 모순되면 `enabled:null`로 남겨 적용을 보류한다. 갤러리 ID와 종류를 검증할 수 없는 범위, 모양이 바뀐 행, 메모 표시 건수와 실제 행 수 불일치는 사유를 기록한다.

결과에는 항상 `coverage.complete:false`, `validation:'public-templates-only'`와 실제 로그인 목록 미검증 안내가 들어간다. 검색 결과나 페이지 나누기 UI를 발견하면 현재 DOM만 읽었다고 표시한다. 한 번에 10,000건·4MB까지만 허용하고 초과 시 잘린 목록을 반환하지 않는다. 60ms 간격의 두 읽기 결과가 다르거나 URL이 바뀌면 전체 수집을 취소해 재시도를 안내한다.

수집 결과는 곧바로 저장하지 않는다. 정규화와 미리보기, 사용자의 적용 확인을 거친다. 전역 이용자 차단과 메모는 기존 저장 경로를 사용하고, 전역 단어는 기존 키워드 목록에 병합한다. OFF 규칙·갤러리별 차단은 보류하며 전역 차단으로 승격하지 않는다. 직접 읽은 갤러리별 메모도 기존 키가 갤러리 종류를 구분하지 못해 적용은 보류한다. 확장 필터의 활성화는 수집기의 동작 범위에 포함하지 않는다. 기존 공식 메모 백업 및 목록 붙여넣기는 대체 경로로 유지한다.

## DOM 수집 검사

`tests/dc-native-collector.test.cjs`는 공개 템플릿을 따라 만든 **합성 등록 항목**으로 다음을 검사한다.

- Chromium·Firefox에서 4종 차단의 원문, 동일 값의 범위별 구별, 전체 OFF/갤러리 ON의 독립 상태, UID/닉네임 구별.
- 전체·미니 갤러리 메모의 범위, 색상, 특수문자, IP 두 자리 접두부 보존.
- 사이트 저장소·함수·네트워크 미접근과 DOM 변경 없음.
- 닫힌 모달, 빈 DOM, 바뀐 행 구조, 표시 건수 불일치, 검색 필터·페이지 나누기, 수집 중 변경, 위장 호스트 거절.
- 대량 목록의 10,000건 초과 시 부분 목록 반환 방지.

실행 결과: 3/3 통과. 이 호스트에서 Playwright의 Firefox 의존성 검사가 `msvcp140_1.dll` 누락을 보고했으나, 사전 검사를 제외하면 제공된 Firefox 바이너리가 정상 실행되고 실제 엔진 검사도 통과했다.

```powershell
$env:PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS='1'
node --test tests/dc-native-collector.test.cjs
```

미검증 항목은 실제 등록 목록이 들어 있는 로그인·비로그인 브라우저 세션, 사이트가 앞으로 추가할 페이지 나누기, 다른 브라우저/기기의 로컬 목록 차이, 모바일 사이트의 직접 수집이다. 현 UI 범위에서 모두 읽지 못한 항목은 사이트에서 범위나 페이지를 직접 바꾸어 다시 수집하거나 공식 메모 백업·목록 복사를 사용한다.

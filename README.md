# 디시갤 차단기

[![Chrome Web Store](https://img.shields.io/chrome-web-store/v/fnfmdbldnhadkadklplhcjcojjiaopgg?label=Chrome%20Web%20Store)](https://chromewebstore.google.com/detail/fnfmdbldnhadkadklplhcjcojjiaopgg)

디시인사이드를 이용하다 보면 **욕설과 선동**이 넘치는 갤러리를 실수로 방문할 때가 있습니다.<br>
**디시갤 차단기**는 이런 문제 갤러리를 자동으로 *완전 차단* 하거나,<br>몇 초 뒤 메인으로 *리다이렉트* 해 주는 크롬 확장 프로그램입니다.<br>
또한 메인,갤러리,검색 페이지의 불필요한 **사이드바, 뉴스 탭, 댓글 영역** 등을 깔끔하게 숨길 수 있습니다.

## 주요 기능

| 구분               | 기능 |
|--------------------|------|
| **갤러리 차단**       | - 실베(`dcbest`) 기본 차단<br>- 사용자 지정 갤러리 무제한 추가/삭제 |
| **차단 방식 선택**     | - *초보 모드* : 0 ~ 10초 후 메인으로 리다이렉트<br>- *하드모드(기본)* : 네트워크 레벨에서 즉시 차단 |
| **사용자 차단(UID/IP)** | - 회원 **UID** 와 비회원 **IP**(예: `119.202`) 등록 차단<br>- DC 시스템 **회색처리(.block-disable)** 포함 차단<br>- 기능 **OFF 시 차단목록에 있어도 차단 미적용 |
| **우클릭 차단**    | - 우클릭 메뉴 **“디시갤 차단기 → 해당 유저 즉시 차단!”**<br> |
| **댓글 숨김/복원**     | - 게시글의 댓글 영역 `div#focus_cmt.view_comment[tabindex]` 숨김 기능<br> |
| **방해 요소 숨김**     | - **메인/갤러리/검색** <br>- 차단 목록에 등록되어 있어도 **기능이 ON일 때만 적용**<br>- 메인 추천 프리셋: `div#dna_content.content.news_con`, `div.content.concept_con`, `div.content_box.dcmedia`, `div.content_box.new_gall`, `div.time_best`, `div.trend.vote` |                                                                            |

## 설치 방법

### 크롬 웹스토어 (추천)

[**Chrome Web Store에서 설치하기**](https://chromewebstore.google.com/detail/디시갤-차단기/fnfmdbldnhadkadklplhcjcojjiaopgg)

1. **‘Chrome에 추가’** 버튼 클릭
2. 주소창 우측 🛡️ 아이콘 → **설정** 버튼으로 차단 목록,지연 시간,댓글 숨김 토글 조정

> **Tip** : “하드” 모드를 강력하게 추천합니다!


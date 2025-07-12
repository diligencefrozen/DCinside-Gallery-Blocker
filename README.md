# 디시갤 차단기

[![Chrome Web Store](https://img.shields.io/chrome-web-store/v/gfibaeldbchmlopmcpdeklbfplcdgapf?label=Chrome%20Web%20Store)](https://chrome.google.com/webstore/detail/gfibaeldbchmlopmcpdeklbfplcdgapf)

> 디시인사이드에서 보고 싶지 않은 갤러리에 접속하면 **5 초 뒤** 자동으로 `www.dcinside.com` 메인 페이지로 리다이렉트해 주는 Chrome 확장 프로그램입니다.

## 설치
### 웹스토어 1-클릭
[Chrome Web Store에서 설치하기](https://chrome.google.com/webstore/detail/gfibaeldbchmlopmcpdeklbfplcdgapf)

### 수동 설치(개발자용)
1. Releases 탭에서 **`DCinside-Gallery-Blocker-main.zip`** 다운로드 후 압축 해제  
2. `chrome://extensions` → **개발자 모드 ON** → **‘압축해제된 확장 프로그램 로드’** → 폴더 선택  
3. 주소창 우측 ![icon](icons/32.png) 아이콘 클릭 → 팝업에서 차단 갤러리 관리

## 개발 빌드
```bash
git clone https://github.com/yourname/DCinside-Gallery-Blocker.git
cd DCinside-Gallery-Blocker-main
# 소스 수정 후
# 브라우저에서 chrome://extensions 열고 새로고침

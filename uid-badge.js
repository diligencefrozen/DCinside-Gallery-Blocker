// uid-badge.js
(() => {
  const BADGE = "dcb-uid-badge";
  const IP_BADGE = "dcb-ip-badge";

  // --- 통신사 IP 대역 정보 ---
  const ISP_PATTERNS = {
    SKT: [
      "211.235", "210.102", "223.32", "223.33", "223.34", "223.35", "223.36", "223.37",
      "223.38", "223.39", "223.40", "223.41", "223.42", "223.43", "223.44", "223.45",
      "223.46", "223.47", "223.48", "223.49", "223.50", "223.51", "223.52", "223.53",
      "223.54", "223.55", "223.56", "223.57", "223.58", "223.59", "223.60", "223.61",
      "223.62", "223.63", "211.234", "203.226", "61.43", "211.33"
    ],
    KT: [
      "118.235", "39.7", "110.70", "112.161", "114.200", "114.201", "114.202", "114.203",
      "114.204", "114.205", "121.130", "121.131", "121.132", "121.133", "175.223", "211.246",
      "175.210", "175.211", "175.212", "175.213", "175.214", "175.215", "175.216", "175.217",
      "175.218", "175.219", "211.230", "211.231", "211.232", "211.233", "211.234", "211.235",
      "211.236", "211.237", "211.238", "211.239"
    ],
    "LG(U+)": [
      "106.101", "101.235", "211.36", "117.111", "125.188", "106.102", "104.230", "104.231",
      "104.232", "104.233", "104.234", "104.235", "104.236", "104.237", "104.238", "104.239",
      "211.200", "211.201", "211.202", "211.203", "211.204", "211.205", "211.206", "211.207",
      "211.208", "211.209", "59.150", "59.151", "59.152", "59.153", "59.154", "59.155",
      "59.156", "59.157", "59.158", "59.159"
    ]
  };

  // IP에서 통신사 정보 추출 (간단함)
  function detectISP(ip) {
    if (!ip) return null;
    for (const [isp, prefixes] of Object.entries(ISP_PATTERNS)) {
      for (const prefix of prefixes) {
        if (ip.startsWith(prefix)) {
          return isp;
        }
      }
    }
    return null;
  }

  // --- state & helpers for ON/OFF ---
  let showEnabled = true;

  function removeAllBadges() {
    document.querySelectorAll("." + BADGE + ", ." + IP_BADGE).forEach((el) => el.remove());
  }

  // 간단한 스타일
  function ensureStyle() {
    if (document.getElementById(BADGE)) return;
    const st = document.createElement("style");
    st.id = BADGE;
    st.textContent = `
      .${BADGE}{
        margin-left:6px; font-size:12px; color:#98a2b3;
        background:rgba(152,162,179,.15); padding:2px 6px; border-radius:10px;
        vertical-align:middle;
      }
      .${IP_BADGE}{
        margin-left:6px; font-size:11px; color:#fff;
        padding:2px 6px; border-radius:10px;
        vertical-align:middle;
        font-weight:600;
      }
      .${IP_BADGE}.skt{
        background:rgba(237,28,36,.7);
      }
      .${IP_BADGE}.kt{
        background:rgba(255,102,0,.7);
      }
      .${IP_BADGE}.lg{
        background:rgba(204,0,0,.7);
      }
    `;
    (document.head || document.documentElement).appendChild(st);
  }

  const isIpLike = (s) =>
    /^\d{1,3}(?:\.\d{1,3}){1,3}$/.test(String(s || "").trim());

  // writer 블록에서 회원 UID 추출
  function extractUid(writer) {
    // 1) data-uid
    let uid = writer.getAttribute("data-uid") || "";
    if (uid && !isIpLike(uid)) return uid;

    // 2) 새로고침 데이터 블록(title/text에 (uid))
    let rf =
      writer.querySelector(".refresherUserData") ||
      writer.parentElement?.querySelector(".refresherUserData");
    if (rf) {
      uid = rf.getAttribute("title") || "";
      if (!uid) {
        const m = (rf.textContent || "").match(/\(([A-Za-z0-9._-]+)\)/);
        if (m) uid = m[1];
      }
      if (uid && !isIpLike(uid)) return uid;
    }

    // 3) 갤로그 링크에서 추출(onclick/href)
    const link =
      writer.parentElement?.querySelector(
        '.writer_nikcon,[onclick*="gallog.dcinside.com"],a[href*="gallog.dcinside.com"]'
      ) || writer.querySelector('a[href*="gallog.dcinside.com"]');

    if (link) {
      const src =
        link.getAttribute("onclick") || link.getAttribute("href") || "";
      // 예: https://gallog.dcinside.com/SomeUID
      let m = src.match(/gallog\.dcinside\.com\/([A-Za-z0-9._-]+)/);
      if (m && m[1] && !isIpLike(m[1])) return m[1];
      // 혹시 다른 형태가 있으면 괄호 안 UID 시도
      m = src.match(/\(([A-Za-z0-9._-]+)\)/);
      if (m && m[1] && !isIpLike(m[1])) return m[1];
    }

    return "";
  }

  // IP 주소 추출
  function extractIP(writer) {
    // 1) data-ip 속성 먼저 확인 (가장 정확)
    const ip = writer.getAttribute("data-ip");
    if (ip) return ip;
    
    // 2) IP는 괄호 안에 표시됨: (211.235.xxx.xxx)
    const ipText = writer.textContent || "";
    const match = ipText.match(/\((\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})\)/);
    return match ? match[1] : null;
  }

  function placeBadge(writer) {
    if (!showEnabled) return; // OFF면 표시 안 함

    const nick = writer.querySelector(".nickname");
    if (!nick) return;

    // 이미 있으면 중복 생성 방지
    if (writer.querySelector(`.${BADGE}, .${IP_BADGE}`)) return;

    // 회원 UID 체크
    const uid = extractUid(writer);
    if (uid) {
      // 회원 뱃지
      const span = document.createElement("span");
      span.className = BADGE;
      span.textContent = `(${uid})`;
      span.title = "등록 회원";
      nick.insertAdjacentElement("afterend", span);
    } else {
      // 비회원 IP 체크
      const ip = extractIP(writer);
      if (ip) {
        const isp = detectISP(ip);
        if (isp) {
          const span = document.createElement("span");
          span.className = IP_BADGE;
          
          // 통신사별 클래스 추가
          if (isp === "SKT") span.classList.add("skt");
          else if (isp === "KT") span.classList.add("kt");
          else if (isp === "LG(U+)") span.classList.add("lg");
          
          span.textContent = isp;
          span.title = `${isp} (${ip})`;
          nick.insertAdjacentElement("afterend", span);
        }
      }
    }
  }

  function scan() {
    if (!showEnabled) {
      removeAllBadges();
      return;
    }
    ensureStyle();
    // 모든 작성자 블록
    document.querySelectorAll(".gall_writer").forEach(placeBadge);
  }

  // --- storage: 초기 로드 & 변경 반영 ---
  try {
    if (chrome && chrome.storage && chrome.storage.sync) {
      chrome.storage.sync.get(
        { showUidBadge: true },
        ({ showUidBadge }) => {
          showEnabled = !!showUidBadge;
          if (!showEnabled) removeAllBadges();
          else scan();
        }
      );

      chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== "sync" || !changes.showUidBadge) return;
        showEnabled = !!changes.showUidBadge.newValue;
        if (!showEnabled) removeAllBadges();
        else scan();
      });
    }
  } catch (e) {
    // storage가 없으면 기본값(true)로 동작
  }

  // 초기 + 동적 로딩 대응(리스트 리프레셔/댓글 새로고침 등)
  let scheduled = false;
  const mo = new MutationObserver(() => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      scan();
    });
  });

  if (document.readyState === "loading") {
    document.addEventListener(
      "DOMContentLoaded",
      () => {
        scan();
        mo.observe(document.body, { childList: true, subtree: true });
      },
      { once: true }
    );
  } else {
    scan();
    mo.observe(document.body, { childList: true, subtree: true });
  }
})();

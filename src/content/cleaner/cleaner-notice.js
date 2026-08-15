/*****************************************************************
 * cleaner-notice.js — 운영자 AD/설문 딱지 숨김
 *****************************************************************/
(() => {
  const STYLE_ID = "dcb-notice-block-style";
  const BLOCKED_CLASS = "dcb-notice-blocked";
  const TARGET_BADGES = new Set(["AD", "설문"]);

  const DEFAULTS = {
    noticeBlockEnabled: true
  };

  let enabled = true;
  let observer = null;
  let scheduled = false;

  function normalizeText(value) {
    return String(value || "")
      .normalize("NFKC")
      .replace(/[\u200B-\u200D\uFEFF]/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function normalizeBadge(value) {
    const text = normalizeText(value).replace(/\s+/g, "");
    return /^[a-z]+$/i.test(text) ? text.toUpperCase() : text;
  }

  function firstToken(value) {
    const token = normalizeText(value).split(" ")[0] || "";
    return /^[a-z]+$/i.test(token) ? token.toUpperCase() : token;
  }

  function isTargetBadgeValue(value) {
    const exact = normalizeBadge(value);
    if (TARGET_BADGES.has(exact)) return true;

    const token = firstToken(value);
    return TARGET_BADGES.has(token);
  }

  function ensureStyle() {
    let style = document.getElementById(STYLE_ID);
    if (!style) {
      style = document.createElement("style");
      style.id = STYLE_ID;
      (document.head || document.documentElement).appendChild(style);
    }

    style.textContent = `
      .${BLOCKED_CLASS} { display: none !important; }
    `;
  }

  function clearStyle() {
    const style = document.getElementById(STYLE_ID);
    if (style) style.textContent = "";
  }

  function clearMarks() {
    document.querySelectorAll(`.${BLOCKED_CLASS}`).forEach((el) => {
      el.classList.remove(BLOCKED_CLASS);
    });
  }

  function getOwnText(el) {
    if (!el) return "";
    return Array.from(el.childNodes)
      .filter((node) => node.nodeType === Node.TEXT_NODE)
      .map((node) => node.textContent)
      .join(" ");
  }

  function subjectMatches(subject) {
    if (!subject) return false;

    const candidates = [
      getOwnText(subject),
      subject.querySelector("b")?.textContent,
      subject.textContent
    ];

    return candidates.some(isTargetBadgeValue);
  }

  function findListContainer(subject) {
    if (!subject) return null;

    return subject.closest(
      ".gall_list tr.ub-content, .gall_list tr[data-no], .gall_list tr.gall_tr, " +
      ".gall_list tr, tr.ub-content, tr[data-no], tr.gall_tr, " +
      ".gall_list li.ub-content, .gall_list li.gall_item, li.ub-content, li.gall_item, .gall_item"
    );
  }

  function rowHasOperatorWriter(row) {
    if (!row) return false;

    const writer = row.querySelector(
      ".gall_writer, .ub-writer, td.writer, .writer, [data-nick='운영자'], [data-uid='admin']"
    );

    const writerText = normalizeText(writer?.textContent || "");
    if (writerText.includes("운영자")) return true;

    // 일부 DCInside 특수 목록은 셀 클래스가 빠져도 첫 줄에 `... 운영자 날짜 ...` 형태로 렌더링된다.
    return /(?:^|\s)운영자(?:\s|$)/.test(normalizeText(row.textContent));
  }

  function rowHasNoticeBadge(row) {
    if (!row) return false;

    const cells = Array.from(row.children).filter((el) => el.nodeType === 1);

    const candidateCells = [
      ...row.querySelectorAll(".gall_num, .gall_subject, .gall_tit, .ub-word"),
      ...cells.slice(0, 3)
    ];

    return candidateCells.some((cell) => {
      const values = [
        getOwnText(cell),
        cell.querySelector("b")?.textContent,
        cell.firstElementChild?.textContent,
        cell.textContent
      ];

      return values.some(isTargetBadgeValue);
    });
  }

  function markBlocked(el) {
    if (!el || el.nodeType !== 1) return;
    el.classList.add(BLOCKED_CLASS);
  }

  function applyBlock() {
    scheduled = false;

    if (!enabled) {
      clearStyle();
      clearMarks();
      return;
    }

    ensureStyle();
    clearMarks();

    // 1) 최신/특수 DCInside 목록 구조 대응:
    //    - 일반/인물 갤러리: `번호` 칸에 설문/AD가 들어옴
    //    - 마이너/미니 갤러리: `말머리` 또는 제목 쪽에 들어오는 변형 존재
    //    - 운영자 작성 행만 숨겨서 일반 게시글 오탐을 줄임
    document.querySelectorAll(
      ".gall_list tbody tr, .gall_list tr, tr.ub-content, tr[data-no], tr.gall_tr"
    ).forEach((row) => {
      if (row.classList.contains(BLOCKED_CLASS)) return;
      if (!rowHasOperatorWriter(row)) return;
      if (!rowHasNoticeBadge(row)) return;
      markBlocked(row);
    });

    // 2) 기존 방식 유지: 말머리 칸만 명확히 잡히는 구형 구조/리스트형 구조 대응
    document.querySelectorAll("td.gall_subject, .gall_subject").forEach((subject) => {
      if (!subjectMatches(subject)) return;

      const container = findListContainer(subject);
      if (container && rowHasOperatorWriter(container)) markBlocked(container);
    });
  }

  function scheduleApply() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(applyBlock);
  }

  function startObserver() {
    if (observer) return;

    observer = new MutationObserver(() => scheduleApply());

    const observe = () => {
      if (document.body) {
        observer.observe(document.body, { childList: true, subtree: true });
      }
    };

    if (document.body) observe();
    else document.addEventListener("DOMContentLoaded", observe, { once: true });
  }

  function stopObserver() {
    if (observer) {
      observer.disconnect();
      observer = null;
    }
  }

  function loadAndApply() {
    chrome.storage.sync.get(DEFAULTS, ({ noticeBlockEnabled }) => {
      enabled = noticeBlockEnabled !== false;

      if (enabled) {
        ensureStyle();
        scheduleApply();
        startObserver();
      } else {
        stopObserver();
        clearStyle();
        clearMarks();
      }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", loadAndApply, { once: true });
  } else {
    loadAndApply();
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "sync" || !changes.noticeBlockEnabled) return;

    enabled = changes.noticeBlockEnabled.newValue !== false;

    if (enabled) {
      ensureStyle();
      scheduleApply();
      startObserver();
    } else {
      stopObserver();
      clearStyle();
      clearMarks();
    }
  });
})();

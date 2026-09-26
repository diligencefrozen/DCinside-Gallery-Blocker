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
  let unsubscribeDomBus = null;

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

  const ROW_SELECTOR = ".gall_list tbody tr, .gall_list tr, tr.ub-content, tr[data-no], tr.gall_tr";

  function evaluateRow(row) {
    if (!row || row.nodeType !== 1) return;
    const shouldBlock = enabled && rowHasOperatorWriter(row) && rowHasNoticeBadge(row);
    row.classList.toggle(BLOCKED_CLASS, shouldBlock);
  }

  function processRoot(root) {
    if (!enabled || !root) return;
    const element = root.nodeType === Node.ELEMENT_NODE ? root : root.parentElement;
    if (!element || element.closest?.("[data-dcb-owned]")) return;
    const rows = new Set();
    const row = element.matches?.(ROW_SELECTOR) ? element : element.closest?.(ROW_SELECTOR);
    if (row) rows.add(row);
    element.querySelectorAll?.(ROW_SELECTOR).forEach((candidate) => rows.add(candidate));
    element.querySelectorAll?.("td.gall_subject, .gall_subject").forEach((subject) => {
      const container = findListContainer(subject);
      if (container) rows.add(container);
    });
    rows.forEach(evaluateRow);
  }

  function applyBlock() {
    if (!enabled) {
      clearStyle();
      clearMarks();
      return;
    }
    ensureStyle();
    document.querySelectorAll(ROW_SELECTOR).forEach(evaluateRow);
  }

  function scheduleApply() {
    if (typeof requestAnimationFrame === "function") requestAnimationFrame(applyBlock);
    else setTimeout(applyBlock, 16);
  }

  function startObserver() {
    if (unsubscribeDomBus || !globalThis.DCBDomMutationBus) return;
    unsubscribeDomBus = globalThis.DCBDomMutationBus.subscribe(
      "cleaner-notice",
      (records) => {
        const roots = new Set();
        for (const record of records) {
          roots.add(record.target);
          if (record.type === "childList") record.addedNodes.forEach((node) => roots.add(node));
        }
        roots.forEach(processRoot);
      },
      { types: ["childList", "attributes"], attributes: ["data-nick", "data-uid", "data-no", "class"] }
    );
  }

  function stopObserver() {
    unsubscribeDomBus?.();
    unsubscribeDomBus = null;
  }

  async function loadAndApply() {
    const critical = globalThis.DCBCriticalFilter;
    let raw;
    if (critical?.ready) {
      await critical.ready;
      const snapshot = critical.getSnapshot?.();
      if (snapshot?.reason === "hot-ready") raw = snapshot.sync;
    }
    if (!raw) raw = await globalThis.DCBRuntimeSettingsCache.get(DEFAULTS);
    enabled = raw.noticeBlockEnabled !== false;

    if (enabled) {
      ensureStyle();
      scheduleApply();
      startObserver();
    } else {
      stopObserver();
      clearStyle();
      clearMarks();
    }
  }

  loadAndApply();

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

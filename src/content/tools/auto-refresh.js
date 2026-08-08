/*****************************************************************
 * auto-refresh.js - 자동 새로고침 기능
 * 기본값은 OFF. 사용자가 ON으로 바꾸면 지정한 주기마다 목록을 갱신한다.
 * UI는 기존 자동 새로고침 카운트다운 박스 디자인을 유지한다.
 *****************************************************************/
(() => {
  "use strict";

  let autoRefreshEnabled = false;
  let refreshInterval = 60;
  let remainingSeconds = 60;
  let countdownInterval = null;
  let refreshing = false;
  let pausedByPreview = false;
  let countdownElement = null;
  let lastHref = location.href;
  let lastStatus = "대기 중";

  const MIN_INTERVAL = 10;
  const MAX_INTERVAL = 600;
  const MAX_IMPORT_ROWS = 50;
  const COUNTDOWN_ID = "dcb-auto-refresh-countdown";
  const ANIMATION_ID = "dcb-countdown-animation";

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

  const clampInterval = (value) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return 60;
    return Math.max(MIN_INTERVAL, Math.min(MAX_INTERVAL, Math.round(parsed)));
  };

  const isListView = () => /\/board\/lists(?:\/|$)/.test(location.pathname) && !!new URLSearchParams(location.search).get("id");
  const isPreviewActive = () => pausedByPreview || !!window.isPreviewOpen;
  const shouldPause = () => !document.visibilityState || document.hidden || isPreviewActive() || !isListView();

  function ensureAnimation(){
    if (document.getElementById(ANIMATION_ID)) return;
    const style = document.createElement("style");
    style.id = ANIMATION_ID;
    style.textContent = `
      @keyframes pulse {
        0%, 100% { opacity: 1; transform: scale(1); }
        50% { opacity: 0.5; transform: scale(0.8); }
      }
      @keyframes dcbAutoRowAdded {
        0% { background: #fff3bd; }
        45% { background: #fffbe6; }
        100% { background: transparent; }
      }
      tr.dcb-auto-refresh-added { animation: dcbAutoRowAdded 7s ease-out; }
    `;
    document.head.appendChild(style);
  }

  function createCountdownUI(){
    if (countdownElement) return countdownElement;

    ensureAnimation();
    countdownElement = document.createElement("div");
    countdownElement.id = COUNTDOWN_ID;
    countdownElement.style.cssText = `
      position: fixed;
      bottom: 20px;
      right: 20px;
      background: rgba(13, 17, 23, 0.95);
      color: #fff;
      padding: 12px 16px;
      border-radius: 8px;
      border: 1px solid #4f7cff;
      box-shadow: 0 0 12px rgba(79, 124, 255, 0.3);
      font-family: 'Inter', sans-serif;
      font-size: 13px;
      z-index: 999999;
      display: none;
      min-width: 200px;
    `;
    document.body.appendChild(countdownElement);
    return countdownElement;
  }

  function timeLabel(seconds){
    const safe = Math.max(0, Number(seconds) || 0);
    const min = Math.floor(safe / 60);
    const sec = safe % 60;
    return min > 0 ? `${min}분 ${sec}초` : `${sec}초`;
  }

  function statusText(){
    if (!isListView()) return "목록 페이지에서만 작동";
    if (isPreviewActive()) return "미리보기 사용 중 일시중지";
    if (document.hidden) return "백그라운드 일시중지";
    return lastStatus;
  }

  function updateCountdown(){
    if (!countdownElement) return;
    const small = statusText();
    countdownElement.innerHTML = `
      <div style="display: flex; align-items: center; gap: 8px;">
        <div style="
          width: 8px;
          height: 8px;
          background: #4f7cff;
          border-radius: 50%;
          animation: pulse 2s infinite;
        "></div>
        <span>자동 새로고침: <strong>${refreshing ? "갱신 중" : timeLabel(remainingSeconds)}</strong></span>
      </div>
      <div style="margin-top:6px;color:#9ca3af;font-size:11px;line-height:1.35;">${small} · ${refreshInterval}초 주기</div>
    `;
  }

  function showCountdown(){
    createCountdownUI();
    if (countdownElement) {
      countdownElement.style.display = autoRefreshEnabled ? "block" : "none";
      updateCountdown();
    }
  }

  function hideCountdown(){
    if (countdownElement) countdownElement.style.display = "none";
  }

  function stopCountdown(){
    if (countdownInterval) clearInterval(countdownInterval);
    countdownInterval = null;
    hideCountdown();
  }

  function resetCountdown(){
    remainingSeconds = refreshInterval;
    updateCountdown();
  }

  function postNo(row){
    const raw = row?.querySelector?.("td.gall_num")?.textContent?.trim() || "";
    return /^\d+$/.test(raw) ? raw : "";
  }

  function isNoticeRow(row){
    const num = row?.querySelector?.("td.gall_num")?.textContent?.trim() || "";
    const subject = row?.querySelector?.("td.gall_subject, .gall_subject")?.textContent?.trim() || "";
    const title = row?.querySelector?.("td.gall_tit, .gall_tit")?.textContent?.trim() || "";
    return num === "공지" || subject === "공지" || row?.classList?.contains("notice") || !!row?.querySelector?.(".icon_notice,.sp-notice") || /^공지/.test(title);
  }

  function isNormalPost(row){
    return !!postNo(row) && !isNoticeRow(row);
  }

  function currentNumbers(){
    return new Set($$("tr.ub-content").map(postNo).filter(Boolean));
  }

  function insertAnchor(tbody){
    const rows = $$("tr.ub-content", tbody);
    const notices = rows.filter(isNoticeRow);
    if (notices.length) {
      const lastNotice = notices[notices.length - 1];
      const afterNotice = rows.slice(rows.indexOf(lastNotice) + 1).find(isNormalPost);
      return afterNotice || lastNotice.nextSibling;
    }
    return rows.find(isNormalPost) || null;
  }

  function cloneRow(row){
    const cloned = document.importNode(row, true);
    cloned.classList.add("dcb-auto-refresh-added");
    cloned.querySelectorAll("[id]").forEach((node) => {
      node.id = `${node.id}-dcb-refresh-${Date.now().toString(36)}`;
    });
    return cloned;
  }

  function mergeFreshRows(fetchedDoc){
    const liveBody = $(".gall_list tbody");
    const fetchedBody = $(".gall_list tbody", fetchedDoc);
    if (!liveBody || !fetchedBody) return { added: 0, message: "목록 테이블 없음" };

    const exists = currentNumbers();
    const freshRows = $$("tr.ub-content", fetchedBody)
      .filter((row) => isNormalPost(row) && !exists.has(postNo(row)))
      .slice(0, MAX_IMPORT_ROWS);

    if (!freshRows.length) return { added: 0, message: "새 글 없음" };

    const fragment = document.createDocumentFragment();
    const importedRows = freshRows.map(cloneRow);
    importedRows.forEach((row) => fragment.appendChild(row));
    liveBody.insertBefore(fragment, insertAnchor(liveBody));

    document.dispatchEvent(new CustomEvent("dcb-soft-refresh", {
      detail: { added: importedRows.length, rows: importedRows }
    }));

    return { added: importedRows.length, message: `새 글 ${importedRows.length}개 반영` };
  }

  function listUrl(){
    const url = new URL(location.href);
    url.searchParams.set("_dcb_auto_refresh", Date.now().toString(36));
    return url.href;
  }

  async function performAutoRefresh(){
    if (refreshing || !autoRefreshEnabled) return;
    if (shouldPause()) {
      resetCountdown();
      return;
    }

    refreshing = true;
    lastStatus = "자동 실행 중";
    updateCountdown();

    try {
      const response = await fetch(listUrl(), { credentials: "include", cache: "no-store" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const html = await response.text();
      const fetchedDoc = new DOMParser().parseFromString(html, "text/html");
      const result = mergeFreshRows(fetchedDoc);
      lastStatus = result.message;
    } catch (error) {
      lastStatus = `갱신 실패: ${error?.message || error}`;
    } finally {
      refreshing = false;
      resetCountdown();
    }
  }

  function startAutoRefresh(){
    stopCountdown();
    if (!autoRefreshEnabled) return;

    resetCountdown();
    showCountdown();

    countdownInterval = setInterval(() => {
      if (!autoRefreshEnabled) return;

      if (shouldPause()) {
        resetCountdown();
        showCountdown();
        return;
      }

      remainingSeconds -= 1;
      if (remainingSeconds <= 0) {
        performAutoRefresh();
      } else {
        updateCountdown();
      }
    }, 1000);
  }

  function applySettings(enabled, interval){
    autoRefreshEnabled = !!enabled;
    refreshInterval = clampInterval(interval);
    remainingSeconds = refreshInterval;
    lastStatus = autoRefreshEnabled ? "대기 중" : "OFF";

    if (autoRefreshEnabled) startAutoRefresh();
    else stopCountdown();
  }

  chrome.storage.sync.get({ autoRefreshEnabled: false, autoRefreshInterval: 60 }, ({ autoRefreshEnabled, autoRefreshInterval }) => {
    applySettings(autoRefreshEnabled, autoRefreshInterval);
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "sync") return;
    if (!changes.autoRefreshEnabled && !changes.autoRefreshInterval) return;
    applySettings(
      changes.autoRefreshEnabled ? changes.autoRefreshEnabled.newValue : autoRefreshEnabled,
      changes.autoRefreshInterval ? changes.autoRefreshInterval.newValue : refreshInterval
    );
  });

  document.addEventListener("dcb-preview-state", (event) => {
    pausedByPreview = !!event.detail?.open;
    if (autoRefreshEnabled) {
      resetCountdown();
      showCountdown();
    }
  });

  document.addEventListener("visibilitychange", () => {
    if (autoRefreshEnabled) {
      resetCountdown();
      showCountdown();
    }
  });

  function handleUrlChange(){
    if (lastHref === location.href) return;
    lastHref = location.href;
    if (autoRefreshEnabled) {
      lastStatus = "주소 변경 감지";
      startAutoRefresh();
    }
  }

  ["pushState", "replaceState"].forEach((name) => {
    const original = history[name];
    if (typeof original !== "function" || original.__dcbAutoRefreshPatched) return;
    history[name] = function(...args){
      const result = original.apply(this, args);
      setTimeout(handleUrlChange, 0);
      return result;
    };
    history[name].__dcbAutoRefreshPatched = true;
  });

  window.addEventListener("popstate", () => setTimeout(handleUrlChange, 0));
  window.addEventListener("beforeunload", stopCountdown);
})();

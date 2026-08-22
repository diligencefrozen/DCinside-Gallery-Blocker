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
  let consecutiveFailures = 0;

  const MIN_INTERVAL = 10;
  const MAX_INTERVAL = 600;
  const MAX_IMPORT_ROWS = 50;
  const REQUEST_TIMEOUT_MS = 12_000;
  const PERMIT_MESSAGE_TIMEOUT_MS = 3_000;
  const PERMIT_MAX_WAIT_MS = 30_000;
  const PERMIT_FRESHNESS_MS = 1_000;
  const FAILURE_LIMIT = 3;
  const THROTTLE_STATUSES = new Set([403, 429, 503]);
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
    if (!liveBody) throw new Error("현재 목록 테이블을 찾지 못했습니다.");
    if (!fetchedBody) {
      const error = new Error("목록 형식이 아닌 응답입니다.");
      error.code = "INVALID_LIST_RESPONSE";
      throw error;
    }

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
    url.searchParams.delete("_dcb_auto_refresh");
    return url.href;
  }

  function isExpectedListResponse(rawUrl, requestedUrl = listUrl()){
    try {
      const expected = new URL(requestedUrl);
      const actual = new URL(String(rawUrl || ""));
      return /^https?:$/.test(actual.protocol)
        && actual.hostname === expected.hostname
        && /\/board\/lists(?:\/|$)/.test(actual.pathname)
        && actual.searchParams.get("id") === expected.searchParams.get("id");
    } catch (_) {
      return false;
    }
  }

  function delayWhileActive(ms){
    const deadline = Date.now() + Math.max(0, ms);
    return new Promise((resolve) => {
      const check = () => {
        if (!autoRefreshEnabled || shouldPause()) {
          resolve(false);
          return;
        }
        const remaining = deadline - Date.now();
        if (remaining <= 0) {
          resolve(true);
          return;
        }
        setTimeout(check, Math.min(250, remaining));
      };
      check();
    });
  }

  async function requestAutoRefreshPermit(){
    const deadline = Date.now() + PERMIT_MAX_WAIT_MS;

    while (autoRefreshEnabled && !shouldPause() && Date.now() < deadline) {
      let timeoutId = null;
      try {
        const permit = await Promise.race([
          chrome.runtime.sendMessage({ type: "dcb.autoRefreshPermit" }),
          new Promise((_, reject) => {
            timeoutId = setTimeout(
              () => reject(new Error("새로고침 요청 조정 시간 초과")),
              PERMIT_MESSAGE_TIMEOUT_MS
            );
          })
        ]);
        if (timeoutId) {
          clearTimeout(timeoutId);
          timeoutId = null;
        }

        if (!permit?.ok) return false;
        if (permit.granted) {
          const grantAgeMs = Date.now() - Number(permit.grantedAt);
          if (grantAgeMs >= 0 && grantAgeMs <= PERMIT_FRESHNESS_MS) return true;
          continue;
        }

        const remainingBudget = deadline - Date.now();
        const retryAfterMs = Math.min(
          remainingBudget,
          Math.max(250, Number(permit.retryAfterMs) || 250)
        );
        if (retryAfterMs <= 0) return false;
        lastStatus = "다른 창의 새로고침과 간격 조정 중";
        updateCountdown();
        if (!await delayWhileActive(retryAfterMs)) return false;
      } catch (_) {
        return false;
      } finally {
        if (timeoutId) clearTimeout(timeoutId);
      }
    }

    return false;
  }

  async function performAutoRefresh(){
    if (refreshing || !autoRefreshEnabled) return;
    if (shouldPause()) {
      resetCountdown();
      return;
    }
    if (!$(".gall_list tbody")) {
      lastStatus = "목록 테이블을 찾지 못해 자동 중지";
      autoRefreshEnabled = false;
      console.warn(`[DCB] ${lastStatus}`);
      await chrome.storage.sync.set({ autoRefreshEnabled: false });
      stopCountdown();
      return;
    }

    refreshing = true;
    lastStatus = "자동 실행 중";
    updateCountdown();
    let timeoutId = null;

    try {
      const permitted = await requestAutoRefreshPermit();
      if (!permitted) {
        lastStatus = autoRefreshEnabled && !shouldPause()
          ? "다른 창에서 새로고침 중 · 다음 주기에 재시도"
          : "일시중지";
        return;
      }
      if (!autoRefreshEnabled || shouldPause()) {
        lastStatus = "일시중지";
        return;
      }

      const controller = new AbortController();
      timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
      const requestHref = location.href;
      const requestUrl = listUrl();
      const response = await fetch(requestUrl, {
        credentials: "include",
        cache: "no-store",
        signal: controller.signal
      });
      if (!response.ok) {
        const error = new Error(`HTTP ${response.status}`);
        error.status = response.status;
        throw error;
      }
      if (!isExpectedListResponse(response.url, requestUrl)) {
        const error = new Error("예상한 목록 주소가 아닌 응답입니다.");
        error.code = "INVALID_LIST_RESPONSE";
        throw error;
      }
      if (location.href !== requestHref || !autoRefreshEnabled || shouldPause()) {
        lastStatus = "주소 변경 감지 · 이전 응답 건너뜀";
        return;
      }
      const html = await response.text();
      if (location.href !== requestHref || !autoRefreshEnabled || shouldPause()) {
        lastStatus = "주소 변경 감지 · 이전 응답 건너뜀";
        return;
      }
      const fetchedDoc = new DOMParser().parseFromString(html, "text/html");
      const result = mergeFreshRows(fetchedDoc);
      consecutiveFailures = 0;
      lastStatus = result.message;
    } catch (error) {
      consecutiveFailures += 1;
      const throttled = THROTTLE_STATUSES.has(Number(error?.status));
      const invalidResponse = error?.code === "INVALID_LIST_RESPONSE";
      const timedOut = error?.name === "AbortError";
      const shouldStop = throttled || invalidResponse || consecutiveFailures >= FAILURE_LIMIT;

      if (shouldStop) {
        lastStatus = invalidResponse
          ? "목록이 아닌 응답 감지 · 안전을 위해 자동 중지"
          : (throttled
            ? `HTTP ${error.status} 감지 · 안전을 위해 자동 중지`
            : `${consecutiveFailures}회 연속 실패 · 안전을 위해 자동 중지`);
        autoRefreshEnabled = false;
        console.warn(`[DCB] ${lastStatus}`);
        await chrome.storage.sync.set({ autoRefreshEnabled: false });
      } else {
        lastStatus = timedOut
          ? `갱신 시간 초과 (${consecutiveFailures}/${FAILURE_LIMIT})`
          : `갱신 실패 (${consecutiveFailures}/${FAILURE_LIMIT}): ${error?.message || error}`;
      }
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
      refreshing = false;
      if (autoRefreshEnabled) resetCountdown();
      else stopCountdown();
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
    consecutiveFailures = 0;
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

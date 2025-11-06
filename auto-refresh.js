/*****************************************************************
auto-refresh.js - 자동 새로고침 기능
 *****************************************************************/
(() => {
  let autoRefreshEnabled = false;
  let refreshInterval = 60; // 기본 60초
  let timerId = null;
  let countdownInterval = null;
  let remainingSeconds = 0;
  
  // 카운트다운 표시 요소
  let countdownElement = null;

  /* ───── 카운트다운 UI 생성 ───── */
  const createCountdownUI = () => {
    if (countdownElement) return;
    
    countdownElement = document.createElement('div');
    countdownElement.id = 'dcb-auto-refresh-countdown';
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
      min-width: 180px;
    `;
    
    document.body.appendChild(countdownElement);
  };

  /* ───── 카운트다운 업데이트 ───── */
  const updateCountdown = () => {
    if (!countdownElement) return;
    
    const minutes = Math.floor(remainingSeconds / 60);
    const seconds = remainingSeconds % 60;
    const timeText = minutes > 0 
      ? `${minutes}분 ${seconds}초`
      : `${seconds}초`;
    
    countdownElement.innerHTML = `
      <div style="display: flex; align-items: center; gap: 8px;">
        <div style="
          width: 8px;
          height: 8px;
          background: #4f7cff;
          border-radius: 50%;
          animation: pulse 2s infinite;
        "></div>
        <span>자동 새로고침: <strong>${timeText}</strong></span>
      </div>
    `;
    
    // CSS 애니메이션 추가
    if (!document.getElementById('dcb-countdown-animation')) {
      const style = document.createElement('style');
      style.id = 'dcb-countdown-animation';
      style.textContent = `
        @keyframes pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(0.8); }
        }
      `;
      document.head.appendChild(style);
    }
  };

  /* ───── 카운트다운 시작 ───── */
  const startCountdown = () => {
    if (countdownInterval) {
      clearInterval(countdownInterval);
    }
    
    createCountdownUI();
    remainingSeconds = refreshInterval;
    
    if (countdownElement) {
      countdownElement.style.display = 'block';
      updateCountdown();
    }
    
    countdownInterval = setInterval(() => {
      remainingSeconds--;
      updateCountdown();
      
      if (remainingSeconds <= 0) {
        clearInterval(countdownInterval);
        countdownInterval = null;
      }
    }, 1000);
  };

  /* ───── 카운트다운 정지 ───── */
  const stopCountdown = () => {
    if (countdownInterval) {
      clearInterval(countdownInterval);
      countdownInterval = null;
    }
    
    if (countdownElement) {
      countdownElement.style.display = 'none';
    }
  };

  /* ───── 자동 새로고침 시작 ───── */
  const startAutoRefresh = () => {
    if (timerId) return; // 이미 실행 중
    
    console.log(`[DCB] 자동 새로고침 시작: ${refreshInterval}초 간격`);
    
    // 카운트다운 시작
    startCountdown();
    
    timerId = setInterval(() => {
      console.log('[DCB] 페이지 자동 새로고침 실행');
      window.location.reload();
    }, refreshInterval * 1000);
  };

  /* ───── 자동 새로고침 정지 ───── */
  const stopAutoRefresh = () => {
    if (timerId) {
      clearInterval(timerId);
      timerId = null;
      console.log('[DCB] 자동 새로고침 정지');
    }
    
    stopCountdown();
  };

  /* ───── 설정 적용 ───── */
  const apply = (enabled, interval) => {
    autoRefreshEnabled = enabled;
    refreshInterval = interval;
    
    if (enabled) {
      // 기존 타이머가 있으면 정지하고 새로 시작
      stopAutoRefresh();
      startAutoRefresh();
    } else {
      stopAutoRefresh();
    }
  };

  /* ───── 초기 설정 로드 ───── */
  chrome.storage.sync.get({ 
    autoRefreshEnabled: false, 
    autoRefreshInterval: 60 
  }, ({ autoRefreshEnabled, autoRefreshInterval }) => {
    apply(autoRefreshEnabled, autoRefreshInterval);
  });

  /* ───── 설정 변경 감지 ───── */
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'sync') return;
    
    let needUpdate = false;
    let newEnabled = autoRefreshEnabled;
    let newInterval = refreshInterval;
    
    if (changes.autoRefreshEnabled) {
      newEnabled = changes.autoRefreshEnabled.newValue;
      needUpdate = true;
    }
    
    if (changes.autoRefreshInterval) {
      newInterval = changes.autoRefreshInterval.newValue;
      needUpdate = true;
    }
    
    if (needUpdate) {
      apply(newEnabled, newInterval);
    }
  });

  /* ───── 페이지 언로드 시 정리 ───── */
  window.addEventListener('beforeunload', () => {
    stopAutoRefresh();
  });
})();

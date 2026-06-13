/* Popup/options membership UI for ExtensionPay MVP. */
(() => {
  "use strict";

  const card = document.getElementById("dcbMembershipCard");
  if (!card || !chrome?.runtime?.sendMessage) return;

  const titleEl = document.getElementById("dcbMembershipTitle");
  const subtitleEl = document.getElementById("dcbMembershipSubtitle");
  const badgeEl = document.getElementById("dcbMembershipBadge");
  const messageEl = document.getElementById("dcbMembershipMessage");
  const metaEl = document.getElementById("dcbMembershipMeta");
  const loginBtn = document.getElementById("dcbMembershipLoginBtn");
  const manageBtn = document.getElementById("dcbMembershipManageBtn");
  const refreshBtn = document.getElementById("dcbMembershipRefreshBtn");

  let loading = false;

  function sendMessage(message) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(message, (response) => {
        const err = chrome.runtime.lastError;
        if (err) {
          reject(new Error(err.message || String(err)));
          return;
        }
        resolve(response);
      });
    });
  }

  function formatDate(value) {
    if (!value) return "";

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";

    return date.toLocaleString("ko-KR", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit"
    });
  }

  function setBusy(isBusy) {
    loading = !!isBusy;
    [loginBtn, manageBtn, refreshBtn].forEach((button) => {
      if (!button) return;
      button.disabled = loading;
      button.style.opacity = loading ? "0.62" : "";
    });
  }

  function setText(el, text) {
    if (el) el.textContent = text || "";
  }

  function setHidden(el, hidden) {
    if (!el) return;
    el.classList.toggle("is-hidden", !!hidden);
  }

  function buildMeta(status) {
    const rows = [];

    if (status.email) rows.push(`계정: ${status.email}`);
    if (status.role === "admin") rows.push("권한: 관리자 무료 활성");
    if (status.role === "trial") rows.push("상태: 무료체험 활성");
    if (status.trialStartedAt) rows.push(`무료체험 시작: ${formatDate(status.trialStartedAt)}`);
    if (status.trialExpiresAt) rows.push(`무료체험 만료 예정: ${formatDate(status.trialExpiresAt)}`);
    if (status.trialDaysRemaining) rows.push(`무료체험 남은 기간: 약 ${status.trialDaysRemaining}일`);
    if (status.paidAt) rows.push(`결제 확인: ${formatDate(status.paidAt)}`);
    if (status.subscriptionStatus) rows.push(`구독 상태: ${status.subscriptionStatus}`);
    if (status.plan?.interval) {
      const amount = typeof status.plan.unitAmountCents === "number"
        ? `${(status.plan.unitAmountCents / 100).toFixed(2)} ${String(status.plan.currency || "").toUpperCase()}`
        : "";
      rows.push(`플랜: ${status.plan.nickname || status.plan.interval}${amount ? ` · ${amount}` : ""}`);
    }
    if (status.stale) rows.push(`캐시 기준 표시 · 마지막 확인: ${formatDate(status.checkedAt) || "알 수 없음"}`);
    if (!status.ok && status.message) rows.push(`확인 메시지: ${status.message}`);

    return rows.join("\n");
  }

  function render(status = {}) {
    const active = !!status.active;
    const error = status.ok === false && !active;
    const copy = status.copy || {};
    const meta = buildMeta(status);

    card.classList.toggle("is-paid", active);
    card.classList.toggle("is-error", error);

    setText(titleEl, copy.title || (active ? "🌟 Pro 멤버십 활성화 완료" : "🧩 멤버십 연동 준비 완료"));
    setText(
      subtitleEl,
      active
        ? (status.role === "trial" ? "이메일 등록이 완료되었습니다." : "멤버십 전용 환영 메시지가 활성화되었습니다.")
        : "결제 없이 무료체험 이메일 등록을 할 수 있습니다."
    );
    setText(
      badgeEl,
      active
        ? (status.role === "admin" ? "ADMIN" : (status.role === "trial" ? "TRIAL 활성" : "PRO 활성"))
        : (error ? "확인 필요" : "무료")
    );
    setText(
      messageEl,
      copy.message || (active
        ? "유료 멤버십이 확인되었습니다."
        : "향후 Pro 기능 출시 시 이 영역에서 멤버십 상태를 확인합니다.")
    );

    if (metaEl) {
      metaEl.textContent = meta;
      metaEl.classList.toggle("is-visible", !!meta);
    }

    if (loginBtn) loginBtn.textContent = "무료체험 시작하기";
    setHidden(loginBtn, active);
    // Trial-only MVP: do not expose payment/subscription management from popup/options yet.
    setHidden(manageBtn, true);
  }

  async function refreshMembership() {
    setBusy(true);
    try {
      const status = await sendMessage({ type: "DCB_MEMBERSHIP_GET" });
      render(status || { ok: false, active: false, message: "멤버십 상태 응답이 비어 있습니다." });
    } catch (error) {
      render({
        ok: false,
        active: false,
        role: "free",
        copy: {
          title: "🧩 멤버십 연동 대기 중",
          message: "background service worker가 멤버십 응답을 반환하지 않았습니다."
        },
        message: error?.message || String(error)
      });
    } finally {
      setBusy(false);
    }
  }

  async function openMembershipPage(type) {
    setBusy(true);
    try {
      const response = await sendMessage({ type: "DCB_MEMBERSHIP_OPEN_TRIAL" });

      if (!response?.ok) {
        render({
          ok: false,
          active: false,
          role: "free",
          copy: {
            title: "🧩 무료체험 페이지 열기 실패",
            message: "ExtensionPay 무료체험 연동 설정값을 확인해 주세요."
          },
          message: response?.message || "unknown error"
        });
      }
    } catch (error) {
      render({
        ok: false,
        active: false,
        role: "free",
        copy: {
          title: "🧩 무료체험 페이지 열기 실패",
          message: "ExtensionPay 연동 상태를 확인해 주세요."
        },
        message: error?.message || String(error)
      });
    } finally {
      setBusy(false);
    }
  }

  loginBtn?.addEventListener("click", () => openMembershipPage("trial"));
  // Payment/manage button intentionally disabled until paid features launch.
  manageBtn?.addEventListener("click", () => openMembershipPage("trial"));
  refreshBtn?.addEventListener("click", refreshMembership);

  window.addEventListener("focus", refreshMembership);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) refreshMembership();
  });

  refreshMembership();
})();

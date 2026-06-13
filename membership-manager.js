/*
 * ExtensionPay membership bridge.
 *
 * Current MVP behavior:
 * - No existing feature is locked.
 * - Popup/options show welcome messages for paid, admin, or active trial users.
 * - The main public action is free trial start, not payment.
 */
(() => {
  "use strict";

  const CONFIG = self.DCB_MEMBERSHIP_CONFIG || {};
  const EXTENSIONPAY_ID = CONFIG.extensionPayId || "dcinsidegalleryblocker";
  const CACHE_KEY = "dcbMembershipStatusCache";
  const TRIAL_DAYS = Number.isFinite(Number(CONFIG.trialDays)) ? Number(CONFIG.trialDays) : 30;

  let extpay = null;

  try {
    if (typeof ExtPay === "function") {
      extpay = ExtPay(EXTENSIONPAY_ID);
      extpay.startBackground();
    }
  } catch (error) {
    console.warn("[DCB] ExtensionPay initialization failed:", error);
  }

  function toIsoOrNull(value) {
    if (!value) return null;
    if (value instanceof Date) return value.toISOString();
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  }

  function normalizeEmail(email) {
    return String(email || "").trim().toLowerCase();
  }

  async function sha256Hex(text) {
    const data = new TextEncoder().encode(text);
    const hash = await crypto.subtle.digest("SHA-256", data);
    return Array.from(new Uint8Array(hash))
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
  }

  async function isAdminEmail(email) {
    const hashes = Array.isArray(CONFIG.adminEmailSha256) ? CONFIG.adminEmailSha256 : [];
    const clean = normalizeEmail(email);

    if (!clean || hashes.length === 0) return false;

    const emailHash = await sha256Hex(clean);
    return hashes.map(String).map((value) => value.toLowerCase()).includes(emailHash);
  }

  function publicPlan(plan) {
    if (!plan || typeof plan !== "object") return null;

    return {
      unitAmountCents: plan.unitAmountCents ?? null,
      currency: plan.currency || null,
      nickname: plan.nickname || null,
      interval: plan.interval || null,
      intervalCount: plan.intervalCount ?? null
    };
  }

  function getTrialInfo(trialStartedAt) {
    const startedIso = toIsoOrNull(trialStartedAt);
    if (!startedIso) {
      return { startedAt: null, expiresAt: null, active: false, daysRemaining: 0, expired: false };
    }

    const started = new Date(startedIso);
    const expires = new Date(started.getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000);
    const now = new Date();
    const active = now < expires;
    const daysRemaining = active
      ? Math.max(1, Math.ceil((expires.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)))
      : 0;

    return {
      startedAt: started.toISOString(),
      expiresAt: expires.toISOString(),
      active,
      daysRemaining,
      expired: !active
    };
  }

  async function readCachedStatus() {
    try {
      const { [CACHE_KEY]: cached = null } = await chrome.storage.local.get({ [CACHE_KEY]: null });
      return cached && typeof cached === "object" ? cached : null;
    } catch (_) {
      return null;
    }
  }

  async function writeCachedStatus(status) {
    try {
      await chrome.storage.local.set({ [CACHE_KEY]: status });
    } catch (_) {
      // Cache failure should not affect the extension itself.
    }
  }

  async function getDevOverride() {
    try {
      const { dcbMembershipDevOverride = "" } = await chrome.storage.local.get({ dcbMembershipDevOverride: "" });
      return String(dcbMembershipDevOverride || "").trim().toLowerCase();
    } catch (_) {
      return "";
    }
  }

  function copyFor(status) {
    if (status.role === "admin") {
      return {
        title: CONFIG.adminWelcomeTitle || CONFIG.paidWelcomeTitle,
        message: CONFIG.adminWelcomeMessage || CONFIG.paidWelcomeMessage
      };
    }

    if (status.role === "trial") {
      const base = CONFIG.trialWelcomeMessage || "무료체험이 활성화되었습니다.";
      const suffix = status.trialDaysRemaining
        ? ` 남은 기간: 약 ${status.trialDaysRemaining}일.`
        : "";
      return {
        title: CONFIG.trialWelcomeTitle || "🎁 무료체험 활성화 완료",
        message: `${base}${suffix}`
      };
    }

    if (status.role === "trial_expired") {
      return {
        title: CONFIG.trialExpiredTitle || CONFIG.freeNoticeTitle,
        message: CONFIG.trialExpiredMessage || CONFIG.freeNoticeMessage
      };
    }

    if (status.active) {
      return {
        title: CONFIG.paidWelcomeTitle,
        message: CONFIG.paidWelcomeMessage
      };
    }

    return {
      title: CONFIG.freeNoticeTitle,
      message: CONFIG.freeNoticeMessage
    };
  }

  function withCopy(status) {
    return {
      ...status,
      copy: copyFor(status)
    };
  }

  async function getMembershipStatus() {
    const now = new Date().toISOString();
    const devOverride = await getDevOverride();

    if (devOverride === "paid" || devOverride === "admin" || devOverride === "trial") {
      return withCopy({
        ok: true,
        active: true,
        paid: devOverride === "paid",
        role: devOverride === "admin" ? "admin" : devOverride,
        source: "local-dev-override",
        email: devOverride === "admin" ? "admin override" : null,
        paidAt: devOverride === "paid" ? now : null,
        checkedAt: now,
        plan: null,
        subscriptionStatus: devOverride === "paid" ? "active" : null,
        subscriptionCancelAt: null,
        trialStartedAt: devOverride === "trial" ? now : null,
        trialExpiresAt: devOverride === "trial" ? new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000).toISOString() : null,
        trialDaysRemaining: devOverride === "trial" ? TRIAL_DAYS : null
      });
    }

    if (!extpay) {
      const cached = await readCachedStatus();
      return withCopy({
        ...(cached || {}),
        ok: false,
        active: !!cached?.active,
        paid: !!cached?.paid,
        role: cached?.role || "free",
        source: cached ? "cache" : "unavailable",
        stale: !!cached,
        checkedAt: cached?.checkedAt || now,
        reason: "EXTPAY_NOT_INITIALIZED"
      });
    }

    try {
      const user = await extpay.getUser();
      const admin = await isAdminEmail(user.email);
      const trial = getTrialInfo(user.trialStartedAt);
      const active = !!user.paid || admin || trial.active;
      const role = admin
        ? "admin"
        : (user.paid ? "paid" : (trial.active ? "trial" : (trial.expired ? "trial_expired" : "free")));

      const status = withCopy({
        ok: true,
        active,
        paid: !!user.paid,
        role,
        source: "extensionpay",
        stale: false,
        email: user.email || null,
        paidAt: toIsoOrNull(user.paidAt),
        installedAt: toIsoOrNull(user.installedAt),
        trialStartedAt: trial.startedAt,
        trialExpiresAt: trial.expiresAt,
        trialDaysRemaining: trial.daysRemaining,
        trialDays: TRIAL_DAYS,
        plan: publicPlan(user.plan),
        subscriptionStatus: user.subscriptionStatus || null,
        subscriptionCancelAt: toIsoOrNull(user.subscriptionCancelAt),
        checkedAt: now
      });

      await writeCachedStatus(status);
      return status;
    } catch (error) {
      const cached = await readCachedStatus();

      return withCopy({
        ...(cached || {}),
        ok: false,
        active: !!cached?.active,
        paid: !!cached?.paid,
        role: cached?.role || "free",
        source: cached ? "cache" : "extensionpay-error",
        stale: !!cached,
        checkedAt: cached?.checkedAt || now,
        reason: "EXTPAY_REQUEST_FAILED",
        message: error?.message || String(error)
      });
    }
  }

  async function openPaymentPage(planNickname) {
    if (!extpay) throw new Error("ExtensionPay is not initialized.");
    await extpay.openPaymentPage(planNickname || undefined);
    return { ok: true };
  }

  async function openLoginPage() {
    if (!extpay) throw new Error("ExtensionPay is not initialized.");
    await extpay.openLoginPage();
    return { ok: true };
  }

  async function openTrialPage() {
    if (!extpay) throw new Error("ExtensionPay is not initialized.");
    const displayText = CONFIG.trialDisplayText || `${TRIAL_DAYS}-day`;
    await extpay.openTrialPage(displayText);
    return { ok: true };
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message || typeof message !== "object") return;

    if (message.type === "DCB_MEMBERSHIP_GET" || message.type === "DCB_MEMBERSHIP_REFRESH") {
      getMembershipStatus()
        .then(sendResponse)
        .catch((error) => sendResponse(withCopy({
          ok: false,
          active: false,
          paid: false,
          role: "free",
          source: "error",
          reason: "MEMBERSHIP_STATUS_FAILED",
          message: error?.message || String(error),
          checkedAt: new Date().toISOString()
        })));
      return true;
    }

    if (message.type === "DCB_MEMBERSHIP_OPEN_PAYMENT") {
      openPaymentPage(message.planNickname)
        .then(sendResponse)
        .catch((error) => sendResponse({ ok: false, message: error?.message || String(error) }));
      return true;
    }

    if (message.type === "DCB_MEMBERSHIP_OPEN_LOGIN") {
      openLoginPage()
        .then(sendResponse)
        .catch((error) => sendResponse({ ok: false, message: error?.message || String(error) }));
      return true;
    }

    if (message.type === "DCB_MEMBERSHIP_OPEN_TRIAL") {
      openTrialPage()
        .then(sendResponse)
        .catch((error) => sendResponse({ ok: false, message: error?.message || String(error) }));
      return true;
    }
  });

  self.DCBMembership = {
    getMembershipStatus,
    openPaymentPage,
    openLoginPage,
    openTrialPage
  };
})();

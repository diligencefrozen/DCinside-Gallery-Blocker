/*
 * ExtPay.js - minimal ExtensionPay-compatible bridge for DCinside Gallery Blocker.
 *
 * This local wrapper implements only the API surface used by this extension:
 *   - ExtPay(extensionId).startBackground()
 *   - ExtPay(extensionId).getUser()
 *   - ExtPay(extensionId).openPaymentPage([planNickname])
 *   - ExtPay(extensionId).openLoginPage()
 *   - ExtPay(extensionId).getPlans()
 *
 * It communicates with https://extensionpay.com and keeps ExtensionPay's API key
 * in chrome.storage.sync, matching ExtensionPay's public integration model.
 */
var ExtPay = (function () {
  "use strict";

  // Content-script bridge used on https://extensionpay.com/* after payment/trial actions.
  if (typeof window !== "undefined") {
    window.addEventListener("message", (event) => {
      if (event.origin !== "https://extensionpay.com") return;
      if (event.source !== window) return;

      if (event.data === "extpay-fetch-user" || event.data === "extpay-trial-start") {
        window.postMessage(`${event.data}-received`, "*");
        try {
          chrome.runtime.sendMessage(event.data);
        } catch (_) {}
      }
    }, false);
  }

  const HOST = "https://extensionpay.com";
  const ISO_DATE_RE = /^\d\d\d\d-\d\d-\d\dT/;

  function chromeCall(target, method, ...args) {
    return new Promise((resolve, reject) => {
      try {
        target[method](...args, (...callbackArgs) => {
          const err = chrome.runtime?.lastError;
          if (err) {
            reject(new Error(err.message || String(err)));
            return;
          }

          resolve(callbackArgs.length <= 1 ? callbackArgs[0] : callbackArgs);
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  async function storageGet(keys) {
    try {
      return await chromeCall(chrome.storage.sync, "get", keys);
    } catch (_) {
      return await chromeCall(chrome.storage.local, "get", keys);
    }
  }

  async function storageSet(values) {
    try {
      return await chromeCall(chrome.storage.sync, "set", values);
    } catch (_) {
      return await chromeCall(chrome.storage.local, "set", values);
    }
  }

  function parseUserDates(userData, installedAt) {
    const parsed = {};

    Object.entries(userData || {}).forEach(([key, value]) => {
      parsed[key] = typeof value === "string" && ISO_DATE_RE.test(value)
        ? new Date(value)
        : value;
    });

    parsed.paid = !!parsed.paid;
    parsed.paidAt = parsed.paidAt || null;
    parsed.email = parsed.email || null;
    parsed.trialStartedAt = parsed.trialStartedAt || null;
    parsed.installedAt = installedAt ? new Date(installedAt) : new Date();

    return parsed;
  }

  async function ensureInstalledAt() {
    const storage = await storageGet(["extensionpay_installed_at", "extensionpay_user"]);
    if (storage.extensionpay_installed_at) {
      return storage.extensionpay_installed_at;
    }

    const fromStoredUser = storage.extensionpay_user?.installedAt;
    const installedAt = fromStoredUser || new Date().toISOString();
    await storageSet({ extensionpay_installed_at: installedAt });
    return installedAt;
  }

  async function isDevelopmentInstall() {
    try {
      const manifest = chrome.runtime.getManifest();
      return !manifest.update_url;
    } catch (_) {
      return false;
    }
  }

  async function openPopup(url, width = 500, height = 700) {
    if (chrome.windows?.create) {
      let createInfo = { url, type: "popup", focused: true, width, height };

      try {
        const current = await chromeCall(chrome.windows, "getCurrent");
        if (current && typeof current.width === "number" && typeof current.left === "number") {
          createInfo.left = Math.round((current.width - width) * 0.5 + current.left);
        }
        if (current && typeof current.height === "number" && typeof current.top === "number") {
          createInfo.top = Math.round((current.height - height) * 0.5 + current.top);
        }
      } catch (_) {}

      try {
        await chromeCall(chrome.windows, "create", createInfo);
        return;
      } catch (_) {
        delete createInfo.focused;
        await chromeCall(chrome.windows, "create", createInfo);
        return;
      }
    }

    await chromeCall(chrome.tabs, "create", { url, active: true });
  }

  function ExtPay(extensionId) {
    if (!extensionId || extensionId === "YOUR_EXTENSIONPAY_EXTENSION_ID") {
      console.warn("[DCB] ExtensionPay extension id is not configured yet.");
    }

    const extensionUrl = `${HOST}/extension/${encodeURIComponent(extensionId)}`;

    async function createKey() {
      const body = {};
      if (await isDevelopmentInstall()) {
        body.development = true;
      }

      const response = await fetch(`${extensionUrl}/api/new-key`, {
        method: "POST",
        headers: {
          "Accept": "application/json",
          "Content-Type": "application/json"
        },
        body: JSON.stringify(body)
      });

      if (!response.ok) {
        throw new Error(`ExtensionPay key request failed: HTTP ${response.status}`);
      }

      const apiKey = await response.json();
      await storageSet({ extensionpay_api_key: apiKey });
      return apiKey;
    }

    async function getKey() {
      const storage = await storageGet(["extensionpay_api_key"]);
      return storage.extensionpay_api_key || null;
    }

    async function getOrCreateKey() {
      return (await getKey()) || createKey();
    }

    async function getUser() {
      const installedAt = await ensureInstalledAt();
      const apiKey = await getKey();

      if (!apiKey) {
        return {
          paid: false,
          paidAt: null,
          email: null,
          installedAt: new Date(installedAt),
          trialStartedAt: null,
          plan: null,
          subscriptionStatus: null,
          subscriptionCancelAt: null
        };
      }

      const response = await fetch(`${extensionUrl}/api/v2/user?api_key=${encodeURIComponent(apiKey)}`, {
        method: "GET",
        headers: { "Accept": "application/json" }
      });

      if (!response.ok) {
        throw new Error(`ExtensionPay user request failed: HTTP ${response.status}`);
      }

      const userData = await response.json();
      await storageSet({ extensionpay_user: userData });
      return parseUserDates(userData, installedAt);
    }

    async function getPlans() {
      const response = await fetch(`${extensionUrl}/api/v2/current-plans`, {
        method: "GET",
        headers: { "Accept": "application/json" }
      });

      if (!response.ok) {
        throw new Error(`ExtensionPay plans request failed: HTTP ${response.status}`);
      }

      return response.json();
    }

    async function openPaymentPage(planNickname) {
      const apiKey = await getOrCreateKey();
      const path = planNickname
        ? `/choose-plan/${encodeURIComponent(planNickname)}`
        : "/choose-plan";
      const url = `${extensionUrl}${path}?api_key=${encodeURIComponent(apiKey)}`;

      await chromeCall(chrome.tabs, "create", { url, active: true });
    }

    async function openLoginPage() {
      const apiKey = await getOrCreateKey();
      const url = `${extensionUrl}/reactivate?api_key=${encodeURIComponent(apiKey)}&back=choose-plan&v2`;
      await openPopup(url, 500, 800);
    }

    async function openTrialPage(period) {
      const apiKey = await getOrCreateKey();
      let url = `${extensionUrl}/trial?api_key=${encodeURIComponent(apiKey)}`;
      if (period) {
        url += `&period=${encodeURIComponent(period)}`;
      }
      await openPopup(url, 500, 700);
    }

    async function pollUserPaid() {
      for (let i = 0; i < 120; i += 1) {
        const user = await getUser();
        if (user.paidAt || user.paid) return user;
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
      return getUser();
    }

    function startBackground() {
      chrome.runtime.onMessage.addListener((message) => {
        if (message === "extpay-fetch-user") {
          pollUserPaid().catch((error) => console.warn("[DCB] ExtensionPay paid polling failed:", error));
        }

        if (message === "extpay-trial-start") {
          getUser().catch((error) => console.warn("[DCB] ExtensionPay trial refresh failed:", error));
        }
      });
    }

    return {
      getUser,
      getPlans,
      openPaymentPage,
      openLoginPage,
      openTrialPage,
      startBackground,
      onPaid: { addListener: () => {} },
      onTrialStarted: { addListener: () => {} }
    };
  }

  return ExtPay;
})();

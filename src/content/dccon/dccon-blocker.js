/*****************************************************************
 * dccon-blocker.js - 개별 디시콘/디시콘 그룹 선택 차단
 *****************************************************************/
(() => {
  if (globalThis.__dcbSelectiveDcconBlockerLoaded) return;
  globalThis.__dcbSelectiveDcconBlockerLoaded = true;

  const Store = globalThis.DCBDcconBlockStore;
  if (!Store || !globalThis.chrome?.storage?.local) return;

  const DCCON_SELECTOR = [
    "img.written_dccon",
    "video.written_dccon",
    ".written_dccon",
    ".dcbpv-dccon",
    ".comment_dccon",
    ".coment_dccon_img",
    "img[src*='dccon.php']",
    "video[src*='dccon.php']",
    "source[src*='dccon.php']",
    "img[srcset*='dccon.php']",
    "video[poster*='dccon.php']",
    "img[data-src*='dccon.php']",
    "video[data-src*='dccon.php']",
    "img[data-original*='dccon.php']",
    "img[data-gif*='dccon.php']",
    "video[data-mp4*='dccon.php']",
    "[reqpath*='dccon']",
    "[data-path*='dccon.php']",
    "[data-dccon*='dccon.php']",
    "[style*='dccon.php']",
    "img[conalt*='dccon.php']",
    "video[conalt*='dccon.php']"
  ].join(",");

  const CODE_ATTRIBUTES = [
    "src",
    "srcset",
    "poster",
    "data-src",
    "data-original",
    "data-gif",
    "data-mp4",
    "reqpath",
    "data-path",
    "data-code",
    "data-dccon",
    "conalt",
    "con_alt",
    "style",
    "alt",
    "title"
  ];

  const IDENTITY_CODE_ATTRIBUTES = [
    "src",
    "srcset",
    "poster",
    "data-src",
    "data-original",
    "data-gif",
    "data-mp4",
    "reqpath",
    "data-path",
    "data-code",
    "data-dccon",
    "conalt",
    "con_alt",
    "style"
  ];

  const NESTED_CODE_SELECTOR = [
    "img",
    "video",
    "source",
    "[reqpath]",
    "[data-src]",
    "[data-original]",
    "[data-gif]",
    "[data-mp4]",
    "[data-path]",
    "[data-code]",
    "[data-dccon]",
    "[conalt]",
    "[con_alt]"
  ].join(",");

  const COMMENT_ROW_SELECTORS = [
    "div.cmt_info[data-no]",
    "div.cmt_info[data-article-no]",
    "div.cmt_info.clear",
    ".cmt_info",
    "li.ub-content",
    "li[id^='comment_li_']",
    "li[id^='reply_']",
    ".cmt_item",
    ".reply_item",
    ".comment_item",
    ".comment_wrap li",
    ".cmt_list li",
    ".dccon_comment_box li",
    ".dcbpv-comment-item"
  ];
  const COMMENT_ROW_SELECTOR = COMMENT_ROW_SELECTORS.join(",");

  const HIDDEN_CLASS = "dcb-selective-dccon-hidden";
  const HIDDEN_ATTR = "data-dcb-selective-dccon-hidden";
  const HIDDEN_CODE_ATTR = "data-dcb-selective-dccon-code";
  const INITIAL_GUARD_ATTR = "data-dcb-selective-dccon-loading";
  const STYLE_ID = "dcb-selective-dccon-style";
  const TOAST_ID = "dcb-selective-dccon-toast";
  const CONTEXT_TTL = 15_000;
  const PACKAGE_TIMEOUT = 10_000;
  const INTEGRITY_SCAN_INTERVAL = 1_200;
  const HIDDEN_SELECTOR = `.${HIDDEN_CLASS},[${HIDDEN_ATTR}="true"]`;

  let currentState = Store.emptyState();
  let blockedCodes = new Set();
  let observer = null;
  let observerAttached = false;
  let observerReadyHandler = null;
  let integrityTimer = 0;
  let lastContextTarget = null;
  let lastContextCode = "";
  let lastContextAt = 0;
  let renderedStyleSignature = "";
  let renderedStyleText = "";
  const previousInlineDisplay = new WeakMap();

  function blockedCodeCss() {
    const rowSelector = `:is(${COMMENT_ROW_SELECTORS.join(",")})`;
    const parentSelector = ":is(video,picture,.written_dccon,.dcbpv-dccon,.comment_dccon,.coment_dccon_img,.dccon_area,.dccon_layer,.dccon_over_box)";

    return Array.from(blockedCodes)
      .sort()
      .map((code) => {
        const identitySelector = `:is(${IDENTITY_CODE_ATTRIBUTES
          .map((name) => `[${name}*="${code}"]`)
          .join(",")})`;

        return `
          ${identitySelector},
          ${parentSelector}:has(${identitySelector}),
          ${rowSelector}:has(${identitySelector}) {
            display: none !important;
            visibility: hidden !important;
            opacity: 0 !important;
            pointer-events: none !important;
            animation: none !important;
            transition: none !important;
            content-visibility: hidden !important;
          }
        `;
      })
      .join("\n");
  }

  function buildStyleText() {
    return `
      .${HIDDEN_CLASS},
      [${HIDDEN_ATTR}="true"] {
        display: none !important;
        visibility: hidden !important;
        opacity: 0 !important;
        pointer-events: none !important;
        animation: none !important;
        transition: none !important;
        content-visibility: hidden !important;
      }

      html[${INITIAL_GUARD_ATTR}="true"] :is(${DCCON_SELECTOR}),
      html[${INITIAL_GUARD_ATTR}="true"] :is(${COMMENT_ROW_SELECTOR}):has(:is(${DCCON_SELECTOR})) {
        visibility: hidden !important;
        opacity: 0 !important;
      }

      #${TOAST_ID} {
        position: fixed;
        right: 20px;
        bottom: 20px;
        z-index: 2147483647;
        display: flex;
        flex-direction: column;
        gap: 4px;
        max-width: 340px;
        padding: 12px 14px;
        border: 1px solid rgba(79, 124, 255, .55);
        border-radius: 12px;
        background: rgba(13, 17, 23, .96);
        color: #f8fafc;
        box-shadow: 0 14px 38px rgba(0, 0, 0, .34);
        font: 13px/1.45 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }

      #${TOAST_ID}[data-variant="error"] {
        border-color: rgba(248, 113, 113, .7);
      }

      #${TOAST_ID} strong { font-size: 14px; }
      #${TOAST_ID} span { color: #cbd5e1; }

      ${blockedCodeCss()}
    `;
  }

  function ensureStyle() {
    let style = document.getElementById(STYLE_ID);
    if (!style) {
      style = document.createElement("style");
      style.id = STYLE_ID;
      (document.head || document.documentElement).appendChild(style);
    }

    const signature = Array.from(blockedCodes).sort().join("|");
    if (!renderedStyleText || renderedStyleSignature !== signature) {
      renderedStyleSignature = signature;
      renderedStyleText = buildStyleText();
    }

    if (style.textContent !== renderedStyleText) style.textContent = renderedStyleText;
  }

  function setInitialGuard(active) {
    const root = document.documentElement;
    if (!root) return;
    if (active) root.setAttribute(INITIAL_GUARD_ATTR, "true");
    else root.removeAttribute(INITIAL_GUARD_ATTR);
  }

  function showToast(title, description = "", variant = "success", duration = 2600) {
    ensureStyle();
    document.getElementById(TOAST_ID)?.remove();

    const toast = document.createElement("div");
    const heading = document.createElement("strong");
    const body = document.createElement("span");

    toast.id = TOAST_ID;
    toast.dataset.variant = variant;
    toast.setAttribute("role", "status");
    heading.textContent = title;
    body.textContent = description;
    toast.append(heading);
    if (description) toast.append(body);
    (document.body || document.documentElement).appendChild(toast);

    if (duration > 0) {
      setTimeout(() => {
        if (toast.isConnected) toast.remove();
      }, duration);
    }
  }

  function mediaNode(node) {
    if (!(node instanceof Element)) return null;
    if (node.tagName === "SOURCE") return node.closest("video");
    return node;
  }

  function findDcconNode(target) {
    if (!(target instanceof Element)) return null;

    let node = target.matches?.(DCCON_SELECTOR)
      ? target
      : target.closest?.(DCCON_SELECTOR);

    if (!node) {
      const wrapper = target.closest?.(".comment_dccon,.coment_dccon_img,.dccon_area,.dccon_layer,.dccon_over_box,.dcbpv-comment-item");
      node = wrapper?.querySelector?.(DCCON_SELECTOR) || null;
    }

    return mediaNode(node);
  }

  function directCodeFromNode(node) {
    if (!(node instanceof Element)) return "";
    const values = [node.currentSrc, ...CODE_ATTRIBUTES.map((name) => node.getAttribute(name))];

    for (const value of values) {
      const code = Store.extractCode(value);
      if (code) return code;
    }

    return "";
  }

  function identityCodesFromNode(node) {
    const codes = new Set();
    if (!(node instanceof Element)) return codes;

    const collect = (candidate) => {
      const values = [
        candidate.currentSrc,
        ...IDENTITY_CODE_ATTRIBUTES.map((name) => candidate.getAttribute(name))
      ];
      values.forEach((value) => {
        const code = Store.extractCode(value);
        if (code) codes.add(code);
      });
    };

    collect(node);
    for (const child of node.querySelectorAll?.(NESTED_CODE_SELECTOR) || []) collect(child);
    return codes;
  }

  function codeFromNode(node) {
    if (!(node instanceof Element)) return "";

    const directCode = directCodeFromNode(node);
    if (directCode) return directCode;

    for (const child of node.querySelectorAll?.(NESTED_CODE_SELECTOR) || []) {
      const code = directCodeFromNode(child);
      if (code) return code;
    }

    return "";
  }

  function packageIdxFromNode(node) {
    if (!(node instanceof Element)) return "";
    const owner = node.closest?.("[package_idx],[data-package-idx],[data-package_idx]");
    const value = owner?.getAttribute("package_idx")
      || owner?.getAttribute("data-package-idx")
      || owner?.getAttribute("data-package_idx")
      || "";
    return /^\d+$/.test(value) ? value : "";
  }

  function friendlyNodeLabel(node) {
    if (!(node instanceof Element)) return "개별 디시콘";
    const values = [node.getAttribute("data-title"), node.getAttribute("alt"), node.getAttribute("title")];

    for (const value of values) {
      const label = String(value || "").normalize("NFKC").replace(/\s+/g, " ").trim();
      if (!label || /dccon\.php|[?&]no=/i.test(label)) continue;
      return label.slice(0, 120);
    }

    return "개별 디시콘";
  }

  function hideTargetFor(node) {
    const row = node?.closest?.(COMMENT_ROW_SELECTOR);
    return row || node;
  }

  function forceHidden(target, code = "") {
    if (!(target instanceof Element)) return;

    if (!previousInlineDisplay.has(target)) {
      previousInlineDisplay.set(target, {
        value: target.style.getPropertyValue("display"),
        priority: target.style.getPropertyPriority("display")
      });
    }

    if (!target.classList.contains(HIDDEN_CLASS)) target.classList.add(HIDDEN_CLASS);
    if (target.getAttribute(HIDDEN_ATTR) !== "true") target.setAttribute(HIDDEN_ATTR, "true");
    const normalizedCode = Store.extractCode(code);
    if (normalizedCode && target.getAttribute(HIDDEN_CODE_ATTR) !== normalizedCode) {
      target.setAttribute(HIDDEN_CODE_ATTR, normalizedCode);
    }
    if (target.style.getPropertyValue("display") !== "none"
      || target.style.getPropertyPriority("display") !== "important") {
      target.style.setProperty("display", "none", "important");
    }
  }

  function restoreTarget(target) {
    if (!(target instanceof Element)) return;

    target.classList.remove(HIDDEN_CLASS);
    target.removeAttribute(HIDDEN_ATTR);
    target.removeAttribute(HIDDEN_CODE_ATTR);

    const previous = previousInlineDisplay.get(target);
    if (!previous) return;

    if (previous.value) target.style.setProperty("display", previous.value, previous.priority);
    else target.style.removeProperty("display");
    previousInlineDisplay.delete(target);
  }

  function hideNode(node, code = codeFromNode(node)) {
    if (!node || !code || !blockedCodes.has(code)) return false;
    const target = hideTargetFor(node);
    if (!target) return false;

    forceHidden(target, code);
    return true;
  }

  function restoreHidden() {
    document.querySelectorAll(HIDDEN_SELECTOR).forEach(restoreTarget);
  }

  function scan(scope = document) {
    if (!blockedCodes.size || !scope?.querySelectorAll) return;

    if (scope instanceof Element && scope.matches?.(DCCON_SELECTOR)) {
      const node = mediaNode(scope);
      hideNode(node);
    }

    scope.querySelectorAll(DCCON_SELECTOR).forEach((candidate) => {
      hideNode(mediaNode(candidate));
    });
  }

  function liveIdentityCodes(target) {
    const codes = new Set();
    if (!(target instanceof Element)) return codes;

    const collect = (candidate) => {
      identityCodesFromNode(mediaNode(candidate)).forEach((code) => codes.add(code));
    };

    if (target.matches?.(DCCON_SELECTOR)) collect(target);
    for (const candidate of target.querySelectorAll?.(DCCON_SELECTOR) || []) collect(candidate);
    return codes;
  }

  function reconcileTarget(target) {
    if (!(target instanceof Element) || !target.matches?.(HIDDEN_SELECTOR)) return;

    const liveCodes = liveIdentityCodes(target);
    const liveBlockedCode = Array.from(liveCodes).find((code) => blockedCodes.has(code));
    if (liveBlockedCode) {
      forceHidden(target, liveBlockedCode);
      return;
    }

    const rememberedCode = Store.extractCode(target.getAttribute(HIDDEN_CODE_ATTR));
    if (rememberedCode && blockedCodes.has(rememberedCode) && !liveCodes.size) {
      // 지연 로더가 src/reqpath를 잠깐 비우거나 blob URL로 바꾸는 동안에도 숨김을 유지한다.
      forceHidden(target, rememberedCode);
      return;
    }

    restoreTarget(target);
  }

  function reconcileHidden(scope = document) {
    if (scope instanceof Element && scope.matches?.(HIDDEN_SELECTOR)) reconcileTarget(scope);
    scope?.querySelectorAll?.(HIDDEN_SELECTOR).forEach(reconcileTarget);
  }

  function processScope(scope) {
    if (!(scope instanceof Element) && scope !== document) return;

    if (scope instanceof Element) {
      reconcileTarget(scope.closest?.(HIDDEN_SELECTOR));
    }
    reconcileHidden(scope);
    scan(scope);
  }

  function mutationMayContainDccon(node) {
    if (!(node instanceof Element)) return false;
    if (node.matches?.(HIDDEN_SELECTOR) || node.closest?.(HIDDEN_SELECTOR)) return true;
    if (node.matches?.(DCCON_SELECTOR)) return true;
    return !!node.querySelector?.(DCCON_SELECTOR);
  }

  function attachObserver() {
    if (!observer || observerAttached) return observerAttached;
    const root = document.documentElement || document.body;
    if (!root) return false;

    observer.observe(root, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: [
        "src",
        "srcset",
        "poster",
        "class",
        "style",
        "data-src",
        "data-original",
        "data-gif",
        "data-mp4",
        "reqpath",
        "data-path",
        "data-code",
        "data-dccon",
        "conalt",
        "con_alt",
        "alt",
        "title",
        HIDDEN_ATTR,
        HIDDEN_CODE_ATTR
      ]
    });
    observerAttached = true;
    return true;
  }

  function startObserver() {
    if (observer || !blockedCodes.size) return;

    observer = new MutationObserver((mutations) => {
      if (!blockedCodes.size) return;

      const scopes = new Set();

      mutations.forEach((mutation) => {
        if (mutation.type === "childList") {
          mutation.addedNodes.forEach((node) => {
            if (mutationMayContainDccon(node)) scopes.add(node);
          });
          if (mutationMayContainDccon(mutation.target)) scopes.add(mutation.target);
          return;
        }

        if (mutation.type === "attributes" && mutationMayContainDccon(mutation.target)) {
          scopes.add(mutation.target);
        }
      });

      // MutationObserver 콜백 안에서 바로 적용해 다음 페인트 전에 숨긴다.
      scopes.forEach(processScope);
    });

    if (!attachObserver() && !observerReadyHandler) {
      observerReadyHandler = () => {
        observerReadyHandler = null;
        attachObserver();
        processScope(document);
      };
      document.addEventListener("DOMContentLoaded", observerReadyHandler, { once: true });
    }
  }

  function stopObserver() {
    observer?.disconnect();
    observer = null;
    observerAttached = false;
    if (observerReadyHandler) {
      document.removeEventListener("DOMContentLoaded", observerReadyHandler);
      observerReadyHandler = null;
    }
  }

  function startIntegrityScan() {
    if (integrityTimer || !blockedCodes.size) return;
    integrityTimer = setInterval(() => {
      if (!blockedCodes.size || document.visibilityState === "hidden") return;
      ensureStyle();
      reconcileHidden(document);
      scan(document);
    }, INTEGRITY_SCAN_INTERVAL);
  }

  function stopIntegrityScan() {
    if (!integrityTimer) return;
    clearInterval(integrityTimer);
    integrityTimer = 0;
  }

  function applyState(value) {
    currentState = Store.normalizeState(value);
    blockedCodes = Store.blockedCodeSet(currentState);
    ensureStyle();

    if (blockedCodes.size) {
      startObserver();
      startIntegrityScan();
      reconcileHidden(document);
      scan(document);
    } else {
      stopObserver();
      stopIntegrityScan();
      restoreHidden();
    }
    setInitialGuard(false);
  }

  function primeBlock(codes, node = null) {
    Store.uniqueCodes(codes).forEach((code) => blockedCodes.add(code));
    ensureStyle();
    startObserver();
    startIntegrityScan();
    if (node) hideNode(node);
    scan(document);
  }

  function cookieValue(name) {
    const escaped = String(name).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${escaped}=([^;]*)`));
    return match ? decodeURIComponent(match[1]) : "";
  }

  async function fetchPackage(code, packageIdx = "") {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), PACKAGE_TIMEOUT);
    const form = new URLSearchParams();
    const ciToken = cookieValue("ci_c");

    if (ciToken) form.set("ci_t", ciToken);
    if (/^\d+$/.test(packageIdx)) form.set("package_idx", packageIdx);
    else form.set("code", code);

    try {
      const response = await fetch(new URL("/dccon/package_detail", location.origin), {
        method: "POST",
        credentials: "include",
        cache: "no-store",
        headers: {
          "Accept": "application/json,text/plain,*/*",
          "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
          "X-Requested-With": "XMLHttpRequest"
        },
        body: form.toString(),
        signal: controller.signal
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const text = await response.text();
      if (!text || text === "error") throw new Error("디시콘 정보가 반환되지 않았습니다.");

      const payload = JSON.parse(text);
      const info = payload?.info && typeof payload.info === "object" ? payload.info : {};
      const detail = Array.isArray(payload?.detail) ? payload.detail : [];
      const paths = Store.uniqueCodes(detail.map((item) => item?.path));
      const resolvedPackageIdx = String(info.package_idx || packageIdx || "").trim();

      if (!/^\d+$/.test(resolvedPackageIdx) || !paths.length) {
        throw new Error("디시콘 그룹을 식별하지 못했습니다.");
      }

      const selected = detail.find((item) => Store.extractCode(item?.path) === code);

      return {
        packageIdx: resolvedPackageIdx,
        title: String(info.title || `디시콘 그룹 ${resolvedPackageIdx}`).trim().slice(0, 120),
        iconCount: Number.parseInt(info.icon_cnt, 10) || paths.length,
        paths,
        itemTitle: String(selected?.title || "개별 디시콘").trim().slice(0, 120)
      };
    } catch (error) {
      if (error?.name === "AbortError") {
        throw new Error("디시콘 그룹 조회 시간이 초과되었습니다.");
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  function freshContextTarget() {
    const fresh = lastContextTarget
      && document.documentElement.contains(lastContextTarget)
      && Date.now() - lastContextAt <= CONTEXT_TTL;

    if (!fresh) return null;
    const code = codeFromNode(lastContextTarget) || lastContextCode;
    return code ? { node: lastContextTarget, code } : null;
  }

  async function enrichItem(code, node) {
    try {
      const details = await fetchPackage(code, packageIdxFromNode(node));
      const latest = await Store.getState();
      if (!latest.items[code]) return;

      const next = await Store.addItem({
        ...latest.items[code],
        code,
        label: details.itemTitle,
        packageIdx: details.packageIdx,
        packageTitle: details.title
      });
      applyState(next);
    } catch (_) {
      // 메타데이터 보강 실패는 이미 완료된 개별 차단에 영향을 주지 않는다.
    }
  }

  async function blockIndividual(node, code) {
    primeBlock([code], node);

    let state;
    try {
      state = await Store.addItem({
        code,
        label: friendlyNodeLabel(node),
        packageIdx: packageIdxFromNode(node),
        blockedAt: Date.now()
      });
    } catch (error) {
      applyState(currentState);
      throw error;
    }

    applyState(state);
    showToast("개별 디시콘 차단 완료", "팝업이나 설정에서 언제든 해제할 수 있습니다.");
    void enrichItem(code, node);
    return { ok: true, mode: "item", code };
  }

  async function blockGroup(node, code) {
    showToast("디시콘 그룹 확인 중", "그룹에 포함된 디시콘 목록을 불러오고 있습니다.", "success", 0);
    const details = await fetchPackage(code, packageIdxFromNode(node));
    primeBlock(details.paths, node);

    let state;
    try {
      state = await Store.addGroup({
        packageIdx: details.packageIdx,
        title: details.title,
        paths: details.paths,
        iconCount: details.iconCount,
        blockedAt: Date.now()
      });
    } catch (error) {
      applyState(currentState);
      throw error;
    }

    applyState(state);
    showToast(
      "디시콘 그룹 차단 완료",
      `${details.title} · ${details.paths.length}개 디시콘`,
      "success",
      3200
    );
    return {
      ok: true,
      mode: "group",
      packageIdx: details.packageIdx,
      count: details.paths.length
    };
  }

  document.addEventListener("contextmenu", (event) => {
    const node = findDcconNode(event.target);
    const code = codeFromNode(node);

    lastContextTarget = code ? node : null;
    lastContextCode = code;
    lastContextAt = code ? Date.now() : 0;
  }, { capture: true });

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type !== "dcb.dcconBlockContext") return;

    const target = freshContextTarget();
    if (!target) {
      showToast("디시콘을 찾지 못했습니다", "차단할 디시콘 이미지나 영상을 다시 우클릭해 주세요.", "error");
      sendResponse?.({ ok: false, reason: "NO_TARGET" });
      return;
    }

    const operation = message.mode === "group"
      ? blockGroup(target.node, target.code)
      : blockIndividual(target.node, target.code);

    operation
      .then((result) => sendResponse?.(result))
      .catch((error) => {
        showToast("디시콘 차단 실패", error?.message || String(error), "error", 3600);
        sendResponse?.({
          ok: false,
          reason: "ERROR",
          message: error?.message || String(error)
        });
      });

    return true;
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || !changes[Store.STATE_KEY]) return;
    applyState(changes[Store.STATE_KEY].newValue || Store.emptyState());
  });

  ensureStyle();
  setInitialGuard(true);

  Store.getState()
    .then(applyState)
    .catch(() => applyState(Store.emptyState()));

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => processScope(document), { once: true });
  }
  window.addEventListener("load", () => processScope(document), { once: true });
  window.addEventListener("pageshow", () => processScope(document));
  window.addEventListener("focus", () => processScope(document));
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "hidden") processScope(document);
  });
})();

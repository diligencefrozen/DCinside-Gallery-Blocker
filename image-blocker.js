(() => {
  "use strict";

  const UI = "dcibx";
  const CONFIG_KEY = "dcbImageBlockConfig";
  const RECORD_KEY = "dcbImageBlockRecords";
  const BASE_CONFIG = Object.freeze({
    enabled: false,
    toolbar: false,
    blurAnonymous: false,
    blurSemi: false,
    blurNew: false,
    blurFixed: false,
    blurManager: false,
    normalPost: false,
    recommendedPost: false,
    skipSmall: false,
    minWidth: 160,
    minHeight: 160,
    tallImage: false,
    maxHeight: 1200,
    shortcuts: false,
    hideBlockedNotice: false
  });

  let config = { ...BASE_CONFIG };
  let records = {};
  let author = "anonymous";
  let ready = false;
  let observer = null;
  let pulse = null;
  let lastScan = 0;

  const fileCache = new WeakMap();
  const $ = (selector, base = document) => base.querySelector(selector);
  const $$ = (selector, base = document) => Array.from(base.querySelectorAll(selector));
  const cleanText = (value) => String(value ?? "").trim();

  const oneClickConfig = (value = {}) => {
    const enabled = value?.enabled === true;
    return {
      ...BASE_CONFIG,
      ...(value && typeof value === "object" ? value : {}),
      enabled,
      toolbar: enabled,
      blurAnonymous: enabled,
      blurSemi: enabled,
      blurNew: enabled,
      blurFixed: enabled,
      blurManager: enabled,
      normalPost: enabled,
      recommendedPost: enabled,
      skipSmall: false,
      tallImage: false,
      shortcuts: false,
      hideBlockedNotice: false,
      minWidth: BASE_CONFIG.minWidth,
      minHeight: BASE_CONFIG.minHeight,
      maxHeight: BASE_CONFIG.maxHeight
    };
  };

  const asRecordMap = (value) => {
    if (typeof value === "string") {
      try {
        const parsed = JSON.parse(value);
        return parsed && typeof parsed === "object" ? parsed : {};
      } catch (_) {
        return {};
      }
    }
    return value && typeof value === "object" ? value : {};
  };

  const storeLocal = (key, value) => chrome.storage.local.set({ [key]: value });

  async function loadStore() {
    const [syncData, localData] = await Promise.all([
      chrome.storage.sync.get({ [CONFIG_KEY]: null }),
      chrome.storage.local.get({ [CONFIG_KEY]: null, [RECORD_KEY]: {} })
    ]);
    config = oneClickConfig(localData[CONFIG_KEY] || syncData[CONFIG_KEY] || BASE_CONFIG);
    records = asRecordMap(localData[RECORD_KEY]);
    ready = true;
  }

  function installStyle() {
    if ($(`#${UI}-style`)) return;
    const style = document.createElement("style");
    style.id = `${UI}-style`;
    style.textContent = `
      .${UI}-frame{position:relative;display:inline-block;max-width:100%;vertical-align:top;isolation:isolate}
      .${UI}-frame img,.${UI}-frame video,.${UI}-frame iframe{max-width:100%}
      .${UI}-blur img,.${UI}-blur video,.${UI}-blur iframe{filter:blur(19px) saturate(.82);transition:filter .18s ease}
      .${UI}-blur:after{content:'클릭하면 바로 보여요';position:absolute;left:50%;top:50%;z-index:3;transform:translate(-50%,-50%);padding:8px 11px;border-radius:999px;background:rgba(15,23,42,.78);color:#fff;font:800 12px/1 system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;letter-spacing:-.01em;pointer-events:none;backdrop-filter:blur(10px)}
      .${UI}-actions{position:absolute;right:10px;top:10px;z-index:2147483000;display:flex;gap:6px;padding:5px;border:1px solid rgba(255,255,255,.14);border-radius:999px;background:rgba(8,13,23,.72);box-shadow:0 12px 30px rgba(0,0,0,.22);backdrop-filter:blur(14px);opacity:.88;transition:opacity .16s ease,transform .16s ease;transform:translateY(-2px)}
      .${UI}-frame:hover .${UI}-actions,.${UI}-actions:focus-within{opacity:1;transform:translateY(0)}
      .${UI}-actions button,.${UI}-modal button{appearance:none;border:0;border-radius:999px;background:#f8fafc;color:#111827;font:850 11px/1 system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;letter-spacing:-.01em;min-height:26px;padding:0 10px;cursor:pointer}
      .${UI}-actions button{background:#ff4d6d;color:#fff}
      .${UI}-notice{display:flex;align-items:center;gap:10px;cursor:pointer;margin:12px 0;padding:12px 13px;border:1px solid rgba(148,163,184,.26);border-radius:16px;background:#0f172a;color:#dbeafe;font:750 12px/1.4 system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif}
      .${UI}-notice img{width:46px;height:46px;object-fit:cover;border-radius:12px;background:#1f2937}
      .${UI}-notice strong{display:block;color:#fff;font-size:13px;margin-bottom:2px}
      .${UI}-notice button{margin-left:auto;white-space:nowrap}
      .${UI}-overlay{position:fixed;inset:0;z-index:2147483400;display:flex;align-items:center;justify-content:center;padding:20px;background:rgba(2,6,23,.62);backdrop-filter:blur(10px)}
      .${UI}-modal{width:min(780px,calc(100vw - 32px));max-height:min(720px,calc(100vh - 32px));display:flex;flex-direction:column;overflow:hidden;border:1px solid rgba(255,255,255,.12);border-radius:24px;background:#0b1120;color:#e5edf8;box-shadow:0 30px 90px rgba(0,0,0,.4);font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif}
      .${UI}-top{display:flex;align-items:flex-start;justify-content:space-between;gap:14px;padding:18px 20px;border-bottom:1px solid rgba(148,163,184,.16)}
      .${UI}-top small{display:block;color:#94a3b8;font-weight:850;font-size:11px;text-transform:uppercase;letter-spacing:.12em}
      .${UI}-top strong{display:block;color:#fff;font-size:18px;letter-spacing:-.03em;margin-top:3px}
      .${UI}-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:12px;padding:16px;overflow:auto;list-style:none;margin:0}
      .${UI}-card{min-width:0;border:1px solid rgba(148,163,184,.14);border-radius:18px;background:#111827;overflow:hidden}
      .${UI}-preview{display:block;width:100%;aspect-ratio:1/1;object-fit:cover;background:#1f2937}
      .${UI}-fallback{display:grid;place-items:center;color:#64748b;font-weight:900}
      .${UI}-info{display:flex;flex-direction:column;gap:8px;padding:10px}
      .${UI}-info span{color:#9ca3af;font-size:11px;word-break:break-all}
      .${UI}-info strong{color:#e5edf8;font-size:12px;line-height:1.3}
      .${UI}-info button{width:100%;min-height:30px;background:#ff4d6d;color:#fff}
      .${UI}-empty{padding:42px 20px;text-align:center;color:#94a3b8;font-weight:750}
    `;
    const host = document.head || document.documentElement;
    if (!host) {
      document.addEventListener("DOMContentLoaded", installStyle, { once: true });
      return;
    }
    host.appendChild(style);
  }

  function escapeHtml(value) {
    return cleanText(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
  }

  function detectAuthor() {
    const box = $(".gall_writer");
    if (!box) return "anonymous";
    const html = box.innerHTML || "";
    const uid = cleanText(box.getAttribute("data-uid"));
    const ip = cleanText(box.getAttribute("data-ip"));
    if (/sub_manager|manager/i.test(html)) return "manager";
    if (uid && /newnik/i.test(html)) return "new";
    if (uid && /fix_nik/i.test(html)) return "fixed";
    if (uid) return "semi";
    if (ip || $(".ip", box)) return "anonymous";
    return "anonymous";
  }

  function recommendedPage() {
    const params = new URLSearchParams(location.search);
    if (params.get("exception_mode") === "recommend") return true;
    return !!$(".gallview_head .icon_recomimg,.view_head .icon_recomimg,.titlebox .icon_recomimg");
  }

  function blurAllowed() {
    if (!config.enabled) return false;
    if (recommendedPage() ? !config.recommendedPost : !config.normalPost) return false;
    return !!{
      anonymous: config.blurAnonymous,
      semi: config.blurSemi,
      new: config.blurNew,
      fixed: config.blurFixed,
      manager: config.blurManager
    }[author];
  }

  function gatherMedia(base) {
    if (!base) return [];
    const selector = ".writing_view_box img,.writing_view_box video,.writing_view_box iframe,.write_div img,.write_div video,.write_div iframe";
    if (base.nodeType === 9 || base.nodeType === 11) return $$(selector, base);
    if (base.nodeType !== 1) return [];
    const self = base.matches?.(selector) ? [base] : [];
    return self.concat($$(selector, base));
  }

  function dccon(el) {
    if (!el || el.nodeType !== 1) return false;
    const src = el.currentSrc || el.src || el.getAttribute("data-src") || "";
    if (el.matches?.(".written_dccon,.dccon,.dccon_img")) return true;
    if (/\/dccon\.php(?:\?|$)/i.test(src)) return true;
    return !!el.closest?.(".comment_dccon,.coment_dccon_img,.dccon_over_box,.dccon_area,.dccon_layer,[reqpath='/dccon']");
  }

  function clearDccon(el) {
    const frame = el.closest?.(`.${UI}-frame`);
    if (!frame) return;
    frame.classList.remove(`${UI}-frame`, `${UI}-blur`);
    frame.style.display = "";
    $(`:scope > .${UI}-actions`, frame)?.remove();
    dropNotice(frame);
    delete frame.dataset.ibxKey;
    delete frame.dataset.ibxClick;
    delete frame.dataset.ibxPeek;
  }

  function mediaAllowed(el) {
    if (!el) return false;
    if (dccon(el)) {
      clearDccon(el);
      return false;
    }
    if (el.closest(`.${UI}-actions,.${UI}-overlay,.blocked-image-placeholder,.recommend_box,.btn_recommend_box,.vote_area,button`)) return false;
    if (el.tagName === "IFRAME" && !/movie|video|player|dcinside/i.test(el.src || "")) return false;
    return true;
  }

  function mediaUrl(el) {
    const src = el.currentSrc || el.src || el.getAttribute("data-src") || el.querySelector?.("source")?.src || "";
    try {
      return new URL(src, location.href).href;
    } catch (_) {
      return cleanText(src);
    }
  }

  function base64Bytes(base64) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }

  function bytesToUrl(bytes, mime) {
    let binary = "";
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
    return `data:${mime || "application/octet-stream"};base64,${btoa(binary)}`;
  }

  async function digestBytes(bytes) {
    const buffer = await crypto.subtle.digest("SHA-256", bytes);
    return Array.from(new Uint8Array(buffer)).map((n) => n.toString(16).padStart(2, "0")).join("");
  }

  const digestText = (value) => digestBytes(new TextEncoder().encode(value));

  function readBytes(url) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: "dcb.imageBytes", url }, (response) => {
        if (chrome.runtime.lastError || !response?.success || !response.data) {
          resolve(null);
          return;
        }
        resolve(response);
      });
    });
  }

  function fileType(mime, url) {
    const subtype = cleanText(mime).split("/")[1]?.split(";")[0];
    if (subtype) return subtype === "jpeg" ? "jpg" : subtype;
    try {
      const tail = new URL(url).pathname.split(".").pop();
      return tail && tail.length <= 5 ? tail : "bin";
    } catch (_) {
      return "bin";
    }
  }

  function preview(bytes, mime) {
    return new Promise((resolve) => {
      if (!bytes || !mime || (!mime.startsWith("image/") && !mime.startsWith("video/"))) {
        resolve(null);
        return;
      }
      const objectUrl = URL.createObjectURL(new Blob([bytes], { type: mime }));
      const media = mime.startsWith("video/") ? document.createElement("video") : new Image();
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        try {
          const width = media.videoWidth || media.naturalWidth || media.width || 0;
          const height = media.videoHeight || media.naturalHeight || media.height || 0;
          if (!width || !height) throw new Error("empty");
          const max = 96;
          const scale = Math.min(1, max / Math.max(width, height));
          const canvas = document.createElement("canvas");
          canvas.width = Math.max(1, Math.round(width * scale));
          canvas.height = Math.max(1, Math.round(height * scale));
          canvas.getContext("2d").drawImage(media, 0, 0, canvas.width, canvas.height);
          URL.revokeObjectURL(objectUrl);
          resolve(canvas.toDataURL("image/jpeg", 0.82));
        } catch (_) {
          URL.revokeObjectURL(objectUrl);
          resolve(null);
        }
      };
      media.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        resolve(null);
      };
      if (mime.startsWith("video/")) {
        media.muted = true;
        media.preload = "metadata";
        media.onloadeddata = () => {
          try { media.currentTime = Math.min(0.5, media.duration || 0.5); } catch (_) { finish(); }
        };
        media.onseeked = finish;
        setTimeout(finish, 1200);
      } else {
        media.onload = finish;
      }
      media.src = objectUrl;
    });
  }

  async function inspect(el, src) {
    const cached = fileCache.get(el);
    if (cached?.src === src) return cached.promise;
    const promise = (async () => {
      let bytes = null;
      let mime = "";
      if (/^https?:/i.test(src)) {
        const payload = await readBytes(src);
        if (payload) {
          bytes = base64Bytes(payload.data);
          mime = payload.contentType || "application/octet-stream";
        }
      }
      if (!bytes) {
        const quick = await digestText(src);
        return { key: `quick:${quick}`, src, mime: "", ext: "bin", dataUrl: "", thumb: "" };
      }
      const hash = await digestBytes(bytes);
      const thumb = await preview(bytes, mime);
      return { key: `file:${hash}`, src, mime, ext: fileType(mime, src), dataUrl: bytesToUrl(bytes, mime), thumb: thumb || "" };
    })();
    fileCache.set(el, { src, promise });
    return promise;
  }

  function frameFor(el) {
    const current = el.closest(`.${UI}-frame`);
    if (current) return current;
    const wrapper = el.closest(".imgwrap");
    if (wrapper) {
      wrapper.classList.add(`${UI}-frame`);
      return wrapper;
    }
    const frame = document.createElement("span");
    frame.className = `${UI}-frame`;
    el.parentNode.insertBefore(frame, el);
    frame.appendChild(el);
    return frame;
  }

  function dropNotice(frame) {
    const previous = frame.previousElementSibling;
    if (previous?.classList?.contains(`${UI}-notice`)) previous.remove();
  }

  function resetFrame(frame) {
    frame.classList.remove(`${UI}-blur`);
    frame.style.display = "";
    $(`:scope > .${UI}-actions`, frame)?.remove();
    dropNotice(frame);
  }

  const titleFor = (item) => typeof item === "string" ? item || "직접 차단한 이미지" : item?.memo || "직접 차단한 이미지";
  const thumbFor = (item) => item && typeof item === "object" ? item.thumbnail || item.thumb || "" : "";

  function familyKey(key, item = records[key]) {
    if (item && typeof item === "object") {
      if (item.fileKey) return `file:${item.fileKey}`;
      const thumb = item.thumbnail || item.thumb || "";
      if (thumb.startsWith("data:image/")) return `thumb:${thumb.slice(0, 220)}`;
      if (item.quickKey) return `quick:${item.quickKey}`;
      if (item.originalSrc) {
        try {
          const url = new URL(item.originalSrc, location.href);
          return `src:${url.origin}${url.pathname}`;
        } catch (_) {
          return `src:${item.originalSrc}`;
        }
      }
    }
    return key;
  }

  function relatedKeys(key) {
    const group = familyKey(key, records[key]);
    return Object.entries(records).filter(([entryKey, entry]) => entryKey === key || familyKey(entryKey, entry) === group).map(([entryKey]) => entryKey);
  }

  function deleteFamily(key) {
    relatedKeys(key).forEach((entryKey) => delete records[entryKey]);
  }

  function writeAliases(quickKey, info, item) {
    const fileKey = info.key?.startsWith("file:") ? info.key : item.fileKey || "";
    const next = {
      ...item,
      memo: item.memo || "직접 차단한 이미지",
      thumbnail: info.thumb || item.thumbnail || "",
      originalSrc: info.src || item.originalSrc || "",
      blockedAt: item.blockedAt || new Date().toISOString(),
      type: info.mime || item.type || "",
      fileKey,
      quickKey
    };
    records[quickKey] = next;
    if (info.key && info.key !== quickKey) records[info.key] = next;
    return next;
  }

  function revealNotice(frame, key) {
    frame.style.display = "none";
    dropNotice(frame);
    if (frame.dataset.ibxPeek === "1") return;
    const item = records[key] || {};
    const box = document.createElement("div");
    const thumb = thumbFor(item);
    box.className = `${UI}-notice`;
    box.innerHTML = `${thumb ? `<img src="${escapeHtml(thumb)}" alt="">` : ""}<span><strong>이미지를 가렸어요</strong><span>클릭하면 바로 볼 수 있어요</span></span><button type="button" data-act="peek">보기</button><button type="button" data-act="unblock">차단 해제</button>`;
    const reveal = () => {
      frame.dataset.ibxPeek = "1";
      box.remove();
      frame.style.display = "";
      frame.classList.remove(`${UI}-blur`);
    };
    box.addEventListener("click", (event) => {
      if (event.target.closest("[data-act='unblock']")) return;
      event.preventDefault();
      event.stopPropagation();
      reveal();
    }, true);
    $("[data-act='peek']", box).onclick = (event) => {
      event.preventDefault();
      event.stopPropagation();
      reveal();
    };
    $("[data-act='unblock']", box).onclick = async (event) => {
      event.preventDefault();
      event.stopPropagation();
      deleteFamily(key);
      await storeLocal(RECORD_KEY, records);
      delete frame.dataset.ibxPeek;
      box.remove();
      frame.style.display = "";
      scan(frame);
    };
    frame.parentNode.insertBefore(box, frame);
  }

  function makeRecord(el, info, quickKey = info.key) {
    return {
      memo: "직접 차단한 이미지",
      thumbnail: info.thumb || (el.tagName === "IMG" ? info.src : ""),
      originalSrc: info.src,
      blockedAt: new Date().toISOString(),
      type: info.mime || "",
      fileKey: info.key?.startsWith("file:") ? info.key : "",
      quickKey
    };
  }

  function drawActions(frame, el, info, infoPromise) {
    let actions = $(`:scope > .${UI}-actions`, frame);
    if (!config.enabled) {
      actions?.remove();
      return;
    }
    if (!actions) {
      actions = document.createElement("div");
      actions.className = `${UI}-actions`;
      frame.appendChild(actions);
    }
    actions.innerHTML = `<button type="button">차단</button>`;
    $("button", actions).onclick = (event) => {
      event.preventDefault();
      event.stopPropagation();
      const quickKey = info.key;
      const item = writeAliases(quickKey, info, makeRecord(el, info, quickKey));
      delete frame.dataset.ibxPeek;
      revealNotice(frame, quickKey);
      void storeLocal(RECORD_KEY, records);
      infoPromise?.then((full) => {
        if (!full?.key || full.key === quickKey) return;
        writeAliases(quickKey, full, { ...item, ...makeRecord(el, full, quickKey), blockedAt: item.blockedAt });
        if (frame.isConnected) frame.dataset.ibxKey = full.key;
        void storeLocal(RECORD_KEY, records);
      }).catch(() => {});
    };
  }

  async function prepare(el) {
    if (!ready || !mediaAllowed(el)) return;
    const src = mediaUrl(el);
    if (!src) return;
    if (!config.enabled) {
      const frame = el.closest(`.${UI}-frame`);
      if (frame) resetFrame(frame);
      return;
    }

    const frame = frameFor(el);
    author = detectAuthor();

    if (!frame.dataset.ibxClick) {
      frame.dataset.ibxClick = "1";
      frame.addEventListener("click", (event) => {
        if (!frame.classList.contains(`${UI}-blur`)) return;
        if (event.target.closest(`.${UI}-actions`)) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        frame.classList.remove(`${UI}-blur`);
        frame.dataset.ibxPeek = "1";
      }, true);
    }

    frame.classList.toggle(`${UI}-blur`, blurAllowed() && frame.dataset.ibxPeek !== "1");

    const quickKey = `quick:${await digestText(src)}`;
    const quickInfo = { key: quickKey, src, mime: "", ext: "bin", dataUrl: "", thumb: el.tagName === "IMG" ? src : "" };
    const fullInfo = inspect(el, src);
    frame.dataset.ibxKey = quickKey;

    if (records[quickKey] && frame.dataset.ibxPeek !== "1") {
      revealNotice(frame, quickKey);
      return;
    }

    dropNotice(frame);
    frame.style.display = "";
    drawActions(frame, el, quickInfo, fullInfo);

    let info = quickInfo;
    try {
      info = await fullInfo;
    } catch (_) {}
    if (!frame.isConnected) return;

    if (records[info.key] && frame.dataset.ibxPeek !== "1") {
      frame.dataset.ibxKey = info.key;
      revealNotice(frame, info.key);
      return;
    }

    if (records[quickKey]) {
      writeAliases(quickKey, info, { ...records[quickKey], upgradedFrom: quickKey });
      frame.dataset.ibxKey = info.key;
      if (frame.dataset.ibxPeek !== "1") revealNotice(frame, info.key);
      void storeLocal(RECORD_KEY, records);
      return;
    }

    frame.dataset.ibxKey = info.key;
    dropNotice(frame);
    frame.style.display = "";
    drawActions(frame, el, info, fullInfo);
    frame.classList.toggle(`${UI}-blur`, blurAllowed() && frame.dataset.ibxPeek !== "1");
  }

  function scan(base = document) {
    if (!ready) return;
    author = detectAuthor();
    gatherMedia(base).forEach((el) => void prepare(el));
  }

  function watch() {
    observer?.disconnect();
    observer = new MutationObserver((changes) => {
      const now = Date.now();
      if (now - lastScan < 80) return;
      lastScan = now;
      for (const item of changes) {
        if (item.type === "childList") item.addedNodes.forEach((node) => scan(node));
        if (item.type === "attributes") scan(item.target);
      }
    });
    observer.observe(document.documentElement || document, { childList: true, subtree: true, attributes: true, attributeFilter: ["src", "data-src", "class"] });
  }

  function warmup() {
    if (pulse) clearInterval(pulse);
    pulse = setInterval(() => {
      if (!ready || !config.enabled) return;
      scan(document);
    }, 2500);
  }

  function renderPanel(title, count, body) {
    $(`.${UI}-overlay`)?.remove();
    const overlay = document.createElement("div");
    overlay.className = `${UI}-overlay`;
    overlay.innerHTML = `<section class="${UI}-modal"><header class="${UI}-top"><span><small>이미지 차단</small><strong>${escapeHtml(title)} · ${escapeHtml(count)}</strong></span><button type="button">닫기</button></header>${body}</section>`;
    $("button", overlay).onclick = () => overlay.remove();
    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) overlay.remove();
    });
    document.body.appendChild(overlay);
  }

  const empty = (message) => `<div class="${UI}-empty">${escapeHtml(message)}</div>`;

  function openList() {
    const seen = new Set();
    const entries = Object.entries(records)
      .sort((a, b) => Date.parse(b[1]?.blockedAt || 0) - Date.parse(a[1]?.blockedAt || 0))
      .filter(([key, item]) => {
        const group = familyKey(key, item);
        if (seen.has(group)) return false;
        seen.add(group);
        return true;
      });
    if (!entries.length) {
      renderPanel("이미지 차단 목록", "0개", empty("차단한 이미지가 아직 없어요. 이미지 위의 차단 버튼을 누르면 이곳에서 해제할 수 있습니다."));
      return;
    }
    const list = entries.map(([key, item]) => {
      const thumb = thumbFor(item);
      const previewHtml = thumb ? `<img class="${UI}-preview" src="${escapeHtml(thumb)}" alt="">` : `<div class="${UI}-preview ${UI}-fallback">미리보기 없음</div>`;
      const sameFile = item?.fileKey ? "같은 이미지 파일이면 URL이 달라도 자동 차단됩니다" : "URL 기준으로 차단 중입니다";
      const linked = relatedKeys(key).length;
      const linkedText = linked > 1 ? ` · 연결 ${linked}개` : "";
      return `<li class="${UI}-card" data-key="${escapeHtml(key)}">${previewHtml}<div class="${UI}-info"><strong>${escapeHtml(titleFor(item))}</strong><span>${escapeHtml(sameFile + linkedText)}</span><button type="button" data-act="unblock">이 이미지 해제</button></div></li>`;
    }).join("");
    renderPanel("이미지 차단 목록", `${entries.length}개`, `<ul class="${UI}-grid">${list}</ul>`);
    $$(`.${UI}-card [data-act='unblock']`).forEach((button) => {
      button.onclick = async () => {
        const card = button.closest(`.${UI}-card`);
        deleteFamily(card.dataset.key);
        await storeLocal(RECORD_KEY, records);
        card.remove();
        const left = $$(`.${UI}-card`).length;
        const title = $(`.${UI}-top strong`);
        if (title) title.textContent = `이미지 차단 목록 · ${left}개`;
        if (!left) $(`.${UI}-grid`)?.insertAdjacentHTML("afterend", empty("차단 목록을 비웠어요."));
        scan(document);
      };
    });
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    const action = message?.action || message?.type || "";
    if (action !== "dcb.imageBlock.openList") return;
    (async () => {
      await loadStore();
      installStyle();
      openList();
      sendResponse({ ok: true, success: true });
    })().catch((error) => sendResponse({ ok: false, success: false, message: error?.message || String(error) }));
    return true;
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    const configChanged = (area === "sync" || area === "local") && changes[CONFIG_KEY];
    const recordsChanged = area === "local" && changes[RECORD_KEY];
    if (configChanged || recordsChanged) loadStore().then(() => scan(document));
  });

  async function boot() {
    await loadStore();
    installStyle();
    watch();
    warmup();
    scan(document);
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => scan(document), { once: true });
  }

  void boot();
})();

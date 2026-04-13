// user-memo.js
(() => {
  const STYLE_ID = "dcb-user-memo-style";
  const TRIGGER_CLASS = "dcb-user-memo-trigger";
  const MODAL_ID = "dcb-user-memo-modal";
  const DEFAULT_COLOR = "#999999";

  const SYNC_DEFAULTS = {
    userMemoEnabled: true
  };

  const LOCAL_DEFAULTS = {
    userMemos: {}
  };

  let enabled = true;
  let memoMap = {};
  let currentMeta = null;
  let observer = null;
  let renderQueued = false;

  function isIpLike(s) {
    return /^\d{1,3}(?:\.\d{1,3}){1,3}$/.test(String(s || "").trim());
  }

  function sanitizeText(v, max = 80) {
    return String(v || "").replace(/\s+/g, " ").trim().slice(0, max);
  }

  function isValidColor(v) {
    return /^#[0-9a-fA-F]{6}$/.test(String(v || ""));
  }

  function ensureStyle() {
    let st = document.getElementById(STYLE_ID);
    if (st) return st;

    st = document.createElement("style");
    st.id = STYLE_ID;
    st.textContent = `
      .${TRIGGER_CLASS}{
        appearance:none !important;
        -webkit-appearance:none !important;
        display:inline-flex !important;
        align-items:center !important;
        justify-content:center !important;
        margin-left:4px !important;
        padding:1px 6px !important;
        max-width:180px !important;
        border:1px solid rgba(120,130,150,.35) !important;
        border-radius:999px !important;
        background:rgba(120,130,150,.12) !important;
        color:#9aa4b2 !important;
        font-size:11px !important;
        font-weight:600 !important;
        line-height:1.2 !important;
        white-space:nowrap !important;
        overflow:hidden !important;
        text-overflow:ellipsis !important;
        vertical-align:middle !important;
        cursor:pointer !important;
        user-select:none !important;
        pointer-events:auto !important;
        position:static !important;
        z-index:auto !important;
      }

      .${TRIGGER_CLASS}.has-memo{
        font-weight:700 !important;
      }

      .${TRIGGER_CLASS}:hover{
        filter:brightness(1.05) !important;
      }

      .${TRIGGER_CLASS}:focus{
        outline:2px solid rgba(79,124,255,.35) !important;
        outline-offset:1px !important;
      }

      .dcb-user-memo-overlay{
        position:fixed !important;
        inset:0 !important;
        z-index:2147483646 !important;
        display:none !important;
        align-items:center !important;
        justify-content:center !important;
        background:rgba(0,0,0,.45) !important;
      }

      .dcb-user-memo-overlay.open{
        display:flex !important;
      }

      .dcb-user-memo-panel{
        width:min(420px, calc(100vw - 24px)) !important;
        background:#fff !important;
        color:#111827 !important;
        border-radius:14px !important;
        box-shadow:0 18px 40px rgba(0,0,0,.25) !important;
        padding:16px !important;
        font-family:system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif !important;
      }

      .dcb-user-memo-head{
        display:flex !important;
        align-items:center !important;
        justify-content:space-between !important;
        gap:12px !important;
        margin-bottom:10px !important;
      }

      .dcb-user-memo-title{
        font-size:16px !important;
        font-weight:700 !important;
      }

      .dcb-user-memo-close{
        border:0 !important;
        background:transparent !important;
        font-size:20px !important;
        line-height:1 !important;
        cursor:pointer !important;
        color:#6b7280 !important;
      }

      .dcb-user-memo-meta{
        margin-bottom:10px !important;
        color:#6b7280 !important;
        font-size:12px !important;
        line-height:1.45 !important;
        word-break:break-all !important;
      }

      .dcb-user-memo-field{
        display:flex !important;
        flex-direction:column !important;
        gap:8px !important;
        margin-bottom:12px !important;
      }

      .dcb-user-memo-field label{
        font-size:12px !important;
        font-weight:700 !important;
        color:#374151 !important;
      }

      .dcb-user-memo-textarea{
        width:100% !important;
        min-height:100px !important;
        resize:vertical !important;
        border:1px solid #d1d5db !important;
        border-radius:10px !important;
        padding:10px 12px !important;
        font-size:14px !important;
        line-height:1.45 !important;
        outline:none !important;
        box-sizing:border-box !important;
      }

      .dcb-user-memo-textarea:focus{
        border-color:#4f7cff !important;
        box-shadow:0 0 0 3px rgba(79,124,255,.14) !important;
      }

      .dcb-user-memo-row{
        display:flex !important;
        align-items:center !important;
        justify-content:space-between !important;
        gap:12px !important;
        margin-bottom:14px !important;
      }

      .dcb-user-memo-color{
        width:48px !important;
        height:32px !important;
        border:1px solid #d1d5db !important;
        border-radius:8px !important;
        background:transparent !important;
        padding:2px !important;
        cursor:pointer !important;
      }

      .dcb-user-memo-actions{
        display:flex !important;
        justify-content:flex-end !important;
        gap:8px !important;
      }

      .dcb-user-memo-btn{
        border:1px solid #d1d5db !important;
        border-radius:10px !important;
        padding:8px 12px !important;
        background:#fff !important;
        color:#111827 !important;
        font-size:13px !important;
        font-weight:600 !important;
        cursor:pointer !important;
      }

      .dcb-user-memo-btn.primary{
        border-color:#4f7cff !important;
        background:#4f7cff !important;
        color:#fff !important;
      }

      .dcb-user-memo-btn.danger{
        border-color:#ef4444 !important;
        color:#ef4444 !important;
      }
    `;
    (document.head || document.documentElement).appendChild(st);
    return st;
  }

  function removeInjectedUi() {
    document.querySelectorAll("." + TRIGGER_CLASS).forEach((el) => el.remove());
    const modal = document.getElementById(MODAL_ID);
    if (modal) modal.remove();
    const style = document.getElementById(STYLE_ID);
    if (style) style.remove();
  }

  function extractUid(writer) {
    let uid = writer.getAttribute("data-uid") || "";
    if (uid && !isIpLike(uid)) return uid;

    const link =
      writer.querySelector('.writer_nikcon,[onclick*="gallog.dcinside.com"],a[href*="gallog.dcinside.com"]') ||
      writer.parentElement?.querySelector('.writer_nikcon,[onclick*="gallog.dcinside.com"],a[href*="gallog.dcinside.com"]');

    if (link) {
      const src = link.getAttribute("onclick") || link.getAttribute("href") || "";
      let m = src.match(/gallog\.dcinside\.com\/([A-Za-z0-9._-]+)/);
      if (m && m[1] && !isIpLike(m[1])) return m[1];

      m = src.match(/\(([A-Za-z0-9._-]+)\)/);
      if (m && m[1] && !isIpLike(m[1])) return m[1];
    }

    return "";
  }

  function extractIp(writer) {
    let ip = writer.getAttribute("data-ip") || "";
    if (ip && isIpLike(ip)) return ip;

    const text = (writer.textContent || "").trim();
    const m = text.match(/(\d{1,3}(?:\.\d{1,3}){1,3})/);
    return m ? m[1] : "";
  }

  function extractNickname(writer) {
    const nickEl = writer.querySelector(':scope > .nickname em') || writer.querySelector(".nickname em");
    const fallback = writer.querySelector(':scope > .nickname') || writer.querySelector(".nickname");
    const txt = nickEl ? nickEl.textContent : (fallback ? fallback.textContent : "");
    return sanitizeText(txt, 60) || "알 수 없음";
  }

function isMiniGalleryPage() {
  return /^\/mini\/(?:board\/lists|board\/view)(?:\/|$)/.test(location.pathname);
}

function isMiniMemoTarget(writer) {
  const uid = extractUid(writer);
  if (uid) return true;

  const ip = extractIp(writer);
  if (ip) return true;

  return false;
}

function getWriterMeta(writer) {
  const uid = extractUid(writer);
  const ip = uid ? "" : extractIp(writer);
  const nickname = extractNickname(writer);

  if (isMiniGalleryPage() && !isMiniMemoTarget(writer)) {
    return null;
  }

  let key = "";
  if (uid) key = `uid:${uid}`;
  else if (ip) key = `ip:${ip}`;
  else if (!isMiniGalleryPage() && nickname) key = `nick:${nickname}`;

  if (!key) return null;
  return { key, uid, ip, nickname };
}

  function ensureModal() {
    let root = document.getElementById(MODAL_ID);
    if (root) return root;

    root = document.createElement("div");
    root.id = MODAL_ID;
    root.className = "dcb-user-memo-overlay";
    root.innerHTML = `
      <div class="dcb-user-memo-panel" role="dialog" aria-modal="true">
        <div class="dcb-user-memo-head">
          <div class="dcb-user-memo-title" data-role="title">이용자 메모</div>
          <button type="button" class="dcb-user-memo-close" data-act="close">×</button>
        </div>

        <div class="dcb-user-memo-meta" data-role="meta"></div>

        <div class="dcb-user-memo-field">
          <label for="dcb-user-memo-textarea">메모</label>
          <textarea
            id="dcb-user-memo-textarea"
            class="dcb-user-memo-textarea"
            data-role="memo"
            maxlength="80"
            placeholder="예: -멍청이- / 자주 보이는 유저 / 분탕 의심"
          ></textarea>
        </div>

        <div class="dcb-user-memo-row">
          <label for="dcb-user-memo-color">배지 색상</label>
          <input
            id="dcb-user-memo-color"
            class="dcb-user-memo-color"
            data-role="color"
            type="color"
            value="${DEFAULT_COLOR}"
          />
        </div>

        <div class="dcb-user-memo-actions">
          <button type="button" class="dcb-user-memo-btn danger" data-act="delete">삭제</button>
          <button type="button" class="dcb-user-memo-btn" data-act="close">닫기</button>
          <button type="button" class="dcb-user-memo-btn primary" data-act="save">저장</button>
        </div>
      </div>
    `;

    root.addEventListener("pointerdown", (e) => {
      e.stopPropagation();
    }, true);

    root.addEventListener("click", (e) => {
      if (e.target === root) closeModal();
    });

    root.querySelectorAll('[data-act="close"]').forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        closeModal();
      });
    });

    root.querySelector('[data-act="save"]').addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      saveCurrentMemo();
    });

    root.querySelector('[data-act="delete"]').addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      deleteCurrentMemo();
    });

    document.body.appendChild(root);
    return root;
  }

  function modalEls() {
    const root = document.getElementById(MODAL_ID);
    if (!root) return null;
    return {
      root,
      title: root.querySelector('[data-role="title"]'),
      meta: root.querySelector('[data-role="meta"]'),
      memo: root.querySelector('[data-role="memo"]'),
      color: root.querySelector('[data-role="color"]')
    };
  }

  function openModal(meta) {
    currentMeta = meta;
    ensureStyle();
    ensureModal();

    const els = modalEls();
    const saved = memoMap[meta.key] || {};

    els.title.textContent = `${meta.nickname} 메모`;
    els.meta.textContent = [
      meta.nickname ? `닉네임: ${meta.nickname}` : "",
      meta.uid ? `아이디: ${meta.uid}` : "",
      meta.ip ? `IP: ${meta.ip}` : "",
      `저장키: ${meta.key}`
    ].filter(Boolean).join(" · ");

    els.memo.value = saved.memo || "";
    els.color.value = isValidColor(saved.color) ? saved.color : DEFAULT_COLOR;

    els.root.classList.add("open");

    requestAnimationFrame(() => {
      els.memo.focus();
      els.memo.setSelectionRange(els.memo.value.length, els.memo.value.length);
    });
  }

  function closeModal() {
    const root = document.getElementById(MODAL_ID);
    if (root) root.classList.remove("open");
    currentMeta = null;
  }

  function saveCurrentMemo() {
    if (!currentMeta) return;
    const els = modalEls();
    const memo = sanitizeText(els.memo.value, 80);
    const color = isValidColor(els.color.value) ? els.color.value : DEFAULT_COLOR;

    chrome.storage.local.get(LOCAL_DEFAULTS, ({ userMemos }) => {
      const next = { ...(userMemos || {}) };

      if (!memo) {
        delete next[currentMeta.key];
      } else {
        next[currentMeta.key] = {
          memo,
          color,
          nickname: currentMeta.nickname || "",
          uid: currentMeta.uid || "",
          ip: currentMeta.ip || "",
          updatedAt: Date.now()
        };
      }

      chrome.storage.local.set({ userMemos: next }, () => {
        memoMap = next;
        renderAll();
        closeModal();
      });
    });
  }

  function deleteCurrentMemo() {
    if (!currentMeta) return;

    chrome.storage.local.get(LOCAL_DEFAULTS, ({ userMemos }) => {
      const next = { ...(userMemos || {}) };
      delete next[currentMeta.key];

      chrome.storage.local.set({ userMemos: next }, () => {
        memoMap = next;
        renderAll();
        closeModal();
      });
    });
  }

  function createTrigger(meta) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = TRIGGER_CLASS;
    btn.dataset.memoKey = meta.key;
    btn.dataset.memoUid = meta.uid || "";
    btn.dataset.memoIp = meta.ip || "";
    btn.dataset.memoNickname = meta.nickname || "";

    btn.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      e.stopPropagation();
      openModal(meta);
    }, true);

    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
    }, true);

    return btn;
  }

  function updateTrigger(btn, meta) {
    btn.dataset.memoKey = meta.key;
    btn.dataset.memoUid = meta.uid || "";
    btn.dataset.memoIp = meta.ip || "";
    btn.dataset.memoNickname = meta.nickname || "";

    const saved = memoMap[meta.key];

    btn.classList.toggle("has-memo", !!saved);

    if (saved && saved.memo) {
      btn.textContent = saved.memo;
      btn.title = saved.memo;
      btn.style.color = saved.color || DEFAULT_COLOR;
      btn.style.borderColor = `${saved.color || DEFAULT_COLOR}55`;
      btn.style.background = `${saved.color || DEFAULT_COLOR}18`;
    } else {
      btn.textContent = "메모";
      btn.title = "이용자 메모 작성";
      btn.style.color = "";
      btn.style.borderColor = "";
      btn.style.background = "";
    }
  }

  function placeTrigger(writer, btn) {
    const nikcon = writer.querySelector(':scope > .writer_nikcon');
    const nick = writer.querySelector(':scope > .nickname');

    if (nikcon) {
      if (btn.nextSibling !== nikcon) {
        writer.insertBefore(btn, nikcon);
      }
      return;
    }

    if (nick) {
      if (nick.nextSibling !== btn) {
        if (nick.nextSibling) writer.insertBefore(btn, nick.nextSibling);
        else writer.appendChild(btn);
      }
      return;
    }

    if (!btn.parentElement) writer.appendChild(btn);
  }

  function renderWriter(writer) {
    if (!(writer instanceof Element)) return;

    const oldBtn = writer.querySelector(':scope > .' + TRIGGER_CLASS);

    if (!enabled) {
      if (oldBtn) oldBtn.remove();
      return;
    }

    const meta = getWriterMeta(writer);
    if (!meta) {
      if (oldBtn) oldBtn.remove();
      return;
    }

    const btn = oldBtn || createTrigger(meta);
    updateTrigger(btn, meta);
    placeTrigger(writer, btn);
  }

  function renderAll() {
    if (!enabled) {
      removeInjectedUi();
      return;
    }

    ensureStyle();
    ensureModal();
    document.querySelectorAll(".gall_writer").forEach(renderWriter);
  }

  function queueRender() {
    if (renderQueued) return;
    renderQueued = true;
    requestAnimationFrame(() => {
      renderQueued = false;
      renderAll();
    });
  }

  function isOurNode(node) {
    return !!(
      node &&
      node.nodeType === 1 &&
      (
        node.id === MODAL_ID ||
        node.id === STYLE_ID ||
        node.classList?.contains(TRIGGER_CLASS) ||
        node.closest?.("#" + MODAL_ID) ||
        node.closest?.("." + TRIGGER_CLASS)
      )
    );
  }

  function shouldReactToMutations(mutations) {
    for (const m of mutations) {
      if (isOurNode(m.target)) continue;

      for (const n of m.addedNodes) {
        if (isOurNode(n)) continue;
        if (n.nodeType === 1) {
          if (n.matches?.(".gall_writer") || n.querySelector?.(".gall_writer")) return true;
        }
      }

      for (const n of m.removedNodes) {
        if (isOurNode(n)) continue;
        if (n.nodeType === 1) {
          if (n.matches?.(".gall_writer") || n.querySelector?.(".gall_writer")) return true;
        }
      }
    }
    return false;
  }

  function initObserver() {
    if (!document.body) return;

    observer = new MutationObserver((mutations) => {
      if (!shouldReactToMutations(mutations)) return;
      queueRender();
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  function initStorage() {
    chrome.storage.sync.get(SYNC_DEFAULTS, ({ userMemoEnabled }) => {
      enabled = !!userMemoEnabled;
      renderAll();
    });

    chrome.storage.local.get(LOCAL_DEFAULTS, ({ userMemos }) => {
      memoMap = userMemos || {};
      renderAll();
    });

    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === "sync" && changes.userMemoEnabled) {
        enabled = !!changes.userMemoEnabled.newValue;
        renderAll();
      }

      if (area === "local" && changes.userMemos) {
        memoMap = changes.userMemos.newValue || {};
        renderAll();
      }
    });
  }

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeModal();
  }, true);

  function boot() {
    initStorage();
    renderAll();
    initObserver();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
})();

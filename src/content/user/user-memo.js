// user-memo.js
(() => {
  const STYLE_ID = "dcb-user-memo-style";
  const TRIGGER_CLASS = "dcb-user-memo-trigger";
  const SLOT_CLASS = "dcb-user-memo-slot";
  const COMMENT_HOST_CLASS = "dcb-user-memo-comment-host";
  const MODAL_ID = "dcb-user-memo-modal";
  const DEFAULT_COLOR = "#6b7280";

  const UID_BADGE_CLASS = "dcb-uid-badge";
  const WRITER_TOOLS_CLASS = "dcb-writer-tools";
  const WRITER_ENHANCED_CLASS = "dcb-writer-enhanced";
  const WRITER_SELECTOR = ".gall_writer,.ub-writer";

  const SYNC_DEFAULTS = {
    userMemoEnabled: false
  };

  const LOCAL_DEFAULTS = {
    userMemos: {}
  };

  let enabled = false;
  let memoMap = {};
  let memoReadRevision = 0;
  let currentMeta = null;
  let renderQueued = false;
  const pendingRenderRoots = new Set();
  const CONTEXT_MEMO_TTL = 8000;
  let lastContextMemoMeta = null;
  let lastContextMemoAt = 0;

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
    st.dataset.dcbOwned = "user-memo";
    st.textContent = `
      .${SLOT_CLASS}{
        display:flex !important;
        align-items:center !important;
        gap:6px !important;
        margin:6px 0 8px !important;
        min-height:24px !important;
        flex-wrap:wrap !important;
      }

      .${SLOT_CLASS}:empty{
        display:none !important;
      }

      .${TRIGGER_CLASS}{
        appearance:none !important;
        -webkit-appearance:none !important;
        border:1px solid rgba(148, 163, 184, .35) !important;
        border-radius:999px !important;
        background:rgba(148, 163, 184, .12) !important;
        color:#64748b !important;
        font-weight:600 !important;
        letter-spacing:-0.01em !important;
        cursor:pointer !important;
        user-select:none !important;
        pointer-events:auto !important;
        position:static !important;
        z-index:auto !important;
        transition:background-color .18s ease,border-color .18s ease,color .18s ease,transform .18s ease,box-shadow .18s ease !important;
      }

      .${TRIGGER_CLASS}::before{
        content:"";
        display:block !important;
        width:6px !important;
        height:6px !important;
        flex:0 0 6px !important;
        border-radius:999px !important;
        background:currentColor !important;
        opacity:.62 !important;
      }

      .${TRIGGER_CLASS}.has-memo{font-weight:700 !important;}
      .${TRIGGER_CLASS}:hover{transform:translateY(-1px) !important;box-shadow:0 6px 18px rgba(15,23,42,.08) !important;}
      .${TRIGGER_CLASS}:focus{outline:2px solid rgba(79,124,255,.35) !important;outline-offset:2px !important;}

      .dcb-user-memo-overlay{
        position:fixed !important;
        inset:0 !important;
        z-index:2147483646 !important;
        display:none !important;
        align-items:center !important;
        justify-content:center !important;
        background:rgba(15,23,42,.45) !important;
        padding:12px !important;
        box-sizing:border-box !important;
      }
      .dcb-user-memo-overlay.open{
        display:flex !important;
      }

      .dcb-user-memo-panel{
        width:min(440px, calc(100vw - 24px)) !important;
        background:#ffffff !important;
        color:#0f172a !important;
        border:1px solid rgba(226, 232, 240, .9) !important;
        border-radius:18px !important;
        box-shadow:0 24px 60px rgba(15,23,42,.22) !important;
        padding:18px !important;
        font-family:system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif !important;
        box-sizing:border-box !important;
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
        font-weight:800 !important;
        letter-spacing:-0.02em !important;
      }

      .dcb-user-memo-close{
        border:0 !important;
        background:transparent !important;
        font-size:22px !important;
        line-height:1 !important;
        cursor:pointer !important;
        color:#64748b !important;
      }

      .dcb-user-memo-meta{
        margin-bottom:12px !important;
        color:#64748b !important;
        font-size:12px !important;
        line-height:1.5 !important;
        word-break:break-all !important;
      }

      .dcb-user-memo-field{
        display:flex !important;
        flex-direction:column !important;
        gap:8px !important;
        margin-bottom:12px !important;
      }

      .dcb-user-memo-field label,
      .dcb-user-memo-row label{
        font-size:12px !important;
        font-weight:700 !important;
        color:#334155 !important;
      }

      .dcb-user-memo-textarea{
        width:100% !important;
        min-height:104px !important;
        resize:vertical !important;
        border:1px solid #d1d5db !important;
        border-radius:12px !important;
        padding:12px 13px !important;
        font-size:14px !important;
        line-height:1.5 !important;
        outline:none !important;
        box-sizing:border-box !important;
      }

      .dcb-user-memo-textarea:focus{
        border-color:#4f7cff !important;
        box-shadow:0 0 0 4px rgba(79,124,255,.13) !important;
      }

      .dcb-user-memo-row{
        display:flex !important;
        align-items:center !important;
        justify-content:space-between !important;
        gap:12px !important;
        margin-bottom:16px !important;
      }

      .dcb-user-memo-color{
        width:52px !important;
        height:34px !important;
        border:1px solid #d1d5db !important;
        border-radius:10px !important;
        background:transparent !important;
        padding:2px !important;
        cursor:pointer !important;
      }

      .dcb-user-memo-actions{
        display:flex !important;
        justify-content:flex-end !important;
        gap:8px !important;
        flex-wrap:wrap !important;
      }

      .dcb-user-memo-btn{
        border:1px solid #d1d5db !important;
        border-radius:11px !important;
        padding:9px 13px !important;
        background:#fff !important;
        color:#0f172a !important;
        font-size:13px !important;
        font-weight:700 !important;
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

      @media (max-width:640px){
        .${SLOT_CLASS}{margin:5px 0 7px !important;}
        .dcb-user-memo-panel{width:min(100%,calc(100vw - 16px)) !important;padding:16px !important;border-radius:16px !important;}
      }
    `;
    (document.head || document.documentElement).appendChild(st);
    return st;
  }

  function cleanupEmptySlots() {
    document.querySelectorAll(`.${SLOT_CLASS}`).forEach((slot) => {
      if (slot.querySelector(`.${TRIGGER_CLASS}`)) return;
      slot.remove();
    });
  }

  function cleanupEmptyWriterTools(writers = null) {
    (writers || document.querySelectorAll(`.${WRITER_ENHANCED_CLASS}`)).forEach((writer) => globalThis.DCBWriterLayout?.cleanup(writer));
  }

  function removeInjectedUi() {
    const writers = new Set();
    document.querySelectorAll(`.${TRIGGER_CLASS}`).forEach((el) => {
      const writer = el.closest(WRITER_SELECTOR);
      if (writer) writers.add(writer);
      el.remove();
    });
    cleanupEmptySlots();
    cleanupEmptyWriterTools(writers);

    document.querySelectorAll(`.${COMMENT_HOST_CLASS}`).forEach((el) => {
      el.classList.remove(COMMENT_HOST_CLASS);
    });

    const modal = document.getElementById(MODAL_ID);
    if (modal) modal.remove();

    const style = document.getElementById(STYLE_ID);
    if (style) style.remove();
  }

  function extractUid(writer) {
    let uid = writer.getAttribute("data-uid") || writer.getAttribute("data-memo-uid") || "";
    if (uid && !isIpLike(uid)) return uid;

    const badge = writer.querySelector(`.${UID_BADGE_CLASS}`);
    uid = badge?.dataset?.fullUid || badge?.title || "";
    if (uid && !isIpLike(uid)) return uid;

    const rf =
      writer.querySelector(".refresherUserData") ||
      writer.parentElement?.querySelector(".refresherUserData");

    if (rf) {
      uid = rf.getAttribute("title") || "";
      if (!uid) {
        const m = (rf.textContent || "").match(/\(([A-Za-z0-9._-]+)\)/);
        if (m) uid = m[1];
      }
      if (uid && !isIpLike(uid)) return uid;
    }

    const link =
      writer.querySelector('.writer_nikcon,[onclick*="gallog.dcinside.com"],a[href*="gallog.dcinside.com"],[onclick*="gallog"],a[href*="gallog"]') ||
      writer.parentElement?.querySelector('.writer_nikcon,[onclick*="gallog.dcinside.com"],a[href*="gallog.dcinside.com"],[onclick*="gallog"],a[href*="gallog"]');

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
    let ip = writer.getAttribute("data-ip") || writer.getAttribute("data-memo-ip") || "";
    if (ip && isIpLike(ip)) return ip;

    const ipNode = writer.querySelector(".ip,.writer_ip") || writer.parentElement?.querySelector(".ip,.writer_ip");
    ip = ipNode?.textContent || "";
    if (ip && /(\d{1,3}(?:\.\d{1,3}){1,3})/.test(ip)) {
      return ip.match(/(\d{1,3}(?:\.\d{1,3}){1,3})/)?.[1] || "";
    }

    const text = (writer.textContent || "").trim();
    const m = text.match(/(\d{1,3}(?:\.\d{1,3}){1,3})/);
    return m ? m[1] : "";
  }

  function extractNickname(writer) {
    const nickEl =
      writer.querySelector(':scope > .nickname em') ||
      writer.querySelector('.nickname em');

    const fallback =
      writer.querySelector(':scope > .nickname') ||
      writer.querySelector('.nickname');

    const txt = nickEl ? nickEl.textContent : (fallback ? fallback.textContent : '');
    return sanitizeText(txt, 60) || '알 수 없음';
  }

  function isStrictIdentityPage() {
    return /^\/(?:mini|person)\/(?:board\/lists|board\/view)(?:\/|$)/.test(location.pathname);
  }

  function isStrictMemoTarget(writer) {
    const uid = extractUid(writer);
    if (uid) return true;

    const ip = extractIp(writer);
    if (ip) return true;

    return false;
  }

  function getWriterMeta(writer) {
    const uid = extractUid(writer);
    const ip = uid ? '' : extractIp(writer);
    const nickname = extractNickname(writer);

    if (isStrictIdentityPage() && !isStrictMemoTarget(writer)) {
      return null;
    }

    let key = '';
    if (uid) key = `uid:${uid}`;
    else if (ip) key = `ip:${ip}`;
    else if (!isStrictIdentityPage() && nickname) key = `nick:${nickname}`;

    if (!key) return null;

    return { key, uid, ip, nickname };
  }

  function ensureModal() {
    let root = document.getElementById(MODAL_ID);
    if (root) return root;

    root = document.createElement('div');
    root.id = MODAL_ID;
    root.className = 'dcb-user-memo-overlay';
    root.innerHTML = `
      <div class="dcb-user-memo-panel" role="dialog" aria-modal="true" aria-labelledby="dcb-user-memo-title">
        <div class="dcb-user-memo-head">
          <div id="dcb-user-memo-title" class="dcb-user-memo-title" data-role="title">이용자 메모</div>
          <button type="button" class="dcb-user-memo-close" data-act="close" aria-label="닫기">×</button>
        </div>

        <div class="dcb-user-memo-meta" data-role="meta"></div>

        <div class="dcb-user-memo-field">
          <label for="dcb-user-memo-textarea">메모</label>
          <textarea
            id="dcb-user-memo-textarea"
            class="dcb-user-memo-textarea"
            data-role="memo"
            maxlength="80"
            placeholder="예: 자주 보이는 유저 / 공격적 성향 / 좋은 정보 자주 남김"
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

    root.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
    }, true);

    root.addEventListener('click', (e) => {
      if (e.target === root) closeModal();
    });

    root.querySelectorAll('[data-act="close"]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        closeModal();
      });
    });

    root.querySelector('[data-act="save"]').addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      saveCurrentMemo();
    });

    root.querySelector('[data-act="delete"]').addEventListener('click', (e) => {
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

  function getMetaFromTrigger(btn) {
    return {
      key: btn.dataset.memoKey || '',
      uid: btn.dataset.memoUid || '',
      ip: btn.dataset.memoIp || '',
      nickname: btn.dataset.memoNickname || '알 수 없음'
    };
  }

  function openModal(meta) {
    if (!meta || !meta.key) return;

    currentMeta = meta;
    ensureStyle();
    ensureModal();

    const els = modalEls();
    const saved = memoMap[meta.key] || {};

    els.title.textContent = `${meta.nickname} 메모`;
    els.meta.textContent = [
      meta.nickname ? `닉네임: ${meta.nickname}` : '',
      meta.uid ? `아이디: ${meta.uid}` : '',
      meta.ip ? `IP: ${meta.ip}` : '',
      `저장키: ${meta.key}`
    ].filter(Boolean).join(' · ');

    els.memo.value = saved.memo || '';
    els.color.value = isValidColor(saved.color) ? saved.color : DEFAULT_COLOR;

    els.root.classList.add('open');

    requestAnimationFrame(() => {
      els.memo.focus();
      els.memo.setSelectionRange(els.memo.value.length, els.memo.value.length);
    });
  }

  function closeModal() {
    const root = document.getElementById(MODAL_ID);
    if (root) root.classList.remove('open');
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
          nickname: currentMeta.nickname || '',
          uid: currentMeta.uid || '',
          ip: currentMeta.ip || '',
          updatedAt: Date.now()
        };
      }

      chrome.storage.local.set({ userMemos: next }, () => {
        memoReadRevision += 1;
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
        memoReadRevision += 1;
        memoMap = next;
        renderAll();
        closeModal();
      });
    });
  }


  function rememberContextMemoTarget(target) {
    const writer = target?.closest?.(WRITER_SELECTOR);
    if (!writer) {
      lastContextMemoMeta = null;
      lastContextMemoAt = 0;
      return;
    }

    const meta = getWriterMeta(writer);
    if (!meta) {
      lastContextMemoMeta = null;
      lastContextMemoAt = 0;
      return;
    }

    lastContextMemoMeta = meta;
    lastContextMemoAt = Date.now();
  }

  function openContextMemo() {
    if (!lastContextMemoMeta || Date.now() - lastContextMemoAt > CONTEXT_MEMO_TTL) {
      return { ok: false, reason: 'NO_TARGET', message: '메모할 작성자를 다시 우클릭해 주세요.' };
    }

    ensureStyle();
    ensureModal();
    openModal(lastContextMemoMeta);
    return { ok: true };
  }

  function createTrigger() {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = TRIGGER_CLASS;
    btn.setAttribute('data-dcb-owned', '1');

    btn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      openModal(getMetaFromTrigger(btn));
    }, true);

    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
    }, true);

    return btn;
  }

  function updateTrigger(btn, meta, writer) {
    const context = globalThis.DCBWriterLayout.detectContext(writer);

    btn.dataset.memoKey = meta.key;
    btn.dataset.memoUid = meta.uid || '';
    btn.dataset.memoIp = meta.ip || '';
    btn.dataset.memoNickname = meta.nickname || '';
    btn.dataset.loc = context;

    const saved = memoMap[meta.key];
    btn.dataset.dcbMemoMode = globalThis.DCBWriterLayout.memoMode(writer, !!saved?.memo);

    btn.classList.toggle('has-memo', !!saved);
    btn.classList.remove('is-list');
    btn.classList.toggle('is-preview', context.startsWith("preview-"));
    btn.dataset.fullMemo = saved?.memo || "";

    let value = btn.querySelector(":scope > .dcb-memo-value");
    if (!value) {
      value = document.createElement("span");
      value.className = "dcb-memo-value";
      btn.replaceChildren(value);
    }

    if (saved && saved.memo) {
      const color = isValidColor(saved.color) ? saved.color : DEFAULT_COLOR;

      const text = saved.memo;
      if (value.textContent !== text) value.textContent = text;
      btn.title = saved.memo;
      btn.setAttribute('aria-label', `이용자 메모: ${saved.memo}`);
      btn.style.color = color;
      btn.style.borderColor = `${color}4d`;
      btn.style.background = `${color}14`;
    } else {
      const text = '📝';
      if (value.textContent !== text) value.textContent = text;
      btn.title = '이용자 메모 작성';
      btn.setAttribute('aria-label', '이용자 메모 작성');
      btn.style.color = '';
      btn.style.borderColor = '';
      btn.style.background = '';
    }
  }

  function getCommentHost(writer) {
    return writer.closest('.cmt_nickbox, .cmt_info, .reply_info');
  }

  function removeWriterNikconWhitespace(writer) {
    return globalThis.DCBWriterLayout?.removeNativeWhitespace(writer);
  }

  function getExistingCommentSlot(writer) {
    const host = getCommentHost(writer);
    if (!host) return null;

    let node = host.nextElementSibling;
    while (node) {
      if (node.classList.contains(SLOT_CLASS)) return node;
      if (node.matches?.('.cmt_txtbox, .reply_txtbox, .usertxt, .btn_reply_write_all')) break;
      node = node.nextElementSibling;
    }

    return null;
  }

  function removeTriggerForWriter(writer) {
    writer.querySelectorAll(`.${TRIGGER_CLASS}`).forEach((el) => el.remove());

    const slot = getExistingCommentSlot(writer);
    if (slot) {
      slot.querySelectorAll(`.${TRIGGER_CLASS}`).forEach((el) => el.remove());
      if (!slot.querySelector(`.${TRIGGER_CLASS}`)) slot.remove();
    }

    // A list pass visits every writer. Global cleanup here made that pass
    // repeatedly traverse all writers instead of only the current identity.
    globalThis.DCBWriterLayout?.cleanup(writer);
  }

  function placeTriggerInline(writer, btn) {
    globalThis.DCBWriterLayout?.attachMemo(writer, btn);
  }

  function placeTrigger(writer, btn) {
    placeTriggerInline(writer, btn);
  }

  function renderWriter(writer) {
    if (!(writer instanceof Element)) return;

    if (!enabled || !globalThis.DCBWriterLayout || globalThis.DCBWriterLayout.memoMode(writer) === "hidden") {
      removeTriggerForWriter(writer);
      return;
    }

    const meta = getWriterMeta(writer);
    if (!meta) {
      removeTriggerForWriter(writer);
      return;
    }


    let btn =
      writer.querySelector(`.${WRITER_TOOLS_CLASS} > .${TRIGGER_CLASS}`) ||
      writer.querySelector(`:scope > .${TRIGGER_CLASS}`);

    if (!btn) {
      const slot = getExistingCommentSlot(writer);
      btn = slot?.querySelector(`.${TRIGGER_CLASS}`) || null;
    }

    btn = btn || createTrigger();

    updateTrigger(btn, meta, writer);
    placeTrigger(writer, btn);
  }

  function removeInjectedUiInRoot(root = document) {
    if (root === document) {
      removeInjectedUi();
      return;
    }
    const writers = new Set();
    root.querySelectorAll?.(`.${TRIGGER_CLASS}`).forEach((el) => {
      const writer = el.closest(WRITER_SELECTOR);
      if (writer) writers.add(writer);
      el.remove();
    });
    cleanupEmptySlots();
    cleanupEmptyWriterTools(writers);
  }

  function renderAll(root = document) {
    if (!enabled) {
      removeInjectedUiInRoot(root);
      return;
    }
    if (root instanceof Element && root.matches(WRITER_SELECTOR)) {
      removeWriterNikconWhitespace(root);
    }
    root.querySelectorAll?.(WRITER_SELECTOR).forEach(removeWriterNikconWhitespace);
    ensureStyle();

    const element = root === document ? null : (root?.nodeType === Node.ELEMENT_NODE ? root : root?.parentElement);
    if (element?.matches?.(WRITER_SELECTOR)) renderWriter(element);
    root.querySelectorAll?.(WRITER_SELECTOR).forEach(renderWriter);

    cleanupEmptySlots();
    cleanupEmptyWriterTools();
  }

  function queueRender(root = document) {
    if (!enabled) return;
    if (root) pendingRenderRoots.add(root);
    if (renderQueued) return;
    renderQueued = true;

    requestAnimationFrame(() => {
      renderQueued = false;
      const roots = [...pendingRenderRoots];
      pendingRenderRoots.clear();
      if (!enabled) return;
      if (!roots.length || roots.includes(document)) {
        renderAll();
        return;
      }
      const normalized = roots
        .map((root) => root?.nodeType === Node.TEXT_NODE ? root.parentElement : root)
        .filter(Boolean);
      const minimal = normalized.filter((root) => !normalized.some((other) => other !== root && other.contains?.(root)));
      minimal.forEach((root) => renderAll(root));
    });
  }

  function isOurNode(node) {
    return !!(
      node &&
      node.nodeType === 1 &&
      (
        node.closest?.("[data-dcb-owned]") ||
        node.id === MODAL_ID ||
        node.id === STYLE_ID ||
        node.classList?.contains(TRIGGER_CLASS) ||
        node.classList?.contains(SLOT_CLASS) ||
        node.classList?.contains(WRITER_TOOLS_CLASS) ||
        node.closest?.(`#${MODAL_ID}`) ||
        node.closest?.(`.${TRIGGER_CLASS}`) ||
        node.closest?.(`.${SLOT_CLASS}`) ||
        node.closest?.(`.${WRITER_TOOLS_CLASS}`)
      )
    );
  }

  function handleDomMutations(mutations) {
    if (!enabled) return;
    const roots = new Set();
    for (const m of mutations) {
      if (isOurNode(m.target)) continue;
      if (m.type === "childList") {
        for (const n of m.addedNodes) {
          if (isOurNode(n)) continue;
          if (n.nodeType === 1 && (n.matches?.(WRITER_SELECTOR) || n.querySelector?.(WRITER_SELECTOR))) roots.add(n);
        }
        const target = m.target?.nodeType === 1 ? m.target : m.target?.parentElement;
        if (target?.closest?.(WRITER_SELECTOR)) roots.add(target.closest(WRITER_SELECTOR));
      }
    }
    roots.forEach((root) => queueRender(root));
  }

  let unsubscribeDomBus = null;
  function initObserver() {
    if (!enabled || unsubscribeDomBus || !globalThis.DCBDomMutationBus) return;
    unsubscribeDomBus = globalThis.DCBDomMutationBus.subscribe(
      "user-memo",
      handleDomMutations,
      { types: ["childList"] }
    );
  }

  function updateObserver() {
    if (enabled) initObserver();
    else {
      unsubscribeDomBus?.();
      unsubscribeDomBus = null;
      pendingRenderRoots.clear();
    }
  }

  try {
    globalThis.DCBUserMemo = Object.freeze({
      refresh: (root = document) => renderAll(root)
    });

    document.addEventListener("dcb-user-memo:refresh", (event) => {
      renderAll(event?.detail?.root || document);
    });
  } catch (_) {}

  function initStorage() {
    let syncReady = false;
    let localReady = false;
    let initialRendered = false;
    const renderWhenReady = () => {
      if (initialRendered || !syncReady || !localReady) return;
      initialRendered = true;
      updateObserver();
      const run = () => renderAll();
      if (globalThis.DCBStartupScheduler) globalThis.DCBStartupScheduler.schedule("user-memo:init", run, "normal");
      else setTimeout(run, 36);
    };

    globalThis.DCBRuntimeSettingsCache.get(SYNC_DEFAULTS, ({ userMemoEnabled }) => {
      enabled = !!userMemoEnabled;
      syncReady = true;
      renderWhenReady();
    });

    const revision = memoReadRevision;
    chrome.storage.local.get(LOCAL_DEFAULTS, ({ userMemos }) => {
      if (revision === memoReadRevision) memoMap = userMemos || {};
      localReady = true;
      renderWhenReady();
    });

    (globalThis.DCBRuntimeSettingsCache?.onChanged || chrome.storage.onChanged).addListener((changes, area) => {
      if (area === 'sync' && changes.userMemoEnabled) {
        enabled = !!changes.userMemoEnabled.newValue;
        updateObserver();
        if (enabled) queueRender();
        else renderAll();
      }

      if (area === 'local' && changes.userMemos) {
        memoReadRevision += 1;
        memoMap = changes.userMemos.newValue || {};
        if (enabled) queueRender();
      }
    });
  }

  window.addEventListener('contextmenu', (e) => {
    rememberContextMemoTarget(e.target);

    // 작성자 영역에서 Shift+우클릭하면 즉시 메모 편집창을 연다.
    // 일반 우클릭은 기존 사용자 차단 흐름을 건드리지 않는다.
    if (!e.shiftKey) return;

    const res = openContextMemo();
    if (!res?.ok) return;

    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation?.();
  }, true);

  document.addEventListener('dcb-user-memo:open-context', () => {
    openContextMemo();
  });

  try {
    chrome.runtime?.onMessage?.addListener((message, _sender, sendResponse) => {
      if (message?.type !== 'dcb.userMemoOpenContext') return;
      sendResponse(openContextMemo());
      return true;
    });
  } catch (_) {}

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeModal();
  }, true);

  function boot() {
    // Wait for sync + local settings once, then perform a single initial render.
    initStorage();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();

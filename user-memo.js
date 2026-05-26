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

  function isListWriter(writer) {
    return !!(
      writer &&
      writer.matches?.("td.gall_writer, .gall_list .gall_writer") &&
      (
        writer.getAttribute("data-loc") === "list" ||
        writer.closest(".gall_list")
      )
    );
  }

  function ensureStyle() {
    let st = document.getElementById(STYLE_ID);
    if (st) return st;

    st = document.createElement("style");
    st.id = STYLE_ID;
    st.textContent = `
      .${WRITER_ENHANCED_CLASS}{
        max-width:100% !important;
      }

      .${WRITER_TOOLS_CLASS}{
        display:inline-flex !important;
        align-items:center !important;
        gap:4px !important;
        flex-wrap:nowrap !important;
        vertical-align:middle !important;
        margin-left:5px !important;
        max-width:100% !important;
        white-space:nowrap !important;
      }

      .gall_writer.${WRITER_ENHANCED_CLASS}{
        overflow:visible !important;
      }

      .gall_writer.${WRITER_ENHANCED_CLASS} > .nickname,
      .gall_writer.${WRITER_ENHANCED_CLASS} > .writer_nikcon,
      .gall_writer.${WRITER_ENHANCED_CLASS} > .${WRITER_TOOLS_CLASS}{
        vertical-align:middle !important;
      }

      /*
        댓글/본문 작성자 영역
      */

      .cmt_nickbox .gall_writer.${WRITER_ENHANCED_CLASS},
      .cmt_info .gall_writer.${WRITER_ENHANCED_CLASS},
      .reply_info .gall_writer.${WRITER_ENHANCED_CLASS}{
        display:inline-flex !important;
        align-items:center !important;
        flex-wrap:wrap !important;
        gap:3px !important;
        max-width:100% !important;
        white-space:normal !important;
        overflow:visible !important;
      }

      .cmt_nickbox .gall_writer.${WRITER_ENHANCED_CLASS} > .nickname,
      .cmt_info .gall_writer.${WRITER_ENHANCED_CLASS} > .nickname,
      .reply_info .gall_writer.${WRITER_ENHANCED_CLASS} > .nickname{
        flex:0 1 auto !important;
        min-width:0 !important;
        max-width:none !important;
        white-space:normal !important;
        overflow:visible !important;
        text-overflow:clip !important;
        word-break:break-all !important;
      }

      .cmt_nickbox .gall_writer.${WRITER_ENHANCED_CLASS} > .writer_nikcon,
      .cmt_info .gall_writer.${WRITER_ENHANCED_CLASS} > .writer_nikcon,
      .reply_info .gall_writer.${WRITER_ENHANCED_CLASS} > .writer_nikcon{
        flex:0 0 auto !important;
      }

      .cmt_nickbox .gall_writer.${WRITER_ENHANCED_CLASS} > .${WRITER_TOOLS_CLASS},
      .cmt_info .gall_writer.${WRITER_ENHANCED_CLASS} > .${WRITER_TOOLS_CLASS},
      .reply_info .gall_writer.${WRITER_ENHANCED_CLASS} > .${WRITER_TOOLS_CLASS}{
        flex:0 0 auto !important;
        margin-left:5px !important;
        transform:translateX(2px) !important;
      }

      .cmt_nickbox .gall_writer.${WRITER_ENHANCED_CLASS} .btn_cmt_delete,
      .cmt_info .gall_writer.${WRITER_ENHANCED_CLASS} .btn_cmt_delete,
      .reply_info .gall_writer.${WRITER_ENHANCED_CLASS} .btn_cmt_delete,
      .${COMMENT_HOST_CLASS} .btn_cmt_delete{
        display:none !important;
      }

      /*
        게시물 목록 작성자 칸 전용 최적화
        - addbox 18px 확보
        - 디시 기본 마크/주황 B/갤로그 아이콘 잘림 방지
      */

      .gall_list td.gall_writer.${WRITER_ENHANCED_CLASS},
      td.gall_writer.ub-writer.${WRITER_ENHANCED_CLASS}[data-loc="list"]{
        overflow:visible !important;
        text-align:center !important;
        vertical-align:middle !important;
        white-space:normal !important;
        line-height:1.12 !important;
        padding-left:2px !important;
        padding-right:2px !important;
      }

      .gall_list td.gall_writer.${WRITER_ENHANCED_CLASS} .addbox,
      td.gall_writer.ub-writer.${WRITER_ENHANCED_CLASS}[data-loc="list"] .addbox{
        display:flex !important;
        align-items:center !important;
        justify-content:center !important;
        gap:2px !important;
        width:100% !important;
        max-width:100% !important;
        min-width:0 !important;
        min-height:18px !important;
        height:18px !important;
        line-height:18px !important;
        overflow:visible !important;
        box-sizing:border-box !important;
      }

      .gall_list td.gall_writer.${WRITER_ENHANCED_CLASS} .nickname,
      td.gall_writer.ub-writer.${WRITER_ENHANCED_CLASS}[data-loc="list"] .nickname{
        display:inline-block !important;
        max-width:calc(100% - 22px) !important;
        min-width:0 !important;
        overflow:hidden !important;
        text-overflow:ellipsis !important;
        white-space:nowrap !important;
        vertical-align:middle !important;
        line-height:18px !important;
      }

      .gall_list td.gall_writer.${WRITER_ENHANCED_CLASS} .nickname em,
      td.gall_writer.ub-writer.${WRITER_ENHANCED_CLASS}[data-loc="list"] .nickname em{
        display:inline !important;
        white-space:nowrap !important;
        line-height:18px !important;
      }

      .gall_list td.gall_writer.${WRITER_ENHANCED_CLASS} .writer_nikcon,
      td.gall_writer.ub-writer.${WRITER_ENHANCED_CLASS}[data-loc="list"] .writer_nikcon{
        flex:0 0 auto !important;
        display:inline-flex !important;
        align-items:center !important;
        justify-content:center !important;
        width:auto !important;
        min-width:12px !important;
        max-width:22px !important;
        height:18px !important;
        max-height:18px !important;
        overflow:visible !important;
        vertical-align:middle !important;
      }

      .gall_list td.gall_writer.${WRITER_ENHANCED_CLASS} .addbox img,
      td.gall_writer.ub-writer.${WRITER_ENHANCED_CLASS}[data-loc="list"] .addbox img,
      .gall_list td.gall_writer.${WRITER_ENHANCED_CLASS} .writer_nikcon img,
      td.gall_writer.ub-writer.${WRITER_ENHANCED_CLASS}[data-loc="list"] .writer_nikcon img{
        display:inline-block !important;
        vertical-align:middle !important;
        max-width:18px !important;
        max-height:18px !important;
        object-fit:contain !important;
        margin-left:1px !important;
      }

      .gall_list td.gall_writer.${WRITER_ENHANCED_CLASS} > .${WRITER_TOOLS_CLASS},
      td.gall_writer.ub-writer.${WRITER_ENHANCED_CLASS}[data-loc="list"] > .${WRITER_TOOLS_CLASS}{
        display:flex !important;
        align-items:center !important;
        justify-content:center !important;
        gap:2px !important;
        width:100% !important;
        max-width:100% !important;
        min-width:0 !important;
        height:15px !important;
        line-height:15px !important;
        margin:0 !important;
        padding:0 !important;
        overflow:hidden !important;
        white-space:nowrap !important;
        transform:none !important;
        box-sizing:border-box !important;
      }

      .gall_list td.gall_writer.${WRITER_ENHANCED_CLASS} .${UID_BADGE_CLASS},
      td.gall_writer.ub-writer.${WRITER_ENHANCED_CLASS}[data-loc="list"] .${UID_BADGE_CLASS}{
        flex:0 1 auto !important;
        max-width:56px !important;
        min-width:0 !important;
        height:14px !important;
        line-height:13px !important;
        padding:0 4px !important;
        font-size:9.5px !important;
        border-radius:8px !important;
        overflow:hidden !important;
        text-overflow:ellipsis !important;
        white-space:nowrap !important;
        box-sizing:border-box !important;
      }

      .${COMMENT_HOST_CLASS}{
        position:relative !important;
      }

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
        display:inline-flex !important;
        align-items:center !important;
        gap:6px !important;
        max-width:min(100%, 320px) !important;
        min-height:24px !important;
        padding:4px 10px !important;
        border:1px solid rgba(148, 163, 184, .35) !important;
        border-radius:999px !important;
        background:rgba(148, 163, 184, .12) !important;
        color:#64748b !important;
        font-size:12px !important;
        font-weight:600 !important;
        line-height:1.2 !important;
        letter-spacing:-0.01em !important;
        white-space:nowrap !important;
        overflow:hidden !important;
        text-overflow:ellipsis !important;
        vertical-align:middle !important;
        cursor:pointer !important;
        user-select:none !important;
        pointer-events:auto !important;
        position:static !important;
        z-index:auto !important;
        box-sizing:border-box !important;
        margin-left:0 !important;
        margin-right:0 !important;
        transition:
          background-color .18s ease,
          border-color .18s ease,
          color .18s ease,
          transform .18s ease,
          box-shadow .18s ease !important;
      }

      .${WRITER_TOOLS_CLASS} > .${TRIGGER_CLASS}{
        flex:0 0 auto !important;
        max-width:min(320px, 45vw) !important;
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

      .${TRIGGER_CLASS}.has-memo{
        font-weight:700 !important;
      }

      .${TRIGGER_CLASS}:hover{
        transform:translateY(-1px) !important;
        box-shadow:0 6px 18px rgba(15, 23, 42, .08) !important;
      }

      .${TRIGGER_CLASS}:focus{
        outline:2px solid rgba(79,124,255,.35) !important;
        outline-offset:2px !important;
      }

      .cmt_nickbox .${TRIGGER_CLASS},
      .cmt_info .${TRIGGER_CLASS},
      .reply_info .${TRIGGER_CLASS}{
        max-width:min(100%, 280px) !important;
      }

      /*
        목록에서는 "메모 추가" 대신 "메모"로 줄이고,
        버튼 자체도 미니 버튼으로 압축
      */

      .gall_list td.gall_writer.${WRITER_ENHANCED_CLASS} .${TRIGGER_CLASS},
      td.gall_writer.ub-writer.${WRITER_ENHANCED_CLASS}[data-loc="list"] .${TRIGGER_CLASS}{
        flex:0 1 auto !important;
        max-width:42px !important;
        min-width:0 !important;
        min-height:14px !important;
        height:15px !important;
        max-height:15px !important;
        padding:0 5px !important;
        font-size:9.5px !important;
        line-height:13px !important;
        gap:3px !important;
        border-radius:999px !important;
        overflow:hidden !important;
        text-overflow:ellipsis !important;
        white-space:nowrap !important;
        box-sizing:border-box !important;
      }

      .gall_list td.gall_writer.${WRITER_ENHANCED_CLASS} .${TRIGGER_CLASS}::before,
      td.gall_writer.ub-writer.${WRITER_ENHANCED_CLASS}[data-loc="list"] .${TRIGGER_CLASS}::before{
        width:4px !important;
        height:4px !important;
        flex:0 0 4px !important;
      }

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
        .cmt_nickbox .gall_writer.${WRITER_ENHANCED_CLASS},
        .cmt_info .gall_writer.${WRITER_ENHANCED_CLASS},
        .reply_info .gall_writer.${WRITER_ENHANCED_CLASS}{
          row-gap:4px !important;
        }

        .cmt_nickbox .gall_writer.${WRITER_ENHANCED_CLASS} > .${WRITER_TOOLS_CLASS},
        .cmt_info .gall_writer.${WRITER_ENHANCED_CLASS} > .${WRITER_TOOLS_CLASS},
        .reply_info .gall_writer.${WRITER_ENHANCED_CLASS} > .${WRITER_TOOLS_CLASS}{
          margin-left:7px !important;
          transform:translateX(3px) !important;
        }

        .${SLOT_CLASS}{
          margin:5px 0 7px !important;
        }

        .${TRIGGER_CLASS}{
          max-width:100% !important;
          font-size:11px !important;
          padding:4px 9px !important;
        }

        .${WRITER_TOOLS_CLASS} > .${TRIGGER_CLASS}{
          max-width:min(240px, 55vw) !important;
        }

        .gall_list td.gall_writer.${WRITER_ENHANCED_CLASS} .${TRIGGER_CLASS},
        td.gall_writer.ub-writer.${WRITER_ENHANCED_CLASS}[data-loc="list"] .${TRIGGER_CLASS}{
          max-width:38px !important;
          min-height:14px !important;
          height:14px !important;
          max-height:14px !important;
          padding:0 4px !important;
          font-size:9px !important;
          line-height:12px !important;
        }

        .dcb-user-memo-panel{
          width:min(100%, calc(100vw - 16px)) !important;
          padding:16px !important;
          border-radius:16px !important;
        }
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

  function cleanupEmptyWriterTools() {
    document.querySelectorAll(`.${WRITER_TOOLS_CLASS}`).forEach((tools) => {
      if (!tools.children.length) tools.remove();
    });

    document.querySelectorAll(`.${WRITER_ENHANCED_CLASS}`).forEach((writer) => {
      const tools = writer.querySelector(`:scope > .${WRITER_TOOLS_CLASS}`);
      if (!tools) writer.classList.remove(WRITER_ENHANCED_CLASS);
    });
  }

  function removeInjectedUi() {
    document.querySelectorAll(`.${TRIGGER_CLASS}`).forEach((el) => el.remove());
    cleanupEmptySlots();
    cleanupEmptyWriterTools();

    document.querySelectorAll(`.${COMMENT_HOST_CLASS}`).forEach((el) => {
      el.classList.remove(COMMENT_HOST_CLASS);
    });

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
    const nickEl =
      writer.querySelector(':scope > .nickname em') ||
      writer.querySelector('.nickname em');

    const fallback =
      writer.querySelector(':scope > .nickname') ||
      writer.querySelector('.nickname');

    const txt = nickEl ? nickEl.textContent : (fallback ? fallback.textContent : '');
    return sanitizeText(txt, 60) || '알 수 없음';
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
    const ip = uid ? '' : extractIp(writer);
    const nickname = extractNickname(writer);

    if (isMiniGalleryPage() && !isMiniMemoTarget(writer)) {
      return null;
    }

    let key = '';
    if (uid) key = `uid:${uid}`;
    else if (ip) key = `ip:${ip}`;
    else if (!isMiniGalleryPage() && nickname) key = `nick:${nickname}`;

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

  function createTrigger() {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = TRIGGER_CLASS;

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
    const listMode = isListWriter(writer);

    btn.dataset.memoKey = meta.key;
    btn.dataset.memoUid = meta.uid || '';
    btn.dataset.memoIp = meta.ip || '';
    btn.dataset.memoNickname = meta.nickname || '';
    btn.dataset.loc = listMode ? 'list' : '';

    const saved = memoMap[meta.key];

    btn.classList.toggle('has-memo', !!saved);
    btn.classList.toggle('is-list', listMode);

    if (saved && saved.memo) {
      const color = isValidColor(saved.color) ? saved.color : DEFAULT_COLOR;

      btn.textContent = saved.memo;
      btn.title = saved.memo;
      btn.setAttribute('aria-label', `이용자 메모: ${saved.memo}`);
      btn.style.color = color;
      btn.style.borderColor = `${color}4d`;
      btn.style.background = `${color}14`;
    } else {
      btn.textContent = listMode ? '메모' : '메모 추가';
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
    }

    cleanupEmptySlots();
    cleanupEmptyWriterTools();
  }

  function ensureWriterTools(writer) {
    writer.classList.add(WRITER_ENHANCED_CLASS);

    let tools = writer.querySelector(`:scope > .${WRITER_TOOLS_CLASS}`);
    if (!tools) {
      tools = document.createElement("span");
      tools.className = WRITER_TOOLS_CLASS;
    }

    const listMode = isListWriter(writer);
    const addbox = writer.querySelector(":scope > .addbox");
    const nikcon = writer.querySelector(":scope > .writer_nikcon");
    const nick = writer.querySelector(":scope > .nickname");

    if (listMode && addbox) {
      if (addbox.nextSibling !== tools) {
        addbox.insertAdjacentElement("afterend", tools);
      }
      return tools;
    }

    if (nikcon) {
      if (nikcon.nextSibling !== tools) {
        nikcon.insertAdjacentElement("afterend", tools);
      }
    } else if (nick) {
      if (nick.nextSibling !== tools) {
        nick.insertAdjacentElement("afterend", tools);
      }
    } else if (addbox) {
      if (addbox.nextSibling !== tools) {
        addbox.insertAdjacentElement("afterend", tools);
      }
    } else if (tools.parentElement !== writer) {
      writer.appendChild(tools);
    }

    return tools;
  }

  function placeTriggerInline(writer, btn) {
    const tools = ensureWriterTools(writer);
    const uidBadge = tools.querySelector(`.${UID_BADGE_CLASS}`);

    if (uidBadge) {
      if (uidBadge.nextSibling !== btn) {
        uidBadge.insertAdjacentElement("afterend", btn);
      }
      return;
    }

    if (btn.parentElement !== tools) {
      tools.appendChild(btn);
    }
  }

  function placeTrigger(writer, btn) {
    placeTriggerInline(writer, btn);
  }

  function renderWriter(writer) {
    if (!(writer instanceof Element)) return;

    if (!enabled) {
      removeTriggerForWriter(writer);
      return;
    }

    const meta = getWriterMeta(writer);
    if (!meta) {
      removeTriggerForWriter(writer);
      return;
    }

    let btn =
      writer.querySelector(`:scope > .${WRITER_TOOLS_CLASS} > .${TRIGGER_CLASS}`) ||
      writer.querySelector(`:scope > .${TRIGGER_CLASS}`);

    if (!btn) {
      const slot = getExistingCommentSlot(writer);
      btn = slot?.querySelector(`.${TRIGGER_CLASS}`) || null;
    }

    btn = btn || createTrigger();

    updateTrigger(btn, meta, writer);
    placeTrigger(writer, btn);
  }

  function renderAll() {
    if (!enabled) {
      removeInjectedUi();
      return;
    }

    ensureStyle();
    ensureModal();

    document.querySelectorAll('.gall_writer').forEach(renderWriter);

    cleanupEmptySlots();
    cleanupEmptyWriterTools();
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
        node.classList?.contains(SLOT_CLASS) ||
        node.classList?.contains(WRITER_TOOLS_CLASS) ||
        node.closest?.(`#${MODAL_ID}`) ||
        node.closest?.(`.${TRIGGER_CLASS}`) ||
        node.closest?.(`.${SLOT_CLASS}`) ||
        node.closest?.(`.${WRITER_TOOLS_CLASS}`)
      )
    );
  }

  function shouldReactToMutations(mutations) {
    for (const m of mutations) {
      if (isOurNode(m.target)) continue;

      for (const n of m.addedNodes) {
        if (isOurNode(n)) continue;
        if (n.nodeType === 1) {
          if (n.matches?.('.gall_writer') || n.querySelector?.('.gall_writer')) return true;
        }
      }

      for (const n of m.removedNodes) {
        if (isOurNode(n)) continue;
        if (n.nodeType === 1) {
          if (n.matches?.('.gall_writer') || n.querySelector?.('.gall_writer')) return true;
        }
      }
    }

    return false;
  }

  function initObserver() {
    if (!document.body || observer) return;

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
      if (area === 'sync' && changes.userMemoEnabled) {
        enabled = !!changes.userMemoEnabled.newValue;
        renderAll();
      }

      if (area === 'local' && changes.userMemos) {
        memoMap = changes.userMemos.newValue || {};
        renderAll();
      }
    });
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeModal();
  }, true);

  function boot() {
    initStorage();
    renderAll();
    initObserver();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();

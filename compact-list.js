// compact-list.js
(() => {
  const STORAGE_KEY = "compactListEnabled";
  const ROOT_CLASS = "dcb-compact-list-mode";
  const STYLE_ID = "dcb-compact-list-style";

  const DEFAULTS = {
    [STORAGE_KEY]: false
  };

  let enabled = false;

  function isGalleryListPage() {
    return /^\/(?:board|mgallery\/board|mini\/board|person\/board)\/lists(?:\/|$)/.test(location.pathname);
  }

  function ensureStyle() {
    let st = document.getElementById(STYLE_ID);
    if (st) return st;

    st = document.createElement("style");
    st.id = STYLE_ID;
    st.textContent = `
      /*
        Compact List Mode

        목표:
        - 켰을 때 바로 체감될 정도로 게시물 목록 간격 감소
        - 본문/댓글/메모 모달에는 영향 없음
        - 닉네임 옆 디시 기본 마크는 절대 자르지 않음
        - 메모 버튼은 목록에서 아이콘형으로 압축
      */

      html.${ROOT_CLASS} .gall_list tbody tr > td {
        padding-top:1px !important;
        padding-bottom:1px !important;
        height:auto !important;
      }

      html.${ROOT_CLASS} .gall_list tbody tr.ub-content > td {
        padding-top:1px !important;
        padding-bottom:1px !important;
        height:auto !important;
      }

      html.${ROOT_CLASS} .gall_list tbody tr .gall_tit,
      html.${ROOT_CLASS} .gall_list tbody tr .gall_tit a,
      html.${ROOT_CLASS} .gall_list tbody tr .gall_writer,
      html.${ROOT_CLASS} .gall_list tbody tr .nickname,
      html.${ROOT_CLASS} .gall_list tbody tr .gall_date,
      html.${ROOT_CLASS} .gall_list tbody tr .gall_count,
      html.${ROOT_CLASS} .gall_list tbody tr .gall_recommend {
        line-height:1.18 !important;
      }

      /*
        작성자 칸:
        addbox는 디시 기본 마크 보호 때문에 18px 유지.
        tools 줄만 13px로 강하게 압축.
      */

      html.${ROOT_CLASS} .gall_list td.gall_writer.dcb-writer-enhanced,
      html.${ROOT_CLASS} td.gall_writer.ub-writer.dcb-writer-enhanced[data-loc="list"]{
        line-height:1.05 !important;
        padding-top:1px !important;
        padding-bottom:1px !important;
        overflow:visible !important;
      }

      html.${ROOT_CLASS} .gall_list td.gall_writer.dcb-writer-enhanced .addbox,
      html.${ROOT_CLASS} td.gall_writer.ub-writer.dcb-writer-enhanced[data-loc="list"] .addbox{
        min-height:18px !important;
        height:18px !important;
        line-height:18px !important;
        overflow:visible !important;
      }

      html.${ROOT_CLASS} .gall_list td.gall_writer.dcb-writer-enhanced .addbox img,
      html.${ROOT_CLASS} td.gall_writer.ub-writer.dcb-writer-enhanced[data-loc="list"] .addbox img,
      html.${ROOT_CLASS} .gall_list td.gall_writer.dcb-writer-enhanced .writer_nikcon img,
      html.${ROOT_CLASS} td.gall_writer.ub-writer.dcb-writer-enhanced[data-loc="list"] .writer_nikcon img{
        max-width:18px !important;
        max-height:18px !important;
        object-fit:contain !important;
      }

      html.${ROOT_CLASS} .gall_list td.gall_writer.dcb-writer-enhanced > .dcb-writer-tools,
      html.${ROOT_CLASS} td.gall_writer.ub-writer.dcb-writer-enhanced[data-loc="list"] > .dcb-writer-tools{
        height:13px !important;
        line-height:13px !important;
        margin-top:-1px !important;
        gap:2px !important;
        overflow:hidden !important;
      }

      html.${ROOT_CLASS} .gall_list td.gall_writer.dcb-writer-enhanced .dcb-uid-badge,
      html.${ROOT_CLASS} td.gall_writer.ub-writer.dcb-writer-enhanced[data-loc="list"] .dcb-uid-badge{
        max-width:50px !important;
        height:13px !important;
        line-height:12px !important;
        padding:0 3px !important;
        font-size:9px !important;
        border-radius:7px !important;
      }

      /*
        컴팩트 ON에서는 메모 버튼을 아이콘형으로 전환.
        버튼 title/aria-label은 user-memo.js에서 유지하므로 정보는 보존된다.
      */

      html.${ROOT_CLASS} .gall_list td.gall_writer.dcb-writer-enhanced .dcb-user-memo-trigger,
      html.${ROOT_CLASS} td.gall_writer.ub-writer.dcb-writer-enhanced[data-loc="list"] .dcb-user-memo-trigger{
        width:20px !important;
        max-width:20px !important;
        min-width:20px !important;
        height:13px !important;
        min-height:13px !important;
        max-height:13px !important;
        padding:0 !important;
        justify-content:center !important;
        align-items:center !important;
        font-size:0 !important;
        line-height:13px !important;
        gap:0 !important;
        border-radius:999px !important;
        overflow:hidden !important;
      }

      html.${ROOT_CLASS} .gall_list td.gall_writer.dcb-writer-enhanced .dcb-user-memo-trigger::before,
      html.${ROOT_CLASS} td.gall_writer.ub-writer.dcb-writer-enhanced[data-loc="list"] .dcb-user-memo-trigger::before{
        width:4px !important;
        height:4px !important;
        flex:0 0 4px !important;
        margin:0 !important;
      }

      html.${ROOT_CLASS} .gall_list td.gall_writer.dcb-writer-enhanced .dcb-user-memo-trigger::after,
      html.${ROOT_CLASS} td.gall_writer.ub-writer.dcb-writer-enhanced[data-loc="list"] .dcb-user-memo-trigger::after{
        content:"✎" !important;
        display:inline-block !important;
        margin-left:2px !important;
        font-size:9px !important;
        line-height:1 !important;
      }

      html.${ROOT_CLASS} .gall_list .reply_num,
      html.${ROOT_CLASS} .gall_list .icon_img,
      html.${ROOT_CLASS} .gall_list .sp_img,
      html.${ROOT_CLASS} .gall_list .mini_img {
        vertical-align:middle !important;
      }

      @media (max-width:640px){
        html.${ROOT_CLASS} .gall_list tbody tr > td {
          padding-top:1px !important;
          padding-bottom:1px !important;
        }

        html.${ROOT_CLASS} .gall_list tbody tr .gall_tit,
        html.${ROOT_CLASS} .gall_list tbody tr .gall_tit a,
        html.${ROOT_CLASS} .gall_list tbody tr .gall_writer,
        html.${ROOT_CLASS} .gall_list tbody tr .nickname {
          line-height:1.15 !important;
        }

        html.${ROOT_CLASS} .gall_list td.gall_writer.dcb-writer-enhanced .dcb-uid-badge,
        html.${ROOT_CLASS} td.gall_writer.ub-writer.dcb-writer-enhanced[data-loc="list"] .dcb-uid-badge{
          max-width:46px !important;
          font-size:8.8px !important;
        }

        html.${ROOT_CLASS} .gall_list td.gall_writer.dcb-writer-enhanced .dcb-user-memo-trigger,
        html.${ROOT_CLASS} td.gall_writer.ub-writer.dcb-writer-enhanced[data-loc="list"] .dcb-user-memo-trigger{
          width:19px !important;
          max-width:19px !important;
          min-width:19px !important;
        }
      }
    `;

    (document.head || document.documentElement).appendChild(st);
    return st;
  }

  function applyCompactMode() {
    ensureStyle();

    const shouldEnable = enabled && isGalleryListPage();
    document.documentElement.classList.toggle(ROOT_CLASS, shouldEnable);
  }

  function loadSetting() {
    try {
      chrome.storage.sync.get(DEFAULTS, (conf) => {
        enabled = !!conf[STORAGE_KEY];
        applyCompactMode();
      });
    } catch (e) {
      enabled = false;
      applyCompactMode();
    }
  }

  function bindStorageChange() {
    try {
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== "sync") return;
        if (!changes[STORAGE_KEY]) return;

        enabled = !!changes[STORAGE_KEY].newValue;
        applyCompactMode();
      });
    } catch (e) {}
  }

  function boot() {
    loadSetting();
    bindStorageChange();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
})();
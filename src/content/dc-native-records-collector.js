// Read only, explicitly injected from the records import screen. No site storage,
// network, cookies, page function calls, or automatic modal/tab changes.
// Selectors are based on the public PC templates and user_block.js (261106-2)
// and UserMemo's public render code. A populated signed-in UI remains a release
// verification requirement; this deliberately reports partial DOM coverage.
(() => {
  async function collectPage() {
  "use strict";
  const MAX_RECORDS = 10000, MAX_BYTES = 4 * 1024 * 1024;
  const kinds = { word: "keyword", id: "uid", nick: "nick", ip: "ip" };
  const visible = node => !!node && !node.hidden && getComputedStyle(node).display !== "none" &&
    getComputedStyle(node).visibility !== "hidden" && !node.closest('[hidden]');
  const one = (root, selector) => {
    const nodes = root.querySelectorAll(selector);
    return nodes.length === 1 ? nodes[0] : null;
  };
  function galleryScope(id, type) {
    const suffix = String(id || "").match(/\^(MI|PR)$/);
    const nativeType = String(type || "");
    const normalizedType = ({G:"G",M:"M",MI:"MI",PR:"PR",gall:"G",mgall:"M",migall:"MI",prgall:"PR"})[nativeType] || "unknown";
    if (suffix && suffix[1] !== normalizedType) return null;
    id = String(id || "").replace(/\^(?:MI|PR)$/, "");
    if (!/^[a-z0-9_]{1,80}$/i.test(id)) return null;
    return { scope: "gallery", galleryId: id, galleryType: normalizedType };
  }
  function colorValue(element) {
    const value = element.style.getPropertyValue("color").trim();
    if (/^#[a-f\d]{6}$/i.test(value)) return value;
    const rgb = value.match(/^rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/i);
    if (rgb && rgb.slice(1).every(n => Number(n) <= 255)) {
      return "#" + rgb.slice(1).map(n => Number(n).toString(16).padStart(2, "0")).join("");
    }
    return value; // Unknown colors are reviewed by normalization, never invented.
  }
  function snapshot() {
    const records = [], issues = [];
    const coverage = { blocks: "not-open", memos: "not-open", galleries: "selected-only", complete: false,
      validation: "public-templates-only" };
    const issue = (code, message, count = 1) => issues.push({ code, message, count });
    const add = record => {
      if (records.length >= MAX_RECORDS) throw Error("한 번에 10,000건까지 읽을 수 있습니다. 목록을 나누어 확인하세요.");
      records.push({ ...record, source: "dc-native" });
    };
    const block = document.getElementById("user_block");
    if (visible(block)) {
      coverage.blocks = "open-dom";
      for (const [selector, scope] of [[".all_setting", {scope:"global",galleryId:"",galleryType:""}],
        [".part_setting", null]]) {
        const panel = one(block, selector);
        if (!panel) { issue("BLOCK_PANEL_CHANGED", "차단 설정 패널 구조를 확인할 수 없어 해당 범위를 보류했습니다."); continue; }
        const selected = one(panel, "#sel_gall_name");
        const recordScope = scope || (selected && galleryScope(selected.getAttribute("data-id"), selected.getAttribute("data-gtype")));
        if (!recordScope) { issue("GALLERY_SCOPE_UNKNOWN", "선택 갤러리 ID와 종류를 확인할 수 없어 갤러리별 목록을 보류했습니다."); continue; }
        const toggle = one(panel, ".setting_onoff button");
        const stateText = toggle?.querySelector(".blind")?.textContent.trim().toLowerCase();
        const enabled = toggle && ((stateText === "on" && toggle.classList.contains("on")) ||
          (stateText === "off" && !toggle.classList.contains("on"))) ? stateText === "on" : null;
        if (enabled === null) issue("BLOCK_STATE_UNKNOWN", "차단 활성 상태를 확인할 수 없어 해당 규칙은 적용하지 않습니다.");
        for (const [nativeTargetType, targetType] of Object.entries(kinds)) {
          const input = one(panel, 'input[name="' + nativeTargetType + '"]');
          const container = input?.closest(".set_cont");
          const list = container && one(container, "ul.block_list.word");
          if (!input || !list || !panel.contains(container)) {
            issue("BLOCK_TYPE_CHANGED", "차단 유형 " + nativeTargetType + "의 목록 구조를 확인할 수 없습니다."); continue;
          }
          for (const row of list.children) {
            const valueNode = one(row, ".block_word");
            if (row.tagName !== "LI" || !valueNode || !valueNode.textContent.trim()) {
              issue("BLOCK_ROW_CHANGED", "값을 확실히 구분할 수 없는 차단 행을 보류했습니다."); continue;
            }
            add({kind:"block",...recordScope,enabled,targetType,nativeTargetType,value:valueNode.textContent,
              ...(targetType === "uid" ? {identityVerified:true} : {})});
          }
        }
      }
      if (block.querySelector(".block_list.gall li")) issue("OTHER_GALLERIES_NOT_READ",
        "갤러리별 목록은 현재 선택한 갤러리만 읽었습니다. 다른 갤러리를 선택한 뒤 다시 수집하세요.");
    }
    const memo = document.getElementById("user_memo_config");
    if (visible(memo)) {
      coverage.memos = "open-dom";
      const tab = one(memo, ".tab_menubox button.on");
      const galleryType = location.pathname.startsWith("/mgallery/") ? "M" :
        location.pathname.startsWith("/mini/") ? "MI" : location.pathname.startsWith("/person/") ? "PR" : "G";
      const scope = tab && (tab.classList.contains("all") ? {scope:"global",galleryId:"",galleryType:""} :
        galleryScope(document.getElementById("gallery_id")?.value, galleryType));
      const list = one(memo, "#user_memo_table ul.memo_list");
      if (!scope || !list) issue("MEMO_SCOPE_UNKNOWN", "메모 범위 또는 목록 구조를 확인할 수 없습니다. 공식 메모 백업을 이용하세요.");
      else {
        const rows = [...list.children].filter(node => !node.classList.contains("empty_box"));
        const countText = memo.querySelector(".user_memo_count")?.textContent.trim().replace(/,/g, "");
        if (!/^\d+$/.test(countText || "") || Number(countText) !== rows.length) {
          issue("MEMO_COUNT_MISMATCH", "메모 표시 건수와 렌더링된 행 수가 달라 메모 수집을 보류했습니다. 로딩 후 다시 시도하세요.", rows.length || 1);
        } else for (const row of rows) {
          const identity = one(row, ".nik"), body = one(row, ".mone"), checkbox = one(row, "input.chk_um_list");
          const value = identity?.textContent, text = body?.textContent;
          if (row.tagName !== "LI" || !identity || !body || !checkbox || !value?.trim() ||
              !text?.startsWith("-") || checkbox.value !== value + text) {
            issue("MEMO_ROW_CHANGED", "식별자와 본문을 확실히 구분할 수 없는 메모 행을 보류했습니다."); continue;
          }
          const isUid = identity.classList.contains("icon");
          add({kind:"memo",...scope,enabled:true,targetType:isUid?"uid":"ip",nativeTargetType:isUid?"pcode":"ip",
            value,memo:text.slice(1),color:colorValue(body),...(isUid?{identityVerified:true}:{})});
        }
        if (memo.querySelector("#user_memo_search .int")?.value.trim()) {
          coverage.memos = "filtered-dom";
          issue("MEMO_SEARCH_FILTERED", "현재 메모 검색 결과만 읽었습니다. 전체 목록을 읽으려면 사이트에서 검색을 해제하세요.");
        }
      }
      issue("OTHER_MEMO_SCOPES_NOT_READ", "메모는 현재 선택한 범위만 읽었습니다. 전체/현재 갤러리 탭을 바꾼 뒤 다시 수집할 수 있습니다.");
    }
    for (const modal of [block, memo].filter(visible)) {
      if ([...modal.querySelectorAll('.paging, .pagination, [aria-label*="페이지"], [data-page]')].some(visible)) {
        issue("PAGINATION_PRESENT", "페이지 나누기가 감지되어 현재 DOM의 항목만 읽었습니다. 다음 페이지는 사이트에서 직접 확인하세요.");
      }
    }
    if (coverage.blocks === "not-open" && coverage.memos === "not-open") {
      issue("MODAL_NOT_OPEN", "디시 페이지에서 차단 설정 또는 이용자 메모 목록을 직접 연 뒤 다시 불러오세요.");
    } else if (!records.length) issue("EMPTY_DOM_ONLY", "현재 열린 DOM에서 읽을 수 있는 항목이 없습니다. 서버나 다른 범위의 목록이 비었다는 뜻은 아닙니다.");
    issue("LIVE_ACCOUNT_UNVERIFIED", "공개 PC 템플릿 기반 수집입니다. 로그인된 실제 등록 목록과 전체 범위의 완전성은 확인되지 않았습니다.");
    return {ok:coverage.blocks !== "not-open" || coverage.memos !== "not-open",source:"dc-native",href:location.href,
      records,issues,coverage};
  }
  async function collect() {
    const href = location.href;
    const failure = message => ({ok:false,source:"dc-native",href,records:[],issues:[{code:"COLLECTION_UNAVAILABLE",message,count:1}],
      coverage:{complete:false},collectedAt:Date.now()});
    if (!/^https?:$/.test(location.protocol) || location.hostname !== "gall.dcinside.com" || window.top !== window) {
      return failure("PC 디시 갤러리의 최상위 페이지에서만 목록을 읽을 수 있습니다.");
    }
    try {
      const first = snapshot();
      // Two read snapshots catch in-flight rendering; no observers or site writes.
      await new Promise(resolve => setTimeout(resolve, 60));
      const second = snapshot();
      if (location.href !== href || JSON.stringify(first) !== JSON.stringify(second)) {
        return failure("목록 또는 페이지가 수집 중 변경되었습니다. 사이트 로딩이 끝난 뒤 다시 시도하세요.");
      }
      if (new TextEncoder().encode(JSON.stringify(second)).byteLength > MAX_BYTES) return failure("읽은 목록이 4MB를 넘습니다. 범위를 나누어 수집하세요.");
      return {...second,collectedAt:Date.now()};
    } catch (error) { return failure(error.message || "목록을 읽지 못했습니다."); }
  }
    return collect();
  }
  // This function contains its helpers so one function injection works in both
  // engines without relying on globals shared with another injection.
  globalThis.DCBNativeCollector = Object.freeze({ collect: collectPage });
})();

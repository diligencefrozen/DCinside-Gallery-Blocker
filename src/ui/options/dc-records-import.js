(() => {
  const el = id => document.getElementById(id);
  const file = el("officialMemoFile"), format = el("memoImportFormat"), scope = el("memoTextScope");
  const kind = el("recordsKind"), paste = el("recordsPaste"), confirm = el("recordsConfirm");
  const status = el("officialMemoPreview"), list = el("officialMemoRows"), more = el("recordsMore");
  const apply = el("officialMemoApply"), undo = el("officialMemoUndo"), replace = el("officialMemoReplace");
  const scopeChoice = el("recordsScope"), reset = el("recordsReset");
  const nativeTab = el("recordsNativeTab"), nativeStatus = el("recordsNativeStatus");
  const nativeControls = ["recordsNativeAuto", "recordsNativeStart", "recordsNativeRefresh", "recordsNativeOpen", "recordsNativeFocus", "recordsNativeRead"].map(el);
  let revision = 0, pending, labels = [], offset = 0, busy = false, inputTimer;
  let nativeSource = null, tabRevision = 0;
  let autoCancelled = false, autoTabId = null;
  function updateMode() {
    const text = format.value === "text", block = kind.value === "block";
    el("memoScopeLabel").hidden = !text;
    el("recordsFileField").hidden = format.value !== "web";
    el("recordsNativeField").hidden = format.value !== "native";
    el("recordsScopeField").hidden = block;
    el("recordsBlockScope").hidden = kind.value === "memo";
    el("recordsReplaceLabel").hidden = text && block;
    el("recordsMergeHelp").hidden = text && block;
    el("recordsGalleryField").hidden = scopeChoice.value !== "gallery";
    el("recordsGalleryHelp").hidden = scopeChoice.value !== "gallery";
    el("recordsInputHelp").textContent = block
      ? "한 줄에 차단 대상 하나를 붙여넣으세요. 식별자-설명 형식은 앞의 식별자를 차단하고 설명은 메모로 저장하지 않습니다."
      : kind.value === "memo" ? "식별자-메모 형식의 목록을 붙여넣으세요. 이 모드에서는 차단 기록을 만들지 않습니다."
      : "설명이 있는 행은 메모로, 단독 이름·IP·uid: 행은 차단 후보로 나눕니다. 적용 전 결과를 꼭 확인하세요.";
  }
  const selectedScope = () => kind.value === "block" || scopeChoice.value === "global" ? "global" : scope.value.trim();
  const scopeLabel = value => value === "global" ? "모든 갤러리" : "갤러리: " + value;
  function blockLabel(token) {
    if (token.startsWith("nick-exact:")) return "닉네임 정확 일치: " + token.slice(11);
    if (/^\d+\.\d+$/.test(token)) return "IP 앞 두 자리: " + token;
    return "회원 ID: " + token;
  }

  function updateButtons() {
    const hasBlocks = pending && (pending.blocks.length || pending.keywords?.length);
    apply.disabled = busy || !pending || !(pending.entries.size || hasBlocks) || (hasBlocks && !confirm.checked);
    undo.disabled = busy;
  }
  function nextPage() {
    const fragment = document.createDocumentFragment();
    for (const label of labels.slice(offset, offset + 100)) {
      const li = document.createElement("li");
      li.textContent = label;
      fragment.append(li);
    }
    offset += 100;
    list.replaceChildren(fragment);
    more.hidden = offset >= labels.length;
  }
  async function preview() {
    clearTimeout(inputTimer);
    const version = ++revision;
    const textMode = format.value === "text";
    updateMode();
    el("recordsConfirmLabel").hidden = true;
    confirm.checked = replace.checked = false;
    pending = null;
    labels = [];
    offset = 0;
    nextPage();
    updateButtons();
    status.textContent = "목록을 붙여넣거나 파일을 선택하면 분류 결과가 여기에 표시됩니다.";
    try {
      if (format.value === "native") {
        status.textContent = "‘디시 차단·메모 자동 불러오기’를 누르면 목록을 확인해 미리보기를 만듭니다.";
        if (!nativeSource) return;
        await previewNative(version);
        return;
      }
      const input = file.files[0];
      if (input?.size > 4194304) throw Error("4MB 이하의 파일을 선택하세요.");
      const text = (textMode && paste.value) || (input && await input.text());
      if (!text) return;
      const result = textMode ? DCBOfficialMemos.parseRecords(text, selectedScope(), kind.value)
        : { ...DCBOfficialMemos.parse(text), blocks: [] };
      const [memos, tokens] = await Promise.all([getUserMemos(), getStoredUidList()]);
      if (revision !== version) return;
      const stored = new Set(tokens.map(DCBUserBlockStore.makeBlockKey));
      let conflicts = 0, duplicates = result.duplicates;
      for (const [key, item] of result.entries) {
        const exists = Object.hasOwn(memos, key);
        if (exists) conflicts++;
        labels.push(["메모", scopeLabel(item.scope), item.value, item.memo, exists ? "기존 메모 있음" : ""].filter(Boolean).join(" · "));
      }
      for (const token of result.blocks) {
        const exists = stored.has(DCBUserBlockStore.makeBlockKey(token));
        if (exists) duplicates++;
        labels.push("모든 갤러리 차단 · " + blockLabel(token) + (exists ? " · 이미 차단됨" : ""));
      }
      offset = 0;
      nextPage();
      el("recordsConfirmLabel").hidden = !result.blocks.length;
      status.textContent = "메모 " + result.entries.size + "건 · 차단 " + result.blocks.length + "건 · 충돌 " + conflicts +
        "건 · 중복 " + duplicates + "건 · 잘못된 항목 " + result.invalid + "건";
      if (result.badLines?.length) status.textContent += " · 확인할 줄 " + result.badLines.slice(0, 30).join(", ");
      pending = result;
      updateButtons();
    } catch (error) { if (revision === version) status.textContent = "가져오기 실패 · " + error.message; }
  }

  async function previewNative(version) {
    const plan = DCBUserBlockStore.planNativeRecords(nativeSource.records);
    const [memos, tokens, keywordData] = await Promise.all([
      getUserMemos(), getStoredUidList(), chrome.storage.sync.get({ blockedKeywords: [] })
    ]);
    if (revision !== version) return;
    const stored = new Set(tokens.map(DCBUserBlockStore.makeBlockKey));
    const keywords = new Set(keywordData.blockedKeywords.map(value => String(value).normalize("NFKC").toLowerCase()));
    let conflicts = 0, duplicates = plan.duplicates;
    const typeNames = { keyword: "차단 단어", uid: "회원 식별자", id: "식별 코드", nick: "닉네임", ip: "IP" };
    const galleryTypes = {G:"일반",M:"마이너",MI:"미니",PR:"인물"};
    for (const row of plan.rows) {
      const record = row.record;
      let exists = false, conflict = false;
      if (row.status === "applicable") {
        if (record.kind === "memo") {
          const key = row.memoKey;
          if (Object.hasOwn(memos, key)) {
            conflict = memos[key]?.memo !== record.memo || memos[key]?.color !== record.color;
            exists = !conflict;
          }
        } else if (record.targetType === "keyword") exists = keywords.has(row.keyword.normalize("NFKC").toLowerCase());
        else exists = stored.has(DCBUserBlockStore.makeBlockKey(row.token));
      }
      if (exists) duplicates++;
      if (conflict) conflicts++;
      if (row.status === "duplicate" && row.reason.includes("충돌")) conflicts++;
      labels.push([
        record.scope === "gallery" ? "갤러리: " + record.galleryId + " (" + (galleryTypes[record.galleryType] || "종류 미확인") + ")" : record.scope === "global" ? "모든 갤러리" : "범위 미확인",
        record.kind === "memo" ? "메모" : "차단", typeNames[record.targetType] || "유형 미확인", record.value,
        record.memo, record.color, record.enabled === true ? "디시 ON" : record.enabled === false ? "디시 OFF" : "상태 미확인",
        row.status === "held" ? "보류: " + row.reason : row.status === "duplicate" ? "중복: " + row.reason : conflict ? "충돌 · 기본 유지" : exists ? "기존 중복" : "적용 가능"
      ].filter(Boolean).join(" · "));
    }
    labels.push(...(nativeSource.issues || []).map(issue => "수집 참고 · " + (typeof issue === "string" ? issue : issue.message || issue.reason || JSON.stringify(issue))));
    offset = 0;
    nextPage();
    const applicable = plan.rows.filter(row => row.status === "applicable").length;
    status.textContent = "적용 가능 " + applicable + "건 · 보류 " + plan.held.length + "건 · 충돌 " + conflicts + "건 · 중복 " + duplicates +
      "건 · 메모 " + plan.memos.length + "건 · 이용자 차단 " + plan.tokens.length + "건 · 차단 단어 " + plan.keywords.length + "건";
    el("recordsConfirmLabel").hidden = !(plan.tokens.length || plan.keywords.length);
    pending = { entries: new Map(plan.memos), blocks: plan.tokens, keywords: plan.keywords, nativeRecords: nativeSource.records };
    updateButtons();
  }

  function validNativeUrl(value) {
    try { const url = new URL(value); return ["https:", "http:"].includes(url.protocol) && url.hostname === "gall.dcinside.com"; }
    catch { return false; }
  }
  function nativeTabLabel(tab) {
    const url = new URL(tab.url), gallery = url.searchParams.get("id");
    return (tab.title || "디시 페이지").slice(0, 100) + " · " + url.pathname + (gallery ? " · id=" + gallery : "");
  }
  async function refreshNativeTabs(preferredTabId) {
    const version = ++tabRevision;
    nativeSource = null;
    if (!busy) el("recordsNativeProgressField").hidden = true;
    await preview();
    try {
      const tabs = (await chrome.tabs.query({ url: ["https://gall.dcinside.com/*", "http://gall.dcinside.com/*"] })).filter(tab => validNativeUrl(tab.url));
      // tabs.create resolves before navigation commits. URL-filtered query may
      // omit the new tab until then; include only its verified DC destination.
      if (typeof preferredTabId === "number" && !tabs.some(tab => tab.id === preferredTabId)) {
        const created = await chrome.tabs.get(preferredTabId);
        const destination = validNativeUrl(created.url) ? created.url : created.pendingUrl;
        if (validNativeUrl(destination)) tabs.push({ ...created, url: destination });
      }
      if (version !== tabRevision) return;
      const selected = typeof preferredTabId === "number" ? String(preferredTabId) : nativeTab.value;
      const choices = tabs.map(tab => {
        const option = document.createElement("option"); option.value = tab.id;
        option.textContent = nativeTabLabel(tab);
        return option;
      });
      if (tabs.length !== 1) {
        const placeholder = document.createElement("option"); placeholder.value = "";
        placeholder.textContent = tabs.length ? "목록 창을 연 디시 페이지를 선택하세요" : "열린 디시 PC 갤러리 페이지가 없습니다";
        choices.unshift(placeholder);
      }
      nativeTab.replaceChildren(...choices);
      if (tabs.some(tab => String(tab.id) === selected)) nativeTab.value = selected;
      nativeStatus.textContent = tabs.length ? "디시 페이지로 이동 → 설정 → 차단 설정 또는 이용자 메모에서 목록 창 열기 → 이 화면으로 돌아와 목록 읽기 순서로 진행하세요." : "열린 디시 PC 갤러리 페이지가 없습니다. 디시 PC웹을 열어 설정 목록을 확인하세요.";
    } catch (error) { nativeStatus.textContent = "페이지 조회 실패 · " + error.message; }
  }
  async function enterNative() {
    format.value = "native"; paste.value = file.value = ""; nativeSource = null;
    await preview(); await refreshNativeTabs();
  }
  async function autoImportNative() {
    if (busy) return;
    busy = true; autoCancelled = false; nativeSource = null;
    format.value = "native"; paste.value = file.value = "";
    el("recordsNativeManual").open = false;
    setControlsDisabled(true);
    await preview();
    const field = el("recordsNativeProgressField"), progress = el("recordsNativeProgress"), label = el("recordsNativeProgressText");
    field.hidden = false; field.setAttribute("aria-busy", "true");
    el("recordsNativeCancel").hidden = false;
    const check = () => { if (autoCancelled) throw Error("IMPORT_CANCELLED"); };
    const step = (value, message) => { check(); progress.value = value; label.textContent = message; };
    try {
      step(5, "불러오는 중입니다. 잠시만 기다려 주세요. 디시 기록에 연결하고 있습니다…");
      const tab = await chrome.tabs.create({url:"https://gall.dcinside.com/_js/crossDomainStorage.html",active:false});
      autoTabId = tab.id;
      const deadline = Date.now() + 15000;
      let ready = false;
      while (Date.now() < deadline) {
        check();
        const current = await chrome.tabs.get(autoTabId);
        if (current.status === "complete" && current.url === "https://gall.dcinside.com/_js/crossDomainStorage.html") {
          ready = true; break;
        }
        // Firefox may report an initial complete about:blank before the new
        // tab's requested navigation starts. It is never a readable source.
        if (current.status === "complete" && current.url && !/^about:(?:blank|newtab)$/.test(current.url) &&
            current.url !== "https://gall.dcinside.com/_js/crossDomainStorage.html" &&
            current.pendingUrl !== "https://gall.dcinside.com/_js/crossDomainStorage.html")
          throw Error("디시 기록 페이지의 출처를 확인할 수 없습니다.");
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      if (!ready) throw Error("디시 연결 시간이 초과되었습니다. 잠시 후 다시 불러오세요.");
      step(30, "이 브라우저의 디시 차단·메모를 읽고 있습니다…");
      const result = await chrome.scripting.executeScript({target:{tabId:autoTabId,frameIds:[0]},func:DCBNativeAuto.read,world:"ISOLATED"});
      if (result.some(item => item.error)) throw Error("디시 기록을 읽지 못했습니다. 브라우저의 사이트 접근 권한을 확인하세요.");
      const snapshot = result.find(item => item.frameId === 0)?.result;
      const current = await chrome.tabs.get(autoTabId);
      if (snapshot?.href !== current.url || current.url !== "https://gall.dcinside.com/_js/crossDomainStorage.html") throw Error("수집 중 디시 페이지가 이동했습니다. 다시 불러오세요.");
      step(40, "등록된 갤러리들의 차단·메모를 확인하고 있습니다…");
      const collected = await DCBNativeRecords.parse(snapshot, state => step(40 + Math.round(45 * state.completed / state.total),
        "등록 범위 " + state.completed + "/" + state.total + " 확인 · 갤러리 " + state.galleries + "개 · 기록 " + state.records + "건"));
      step(90, "중복·충돌과 적용 범위를 확인하고 있습니다…");
      nativeSource = collected;
      await preview();
      if (!pending) throw Error("미리보기를 만들지 못했습니다. 기존 기록 상태를 확인한 뒤 다시 불러오세요.");
      step(100, "불러오기 완료 · 갤러리 " + collected.coverage.galleries + "개 · 기록 " + collected.records.length + "건. " +
        (collected.coverage.complete ? "" : "일부 범위의 구조를 확인하지 못했습니다. ") + "아래 미리보기와 보류 사유를 확인해 주세요.");
    } catch (error) {
      nativeSource = null; pending = null;
      label.textContent = error.message === "IMPORT_CANCELLED" ? "불러오기를 중지했습니다. 기존 기록은 유지됩니다." : "불러오기 실패 · " + error.message + " · 공식 메모 백업 또는 목록 붙여넣기도 이용할 수 있습니다.";
      status.textContent = label.textContent;
    } finally {
      if (autoTabId !== null) { const owned = autoTabId; autoTabId = null; try { await chrome.tabs.remove(owned); } catch {} }
      field.setAttribute("aria-busy", "false"); el("recordsNativeCancel").hidden = true;
      busy = false; setControlsDisabled(false); updateButtons();
    }
  }
  async function readNative() {
    if (busy) return;
    busy = true; nativeSource = null; setControlsDisabled(true); await preview();
    nativeStatus.textContent = "열린 설정 목록을 읽는 중입니다…";
    try {
      if (!nativeTab.value) throw Error("먼저 목록을 확인할 디시 페이지를 선택하세요.");
      const tabId = Number(nativeTab.value), before = await chrome.tabs.get(tabId);
      if (!validNativeUrl(before.url)) throw Error("디시 PC 갤러리 출처를 확인할 수 없습니다.");
      const results = await chrome.scripting.executeScript({ target: { tabId, frameIds: [0] }, func: DCBNativeCollector.collect, world: "ISOLATED" });
      if (results.some(item => item.error)) throw Error("열린 목록을 읽지 못했습니다. 브라우저의 사이트 접근 권한을 확인하세요.");
      const result = results.find(item => item.frameId === 0)?.result;
      const after = await chrome.tabs.get(tabId);
      if (before.url !== after.url || !validNativeUrl(after.url) || result?.href !== after.url) throw Error("페이지가 이동했습니다. 목록을 다시 확인한 뒤 읽으세요.");
      if (result?.ok === false && result.issues?.some(issue => issue.code === "MODAL_NOT_OPEN")) {
        nativeStatus.textContent = "목록 창 열기 필요 · 선택한 페이지: " + nativeTabLabel(after) +
          " · ‘디시 페이지로 이동’을 누른 뒤 디시의 ‘설정 → 차단 설정’ 또는 ‘설정 → 이용자 메모’에서 목록 창을 여세요. 목록 창을 열어 둔 채 이 화면으로 돌아와 다시 읽으세요. 이용자 메모 목록은 갤러리 글목록 페이지에서 열 수 있습니다.";
        return;
      }
      if (result?.ok === false || !Array.isArray(result?.records) || result.source !== "dc-native") throw Error(result?.issues?.[0]?.message || "지원하는 설정 목록을 확인하지 못했습니다.");
      if (result.records.length > 10000 || JSON.stringify(result).length > 4194304) throw Error("한 번에 읽을 수 있는 목록 크기를 초과했습니다.");
      nativeSource = result;
      await preview();
      nativeStatus.textContent = "현재 열린 목록 " + result.records.length + "건을 읽었습니다. 다른 범위·페이지는 포함되지 않을 수 있습니다. 아래 적용 가능·보류 사유를 확인하세요.";
    } catch (error) { nativeStatus.textContent = "직접 읽기 실패 · " + error.message + " · 메모 백업 파일 또는 목록 붙여넣기를 이용할 수 있습니다."; }
    finally { busy = false; setControlsDisabled(false); updateButtons(); }
  }
  function setControlsDisabled(value) {
    [file, format, kind, scope, scopeChoice, paste, replace, confirm, reset, nativeTab, ...nativeControls].forEach(control => { control.disabled = value; });
  }

  async function commit(revert) {
    if (busy || (!revert && apply.disabled)) return;
    busy = true;
    setControlsDisabled(true);
    updateButtons();
    try {
      const reviewLabels = pending?.nativeRecords ? labels.filter(label => label.includes("보류:") || label.startsWith("수집 참고")) : [];
      let payload = {};
      if (!revert) {
        payload = pending.nativeRecords ? { nativeRecords: pending.nativeRecords, replace: replace.checked }
          : { memos: [...pending.entries], tokens: pending.blocks, replace: replace.checked };
      }
      const result = await sendUserBlockMutation(revert ? "dcb.recordsUndo" : "dcb.recordsImport", payload);
      if (!result?.ok) throw Error(result?.message || "저장 실패");
      if (revert || result.blockCount || result.memoCount || result.keywordCount || result.nativeCount) undo.hidden = revert;
      paste.value = file.value = "";
      nativeSource = null;
      await preview();
      status.textContent = "메모 " + result.memoCount + "건 · 차단 " + result.blockCount + "건 " + (revert ? "취소됨" : "가져옴");
      if (result.keywordCount) status.textContent += " · 차단 단어 " + result.keywordCount + "건";
      if (!revert && reviewLabels.length) { labels = reviewLabels; offset = 0; nextPage(); status.textContent += " · 보류·수집 참고는 아래에 남겨 두었습니다."; }
      await renderMemoList();
      refreshUidList();
    } catch (error) { status.textContent = "변경 실패 · " + error.message; }
    finally { busy = false; setControlsDisabled(false); updateButtons(); }
  }
  for (const control of [scope, paste]) control.addEventListener("input", () => {
    ++revision; pending = null; updateButtons();
    clearTimeout(inputTimer); inputTimer = setTimeout(preview, 180);
  });
  file.addEventListener("change", () => { if (file.files.length) paste.value = ""; void preview(); });
  format.addEventListener("change", () => {paste.value = file.value = ""; nativeSource = null; el("recordsNativeProgressField").hidden = true; void preview(); if (format.value === "native") void refreshNativeTabs();});
  for (const control of [kind, scopeChoice]) control.addEventListener("change", preview);
  reset.onclick = () => {paste.value = file.value = ""; nativeSource = null; el("recordsNativeProgressField").hidden = true; void preview();};
  el("recordsNativeStart").onclick = enterNative;
  el("recordsNativeAuto").onclick = autoImportNative;
  el("recordsNativeCancel").onclick = () => { autoCancelled = true; el("recordsNativeProgressText").textContent = "불러오기를 중지하는 중입니다…"; };
  window.addEventListener("pagehide", () => { if (autoTabId !== null) void chrome.tabs.remove(autoTabId).catch(() => {}); });
  el("recordsNativeRefresh").onclick = () => refreshNativeTabs();
  el("recordsNativeRead").onclick = readNative;
  nativeTab.addEventListener("change", () => {
    nativeSource = null; void preview();
    nativeStatus.textContent = "선택한 페이지가 바뀌었습니다. 설정 목록을 확인한 뒤 다시 읽으세요.";
  });
  el("recordsNativeOpen").onclick = async () => {
    try {
      const tab = await chrome.tabs.create({ url: "https://gall.dcinside.com/board/lists/?id=programming" });
      await refreshNativeTabs(tab.id);
    }
    catch (error) { nativeStatus.textContent = "페이지 열기 실패 · " + error.message; }
  };
  el("recordsNativeFocus").onclick = async () => {
    try {
      if (!nativeTab.value) throw Error("먼저 디시 페이지를 선택하세요.");
      const tab = await chrome.tabs.get(Number(nativeTab.value));
      if (!validNativeUrl(tab.url)) throw Error("디시 PC 갤러리 페이지가 아닙니다.");
      await chrome.tabs.update(tab.id, { active: true });
      await chrome.windows.update(tab.windowId, { focused: true });
    } catch (error) { nativeStatus.textContent = "페이지 보기 실패 · " + error.message; }
  };
  confirm.onchange = updateButtons;
  more.onclick = nextPage;
  apply.onclick = () => commit(false);
  undo.onclick = () => commit(true);
  chrome.storage.local.get("dcbRecordsImportUndo").then(data => { undo.hidden = !data.dcbRecordsImportUndo; });
  updateMode();
})();

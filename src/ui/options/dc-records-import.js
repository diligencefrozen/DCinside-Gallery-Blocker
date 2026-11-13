(() => {
  const el = id => document.getElementById(id);
  const file = el("officialMemoFile"), format = el("memoImportFormat"), scope = el("memoTextScope");
  const kind = el("recordsKind"), paste = el("recordsPaste"), confirm = el("recordsConfirm");
  const status = el("officialMemoPreview"), list = el("officialMemoRows"), more = el("recordsMore");
  const apply = el("officialMemoApply"), undo = el("officialMemoUndo"), replace = el("officialMemoReplace");
  let revision = 0, pending, labels = [], offset = 0, busy = false;

  function updateButtons() {
    apply.disabled = busy || !pending || !(pending.entries.size || pending.blocks.length) ||
      (pending.blocks.length > 0 && !confirm.checked);
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
    const version = ++revision;
    const textMode = format.value === "text";
    el("memoScopeLabel").hidden = !textMode;
    el("recordsConfirmLabel").hidden = true;
    confirm.checked = replace.checked = false;
    pending = null;
    labels = [];
    offset = 0;
    nextPage();
    updateButtons();
    status.textContent = "";
    try {
      const input = file.files[0];
      if (input?.size > 4194304) throw Error("4MB 이하의 파일을 선택하세요.");
      const text = (textMode && paste.value) || (input && await input.text());
      if (!text) return;
      const result = textMode ? DCBOfficialMemos.parseRecords(text, scope.value.trim(), kind.value)
        : { ...DCBOfficialMemos.parse(text), blocks: [] };
      const [memos, tokens] = await Promise.all([getUserMemos(), getStoredUidList()]);
      if (revision !== version) return;
      const stored = new Set(tokens.map(DCBUserBlockStore.makeBlockKey));
      let conflicts = 0, duplicates = result.duplicates;
      for (const [key, item] of result.entries) {
        const exists = Object.hasOwn(memos, key);
        if (exists) conflicts++;
        labels.push([item.scope, item.value, item.memo, exists ? "기존 메모 있음" : ""].filter(Boolean).join(" · "));
      }
      for (const token of result.blocks) {
        const exists = stored.has(DCBUserBlockStore.makeBlockKey(token));
        if (exists) duplicates++;
        labels.push("전체 갤러리 차단 · " + token + (exists ? " · 이미 차단됨" : ""));
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

  async function commit(revert) {
    if (busy || (!revert && apply.disabled)) return;
    busy = true;
    const controls = [file, format, kind, scope, paste, replace, confirm];
    controls.forEach(control => { control.disabled = true; });
    updateButtons();
    try {
      let payload = {};
      if (!revert) {
        const [userMemos, blockedUids] = await Promise.all([getUserMemos(), getStoredUidList()]);
        downloadJson("dcb-records-before-import-" + Date.now() + ".json", { format:"dcb-records", version:1, exportedAt:new Date().toISOString(), userMemos, blockedUids });
        payload = { memos: [...pending.entries], tokens: pending.blocks, replace: replace.checked };
      }
      const result = await sendUserBlockMutation(revert ? "dcb.recordsUndo" : "dcb.recordsImport", payload);
      if (!result?.ok) throw Error(result?.message || "저장 실패");
      if (revert || result.blockCount || result.memoCount) undo.hidden = revert;
      paste.value = file.value = "";
      await preview();
      status.textContent = "메모 " + result.memoCount + "건 · 차단 " + result.blockCount + "건 " + (revert ? "취소됨" : "가져옴");
      await renderMemoList();
      refreshUidList();
    } catch (error) { status.textContent = "변경 실패 · " + error.message; }
    finally { busy = false; controls.forEach(control => { control.disabled = false; }); updateButtons(); }
  }
  for (const control of [scope, paste]) control.addEventListener("input", preview);
  file.addEventListener("change", () => { if (file.files.length) paste.value = ""; void preview(); });
  for (const control of [format, kind]) control.addEventListener("change", preview);
  confirm.onchange = updateButtons;
  more.onclick = nextPage;
  apply.onclick = () => commit(false);
  undo.onclick = () => commit(true);
  chrome.storage.local.get("dcbRecordsImportUndo").then(data => { undo.hidden = !data.dcbRecordsImportUndo; });
})();

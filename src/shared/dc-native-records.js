// Known PC native record formats, verified against user_block.js 261106-2 and
// UserMemo's public implementation. No network or storage access here.
(() => {
  "use strict";
  const object = value => value !== null && typeof value === "object" && !Array.isArray(value);
  async function parse(snapshot, onProgress = () => {}) {
    if (snapshot?.source !== "dc-native" || snapshot.schema !== "dc-pc-local-20261116" || !object(snapshot.raw))
      throw Error("디시 기록 형식을 확인할 수 없습니다.");
    if (JSON.stringify(snapshot.raw).length > 4194304) throw Error("디시 기록 크기가 너무 큽니다.");
    const read = key => {
      const raw = snapshot.raw[key];
      if (raw === null) return {};
      if (typeof raw !== "string") throw Error("디시 " + key + " 기록 형식이 올바르지 않습니다.");
      let value;
      try { value = JSON.parse(raw); } catch { throw Error("디시 " + key + " 기록을 해석하지 못했습니다."); }
      if (!object(value)) throw Error("디시 " + key + " 목록 구조가 변경되었습니다.");
      return value;
    };
    const all = read("block_all"), parts = read("block_parts"), memos = read("user_memo");
    const records = [], issues = [], galleries = new Set();
    let unsupported = 0;
    const issue = message => issues.push({ message });
    const unsupportedIssue = message => {unsupported++;issue(message);};
    const add = record => {
      if (records.length >= 20000) throw Error("20,000건을 초과해 자동 수집을 중지했습니다. 공식 백업을 이용하세요.");
      records.push({ ...record, source: "dc-native" });
    };
    const scope = (key, globalAllowed = false) => {
      if (key === "0" && globalAllowed) return { scope: "global", galleryId: "", galleryType: "" };
      const suffix = key.match(/\^(MI|PR)$/);
      const galleryId = key.replace(/\^(?:MI|PR)$/, "");
      galleries.add(key);
      return { scope: "gallery", galleryId, galleryType: suffix?.[1] || "unknown" };
    };
    const block = (value, range) => {
      if (!object(value)) { unsupportedIssue("차단 범위의 구조를 확인할 수 없어 보류했습니다: " + (range.galleryId || "전체")); return; }
      const enabled = value.on === 1 || value.on === true ? true : value.on === 0 || value.on === false ? false : null;
      for (const [field, targetType] of [["word","keyword"],["id","uid"],["nick","nick"],["ip","ip"]]) {
        if (value[field] === undefined && !Object.keys(value).length) continue;
        if (typeof value[field] !== "string") { unsupportedIssue("차단 " + field + " 목록 형식이 변경되어 해당 항목을 보류했습니다: " + (range.galleryId || "전체")); continue; }
        for (const token of value[field].split("||").filter(Boolean)) add({ kind: "block", ...range, enabled,
          targetType, value: token, nativeTargetType: field, ...(targetType === "uid" ? { identityVerified: true } : {}) });
      }
    };
    const jobs = [{ kind:"block", value:all, range:scope("0",true) },
      ...Object.entries(parts).map(([key,value]) => ({kind:"block",value,range:scope(key)})),
      ...Object.entries(memos).map(([key,value]) => ({kind:"memo",value,range:scope(key,true)}))];
    for (const [index, job] of jobs.entries()) {
      if (job.kind === "block") block(job.value, job.range);
      else if (!object(job.value)) unsupportedIssue("메모 범위의 구조를 확인할 수 없어 보류했습니다: " + (job.range.galleryId || "전체"));
      else for (const [type, items] of Object.entries(job.value)) {
        if (!["pcode","ip"].includes(type) || !object(items)) { unsupportedIssue("지원하지 않는 메모 유형을 보류했습니다: " + type); continue; }
        for (const [value, item] of Object.entries(items)) {
          if (!object(item)) { unsupportedIssue("본문·색상을 확인할 수 없는 메모를 보류했습니다."); continue; }
          add({kind:"memo",...job.range,nativeScopeModel:"gallery-id",enabled:true,targetType:type === "pcode" ? "uid" : "ip",
            nativeTargetType:type,value,memo:item.memo,color:item.color == null || item.color === "" ? "#999999" : item.color,
            ...(type === "pcode" ? {identityVerified:true} : {})});
        }
      }
      onProgress({completed:index+1,total:jobs.length,records:records.length,galleries:galleries.size});
      if (index % 20 === 0) await new Promise(resolve => setTimeout(resolve, 0));
    }
    if (!records.length) issue("이 브라우저의 디시 PC 저장소에서 가져올 차단·메모를 찾지 못했습니다. 다른 브라우저·프로필·기기의 기록은 포함되지 않습니다.");
    if (galleries.size) issue("갤러리별 기록도 수집했습니다. 기존 확장의 적용 범위와 맞지 않는 항목은 아래에서 보류 사유를 표시합니다.");
    return {source:"dc-native",href:snapshot.href,records,issues,
      coverage:{complete:unsupported===0,unsupportedGroups:unsupported,storage:"verified-record-keys",galleries:galleries.size,scope:"this-browser-pc-origin"}};
  }
  globalThis.DCBNativeRecords = Object.freeze({ parse });
})();

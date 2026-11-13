// Official PC .dcdata and mobile v4 .txt memo exports. Decode locally.
(() => {
  function parse(text) {
    if (text.length > 4 * 1024 * 1024) throw Error("4MB 이하의 파일을 선택하세요.");
    const bytes = Uint8Array.from(atob(text.trim()), c => c.charCodeAt(0));
    const raw = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    const pc = raw && Object.keys(raw).length === 1 && Object.hasOwn(raw, "userMemoList");
    const mobile = raw?.unique === "dcinside" && raw.version === 4;
    if (!(pc || mobile) || !Array.isArray(raw.userMemoList)) {
      throw Error("디시 PC웹 또는 모바일웹 이용자 메모 백업을 선택하세요.");
    }
    const entries = new Map();
    let invalid = 0, duplicates = 0;
    for (const group of raw.userMemoList) {
      const gallery = group?.galleryId;
      const global = gallery === "" || gallery === 0 || gallery === "all";
      if ((!global && (typeof gallery !== "string" || !/^[a-z0-9_]{1,80}$/i.test(gallery))) ||
          !Array.isArray(group?.value) || !Array.isArray(group.memo) || !Array.isArray(group.color) ||
          group.value.length !== group.memo.length || group.value.length !== group.color.length) {
        throw Error("메모 범위와 항목 수를 확인할 수 없습니다.");
      }
      for (const [i, value] of group.value.entries()) {
        const memo = group.memo[i], color = group.color[i];
        const ip = typeof value === "string" && /^\d{1,3}\.\d{1,3}$/.test(value) && value.split(".").every(n => Number(n) <= 255);
        if (typeof value !== "string" || (!ip && !/^[a-z0-9]{3,20}$/i.test(value)) ||
            typeof memo !== "string" || !memo.trim() || memo.length > 80 || typeof color !== "string") {
          invalid++;
          continue;
        }
        const type = ip ? "ip" : "uid";
        const scope = global ? "global" : gallery;
        const key = (global ? "" : "gallery:" + gallery + ":") + type + ":" + value;
        if (entries.has(key)) { duplicates++; continue; }
        entries.set(key, { type, scope, source: "web", value, memo: memo.trim(), color: /^#[a-f\d]{6}$/i.test(color) ? color : "#999999",
          uid: ip ? "" : value, ip: ip ? value : "", nickname: "" });
      }
    }
    return { entries, invalid, duplicates };
  }
  function parseText(text, scope) {
    if (scope !== "global" && !/^[a-z0-9_]{1,80}$/i.test(scope)) throw Error("적용할 갤러리 ID를 확인하세요.");
    const entries = new Map(), badLines = [];
    let duplicates = 0;
    for (const [index, raw] of text.split(/\r?\n/).entries()) {
      const line = raw.trim();
      if (!line) continue;
      const tab = line.indexOf("\t");
      const separator = tab >= 0 ? tab : line.indexOf("-");
      const value = separator > 0 ? line.slice(0, separator).trim() : "";
      const memo = line.slice(separator + 1).trim();
      const ip = /^\d{1,3}(?:\.\d{1,3}){1,3}$/.test(value) && value.split(".").every(n => Number(n) <= 255);
      if (!memo || memo.length > 80 || (!ip && !/^(?=[a-z0-9_-]*[a-z])[a-z0-9][a-z0-9_-]{1,63}$/i.test(value)) ||
          (tab < 0 && /^[a-z0-9_]+-/i.test(memo))) {
        badLines.push(index + 1);
        continue;
      }
      const type = ip ? "ip" : "uid";
      const key = (scope === "global" ? "" : "gallery:" + scope + ":") + type + ":" + value;
      if (entries.has(key)) { duplicates++; continue; }
      entries.set(key, { source: "manual", type, scope, value, memo, color: "#999999", uid: ip ? "" : value, ip: ip ? value : "", nickname: "" });
    }
    return { entries, invalid: badLines.length, badLines, duplicates };
  }
  function parseRecords(text, scope, mode) {
    if (text.length > 4 * 1024 * 1024) throw Error("4MB 이하의 목록을 입력하세요.");
    const parsed = parseText(text, scope);
    const seen = new Set();
    const bad = new Set(parsed.badLines);
    const blocks = new Set();
    for (const [index, raw] of text.split(/\r?\n/).entries()) {
      const line = raw.trim().normalize("NFKC");
      if (!line || !bad.has(index + 1) || mode === "memo" || scope !== "global") continue;
      let token;
      if (/^uid:[a-z0-9._-]{2,64}$/i.test(line)) token = line.slice(4);
      else if (/^(?:ip:)?\d{1,3}(?:\.\d{1,3}){1,3}$/i.test(line)) {
        const parts = line.replace(/^ip:/i,"").split(".");
        if (parts.every(n => Number(n) <= 255)) token = parts.slice(0,2).join(".");
      } else if (/^[\p{L}\p{N}_ ]{1,80}$/u.test(line) && !/^(?:ᄋᄋ|ㅇㅇ|익명|무명|유동|유동닉|anonymous)$/i.test(line))
        token = "nick-exact:" + line;
      if (!token) continue;
      bad.delete(index + 1);
      if (seen.has(token.toLowerCase())) parsed.duplicates++;
      else blocks.add(token);
      seen.add(token.toLowerCase());
    }
    if (mode === "block" && parsed.entries.size) throw Error("메모 행이 포함되어 있습니다. 자동 분류 또는 메모를 선택하세요.");
    return { ...parsed, blocks: [...blocks], badLines: [...bad], invalid: bad.size };
  }
  globalThis.DCBOfficialMemos = { parse, parseText, parseRecords };
})();

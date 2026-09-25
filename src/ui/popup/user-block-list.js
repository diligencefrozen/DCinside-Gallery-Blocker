(() => {
  "use strict";
  const kindOrder = Object.freeze({ UID: 0, IP: 1, NICK: 2 });
  function kindOf(token) {
    const text = String(token || "").trim();
    if (/^nick\s*[:=]/i.test(text)) return "NICK";
    return /^\d{1,3}(?:\.\d{1,3}){1,3}$/.test(text) ? "IP" : "UID";
  }
  function labelOf(token) {
    const text = String(token || "").trim();
    return kindOf(text) === "NICK" ? text.replace(/^nick\s*[:=]\s*/i, "") : text;
  }
  function counts(tokens) {
    const result = { all: 0, UID: 0, IP: 0, NICK: 0 };
    for (const token of Array.isArray(tokens) ? tokens : []) {
      result.all++;
      result[kindOf(token)]++;
    }
    return result;
  }
  function prepare(tokens, { filter = "all", query = "" } = {}) {
    const needle = String(query).trim().toLocaleLowerCase();
    return (Array.isArray(tokens) ? tokens : [])
      .map((token) => ({ token, kind: kindOf(token), label: labelOf(token) }))
      .filter((item) => filter === "all" || item.kind === filter)
      .filter((item) => !needle || `${item.token}\n${item.label}`.toLocaleLowerCase().includes(needle))
      .sort((a, b) => kindOrder[a.kind] - kindOrder[b.kind]
        || a.label.localeCompare(b.label, undefined, { numeric: true, sensitivity: "base" }));
  }
  globalThis.DCBUserBlockList = Object.freeze({ kindOf, labelOf, counts, prepare });
})();

(() => {
  "use strict";
  if (globalThis.DCBKeywordMatcher) return;

  function normalizeText(value) {
    return String(value || "").normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();
  }

  function prepareKeywords(list) {
    if (!Array.isArray(list)) return [];
    const seen = new Set();
    return list.flatMap((raw) => {
      const label = String(raw || "").normalize("NFKC").trim();
      const needle = normalizeText(label);
      if (!needle || seen.has(needle)) return [];
      seen.add(needle);
      return [{ label, needle }];
    });
  }

  function findKeyword(text, keywords) {
    const haystack = normalizeText(text);
    return haystack ? keywords.find((keyword) => haystack.includes(keyword.needle)) || null : null;
  }

  globalThis.DCBKeywordMatcher = Object.freeze({ normalizeText, prepareKeywords, findKeyword });
})();

(() => {
  "use strict";
  function normalize(value) {
    const raw = String(value || "").trim().replace(/^refs\/tags\//i, "").replace(/^v(?=\d)/i, "");
    return /^\d+\.\d+\.\d+\.\d+$/.test(raw) ? raw : "";
  }
  function compare(a, b) {
    const left = normalize(a);
    const right = normalize(b);
    if (!left || !right) return null;
    const aa = left.split(".").map(Number);
    const bb = right.split(".").map(Number);
    for (let index = 0; index < 4; index++) {
      const diff = aa[index] - bb[index];
      if (diff) return Math.sign(diff);
    }
    return 0;
  }
  globalThis.DCBReleaseVersion = Object.freeze({ normalize, compare });
})();

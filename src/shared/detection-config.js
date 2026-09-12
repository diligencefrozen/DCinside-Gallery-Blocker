(function (scope) {
  "use strict";
  const key = "dcbTextDetection";
  const defaults = Object.freeze({ enabled: false, posts: true, comments: true, sensitivity: "careful" });
  const thresholds = Object.freeze({ careful: 0.65, balanced: 0.55, sensitive: 0.45 });
  function normalize(input) {
    const value = input && typeof input === "object" ? input : {};
    return {
      enabled: value.enabled === true,
      posts: value.posts !== false,
      comments: value.comments !== false,
      sensitivity: Object.hasOwn(thresholds, value.sensitivity) ? value.sensitivity : defaults.sensitivity
    };
  }
  function modelText(title, body) {
    return `제목: ${String(title || "").trim().slice(0, 500)}\n댓글: ${String(body || "").trim().slice(0, 6000)}`;
  }
  function fallbackScore(title, body) {
    const text = `${String(title || "")} ${String(body || "")}`.replace(/\s+/g, " ");
    const strong = [
      /씨+\s*발|시+\s*발(?!점)|ㅅ\s*ㅂ/giu,
      /병\s*신|븅\s*신|ㅂ\s*ㅅ/giu,
      /개\s*새끼|개\s*소리/giu,
      /좆|ㅈ\s*같/giu,
      /입\s*닥쳐|닥쳐라|꺼져라|뒤져라|죽어라|죽어\s*버려/giu
    ];
    const hostile = [
      /미친\s*(?:놈|년|새끼)|등신/giu,
      /한남충|한녀충|맘충/giu
    ];
    let strongHits = 0;
    let hostileHits = 0;
    for (const pattern of strong) strongHits += [...text.matchAll(pattern)].length;
    for (const pattern of hostile) hostileHits += [...text.matchAll(pattern)].length;
    const target = "(?<![가-힣A-Za-z0-9_])(?:너(?:는|가|를|도|만|한테|야)?|넌|널|네가|니가|(?:니들|너희)(?:은|는|이|가|을|를|도|만|한테)?|(?:저|이)\\s*(?:새끼|년|놈)(?:은|는|이|가|을|를)?)(?![가-힣A-Za-z0-9_])";
    const directed = new RegExp(target, "u").test(text);
    const contextualHostile = new RegExp(`(?:${target})[^.!?\\n]{0,24}쓰레기(?!통|봉투|분리|처리)|쓰레기(?!통|봉투|분리|처리)[^.!?\\n]{0,24}(?:${target})`, "u").test(text);
    if (strongHits) return Math.min(0.98, 0.86 + (strongHits - 1) * 0.05 + (directed ? 0.04 : 0));
    if (hostileHits >= 2) return Math.min(0.92, 0.8 + (hostileHits - 2) * 0.04 + (directed ? 0.04 : 0));
    if (hostileHits === 1 || contextualHostile) return directed || contextualHostile ? 0.72 : 0.52;
    return 0.08;
  }
  function isFlagged(score, settings) {
    return typeof score === "number" && Number.isFinite(score) && score >= thresholds[normalize(settings).sensitivity] && score <= 1;
  }
  scope.DCBTextDetection = Object.freeze({ key, defaults, thresholds, normalize, modelText, fallbackScore, isFlagged });
})(globalThis);

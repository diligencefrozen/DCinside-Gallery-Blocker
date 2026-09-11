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
  function isFlagged(score, settings) {
    return typeof score === "number" && Number.isFinite(score) && score >= thresholds[normalize(settings).sensitivity] && score <= 1;
  }
  scope.DCBTextDetection = Object.freeze({ key, defaults, thresholds, normalize, modelText, isFlagged });
})(globalThis);

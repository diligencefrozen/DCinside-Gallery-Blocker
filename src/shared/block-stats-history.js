(() => {
  "use strict";

  if (globalThis.DCBBlockStatsHistory) return;

  const DEFAULT_KEEP_DAYS = 30;
  const DEFAULT_CHART_DAYS = 7;
  const MAX_DAILY_COUNT = Number.MAX_SAFE_INTEGER;

  function asDate(value = Date.now()) {
    const date = value instanceof Date ? new Date(value.getTime()) : new Date(Number(value));
    return Number.isNaN(date.getTime()) ? new Date() : date;
  }

  function dayKey(value = Date.now()) {
    const date = asDate(value);
    const year = String(date.getFullYear()).padStart(4, "0");
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function shiftLocalDays(value, amount) {
    const date = asDate(value);
    date.setHours(12, 0, 0, 0);
    date.setDate(date.getDate() + Number(amount || 0));
    return date;
  }

  function isValidDayKey(value) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ""));
    if (!match) return false;
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const date = new Date(year, month - 1, day, 12);
    return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
  }

  function safeCount(value) {
    const count = Number.parseInt(value, 10);
    if (!Number.isFinite(count) || count <= 0) return 0;
    return Math.min(MAX_DAILY_COUNT, count);
  }

  function normalize(value, { now = Date.now(), keepDays = DEFAULT_KEEP_DAYS } = {}) {
    const daysToKeep = Math.max(DEFAULT_CHART_DAYS, Math.min(366, Number.parseInt(keepDays, 10) || DEFAULT_KEEP_DAYS));
    const today = dayKey(now);
    const cutoff = dayKey(shiftLocalDays(now, -(daysToKeep - 1)));
    const source = value?.days && typeof value.days === "object" ? value.days : {};
    const days = {};

    Object.entries(source).forEach(([key, valueCount]) => {
      const count = safeCount(valueCount);
      if (!isValidDayKey(key) || key < cutoff || key > today || !count) return;
      days[key] = count;
    });

    return { days };
  }

  function add(value, count, { now = Date.now(), keepDays = DEFAULT_KEEP_DAYS } = {}) {
    const history = normalize(value, { now, keepDays });
    const increment = safeCount(count);
    if (!increment) return history;

    const key = dayKey(now);
    history.days[key] = Math.min(MAX_DAILY_COUNT, (history.days[key] || 0) + increment);
    return history;
  }

  function recent(value, { now = Date.now(), days = DEFAULT_CHART_DAYS } = {}) {
    const range = Math.max(1, Math.min(DEFAULT_KEEP_DAYS, Number.parseInt(days, 10) || DEFAULT_CHART_DAYS));
    const history = normalize(value, { now, keepDays: Math.max(DEFAULT_KEEP_DAYS, range) });
    const today = dayKey(now);
    const entries = [];

    for (let offset = range - 1; offset >= 0; offset -= 1) {
      const date = shiftLocalDays(now, -offset);
      const key = dayKey(date);
      entries.push({ date: key, total: history.days[key] || 0, isToday: key === today });
    }

    return entries;
  }

  globalThis.DCBBlockStatsHistory = Object.freeze({
    DEFAULT_CHART_DAYS,
    DEFAULT_KEEP_DAYS,
    dayKey,
    normalize,
    add,
    recent
  });
})();

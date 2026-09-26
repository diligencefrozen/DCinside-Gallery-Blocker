/*
 * startup-scheduler.js
 * Small cooperative scheduler used to prevent many optional features from
 * doing full DOM work in the same Firefox refresh frame.
 */
(() => {
  "use strict";
  if (globalThis.DCBStartupScheduler) return;

  const slots = new Map();
  const delays = { visual: 0, normal: 24, idle: 60, background: 120 };

  function schedule(name, work, phase = "normal") {
    if (typeof work !== "function") return () => {};
    const key = String(name || Math.random());
    const old = slots.get(key);
    if (old?.cancel) old.cancel();
    let cancelled = false;
    let timer = null;
    let idle = null;

    const run = () => {
      if (cancelled) return;
      slots.delete(key);
      try { work(); } catch (error) { console.warn("[DCB] scheduled startup task failed:", key, error); }
    };
    const delay = delays[phase] ?? delays.normal;

    if (phase === "visual") {
      requestAnimationFrame(() => { timer = setTimeout(run, delay); });
    } else if ((phase === "idle" || phase === "background") && typeof requestIdleCallback === "function") {
      idle = requestIdleCallback(run, { timeout: phase === "idle" ? 180 : 350 });
    } else {
      timer = setTimeout(run, delay);
    }

    const cancel = () => {
      cancelled = true;
      if (timer != null) clearTimeout(timer);
      if (idle != null && typeof cancelIdleCallback === "function") cancelIdleCallback(idle);
      slots.delete(key);
    };
    slots.set(key, { cancel });
    return cancel;
  }

  globalThis.DCBStartupScheduler = Object.freeze({ schedule });
})();

(() => {
  'use strict';
  const Config = globalThis.DCBTextDetection;
  if (!Config || !globalThis.chrome?.storage?.sync || globalThis.__dcbTextDetectorLoaded) return;
  globalThis.__dcbTextDetectorLoaded = true;

  const STYLE_ID = 'dcb-text-detection-style';
  const HIDDEN_ATTR = 'data-dcb-text-detection-hidden';
  const PLACEHOLDER_ATTR = 'data-dcb-text-detection-placeholder';
  const RECORD_ID_ATTR = 'data-dcb-text-detection-id';
  const PREVIEW = '#dcb-preview-overlay';
  const POST_SELECTOR = `.write_div, ${PREVIEW} .dcbpv-article`;
  const COMMENT_SELECTOR = '.cmt_txtbox, .cmt_info .usertxt, .reply_txt, .comment_txt, .dcbpv-comment-body';
  const CANDIDATE_SELECTOR = `${POST_SELECTOR}, ${COMMENT_SELECTOR}`;
  const TITLE_SELECTOR = '.title_subject, .gallview_head .title';
  const EXCLUDE_SELECTOR = [
    'script', 'style', 'noscript', 'template', 'form', 'input', 'textarea', 'select', 'button',
    '[contenteditable]:not([contenteditable="false"])', '[role="textbox"]', '[hidden]', '[aria-hidden="true"]',
    '.gall_writer', '.ub-writer', '.nickname', '.nick_name', '.user_nick', '.dcb-uid-badge',
    '.dcbpv-comment-meta', '.dcbpv-meta', '.dcbpv-empty', '.cmt_mdf_del', '.date_time',
    '.comment_dccon', '.coment_dccon_img', '.coment_dccon_txt', '.comment_dccon_txt',
    '.txtcon_txt', '.written_dccon', '.dcbpv-dccon', `[${PLACEHOLDER_ATTR}]`
  ].join(',');
  const MAX_RECORDS = 1500;
  const MAX_QUEUE = 48;
  const MAX_CACHE = 128;
  const MAX_ALLOWED = 128;
  const BATCH_SIZE = 4;
  const ALLOW_SESSION_KEY = `dcb-text-detection-allow:${location.pathname}${location.search}`;

  const records = new Map();
  const recordsById = new Map();
  const queued = new Map();
  const deferred = new Set();
  const cache = new Map();
  const allowedKeys = loadAllowedKeys();
  let settings = Config.normalize();
  let epoch = 0;
  let nextRecordId = 1;
  let requestActive = false;
  let retryAfter = 0;
  let batchTimer = 0;
  let pruneTimer = 0;
  let observer = null;
  let viewportObserver = null;
  let fallbackTimer = 0;
  let settingsChanged = false;

  function loadAllowedKeys() {
    try {
      const parsed = JSON.parse(sessionStorage.getItem(ALLOW_SESSION_KEY) || '[]');
      return new Set(Array.isArray(parsed) ? parsed.slice(-MAX_ALLOWED) : []);
    } catch {
      return new Set();
    }
  }

  function saveAllowedKeys() {
    try {
      const values = [...allowedKeys].slice(-MAX_ALLOWED);
      sessionStorage.setItem(ALLOW_SESSION_KEY, JSON.stringify(values));
    } catch {}
  }

  function rememberAllowed(key) {
    if (!key) return;
    allowedKeys.delete(key);
    allowedKeys.add(key);
    while (allowedKeys.size > MAX_ALLOWED) allowedKeys.delete(allowedKeys.values().next().value);
    saveAllowedKeys();
  }

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      [${HIDDEN_ATTR}="1"] { display: none !important; }
      [${PLACEHOLDER_ATTR}="1"] {
        box-sizing: border-box !important;
        display: flex !important;
        align-items: center !important;
        gap: 8px !important;
        min-width: 0 !important;
        width: 100% !important;
        margin: 2px 0 !important;
        padding: 6px 8px !important;
        border: 1px solid rgba(220, 38, 38, .28) !important;
        border-radius: 7px !important;
        background: rgba(254, 242, 242, .92) !important;
        color: #7f1d1d !important;
        font: 12px/1.45 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif !important;
        text-indent: 0 !important;
        white-space: normal !important;
        overflow-wrap: anywhere !important;
      }
      [${PLACEHOLDER_ATTR}="1"]::before {
        content: attr(data-dcb-text-detection-label);
        flex: 1 1 auto !important;
        min-width: 0 !important;
        font-weight: 700 !important;
      }
      .dcb-text-detection-show {
        appearance: none !important;
        flex: 0 0 auto !important;
        margin: 0 !important;
        padding: 3px 7px !important;
        border: 1px solid rgba(185, 28, 28, .35) !important;
        border-radius: 6px !important;
        background: #fff !important;
        color: #991b1b !important;
        font: 700 11px/1.4 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif !important;
        cursor: pointer !important;
      }
      .dcb-text-detection-show:hover { background: #fef2f2 !important; }
    `;
    (document.head || document.documentElement).appendChild(style);
  }

  function textOf(node, limit) {
    if (!node || node.closest?.(EXCLUDE_SELECTOR)) return '';
    const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
    const parts = [];
    let length = 0;
    while (walker.nextNode()) {
      const text = walker.currentNode;
      if (text.parentElement?.closest(EXCLUDE_SELECTOR)) continue;
      const value = text.textContent.replace(/\s+/g, ' ').trim();
      if (!value) continue;
      parts.push(value);
      length += value.length + 1;
      if (length >= limit) break;
    }
    return parts.join(' ').trim().slice(0, limit);
  }

  function titleNodeFor(node) {
    const preview = node.closest?.(PREVIEW);
    return preview ? preview.querySelector('.dcbpv-title') : document.querySelector(TITLE_SELECTOR);
  }

  function hashText(value, seed) {
    let hash = seed >>> 0;
    for (let index = 0; index < value.length; index += 1) {
      hash ^= value.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(36);
  }

  function inputKey(input) {
    const value = `${input.kind}\u0000${input.title}\u0000${input.body}`;
    return `${input.kind}:${input.title.length}:${input.body.length}:${hashText(value, 2166136261)}:${hashText(value, 2246822519)}`;
  }

  function snapshot(record) {
    const node = record.node;
    if (!node.isConnected || node.closest?.(EXCLUDE_SELECTOR)) return null;
    const body = textOf(node, 6000);
    if (body.replace(/\s/g, '').length < 8) return null;
    const titleNode = titleNodeFor(node);
    const input = { kind: record.kind, title: textOf(titleNode, 500), body };
    return { input, titleNode, key: inputKey(input) };
  }

  function visible(node, margin = 0) {
    if (document.hidden || !node?.isConnected || !node.getClientRects().length) return false;
    if (node.checkVisibility && !node.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) return false;
    const rect = node.getBoundingClientRect();
    return rect.bottom > -margin && rect.top < innerHeight + margin
      && rect.right > -margin && rect.left < innerWidth + margin;
  }

  function removePresentation(record) {
    record.placeholder?.remove();
    record.placeholder = null;
    record.node?.removeAttribute(HIDDEN_ATTR);
  }

  function markDirty(record) {
    if (!record) return;
    removePresentation(record);
    queued.delete(record.node);
    deferred.delete(record);
    record.version += 1;
    record.dirty = true;
    record.doneKey = '';
    record.input = null;
  }

  function updateSnapshot(record) {
    if (!record.dirty && record.key) return true;
    const next = snapshot(record);
    const nextKey = next?.key || '';
    if (nextKey !== record.key) {
      removePresentation(record);
      queued.delete(record.node);
      record.version += 1;
      record.key = nextKey;
      record.doneKey = '';
    }
    record.input = next?.input || null;
    record.titleNode = next?.titleNode || titleNodeFor(record.node);
    record.dirty = false;
    return !!record.input;
  }

  function makePlaceholder(record) {
    if (record.placeholder?.isConnected) return record.placeholder;
    const placeholder = document.createElement('div');
    placeholder.setAttribute(PLACEHOLDER_ATTR, '1');
    placeholder.dataset.dcbTextDetectionId = String(record.id);
    const label = record.kind === 'post'
      ? '공격적 표현이 있는 게시글을 가렸습니다'
      : '공격적 표현이 있는 댓글을 가렸습니다';
    placeholder.dataset.dcbTextDetectionLabel = label;
    placeholder.setAttribute('aria-label', label);
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'dcb-text-detection-show';
    button.dataset.dcbTextDetectionAction = 'show';
    button.textContent = '이번만 보기';
    placeholder.append(button);
    record.node.parentNode?.insertBefore(placeholder, record.node);
    record.placeholder = placeholder;
    return placeholder;
  }

  function showResult(record, score) {
    if (!Config.isFlagged(score, settings) || allowedKeys.has(record.key)) {
      removePresentation(record);
      return;
    }
    if (!record.node.isConnected) return;
    ensureStyle();
    makePlaceholder(record);
    record.node.setAttribute(HIDDEN_ATTR, '1');
  }

  function remember(key, score) {
    cache.delete(key);
    cache.set(key, score);
    if (cache.size > MAX_CACHE) cache.delete(cache.keys().next().value);
  }

  function consider(record) {
    if (!record || !record.inRange || !settings.enabled || !settings[record.kind === 'post' ? 'posts' : 'comments']) return;
    if (!updateSnapshot(record)) return;
    if (cache.has(record.key)) {
      const score = cache.get(record.key);
      remember(record.key, score);
      record.doneKey = record.key;
      record.input = null;
      showResult(record, score);
    } else if (record.doneKey !== record.key && !record.pending && !queued.has(record.node) && !deferred.has(record)) {
      if (queued.size < MAX_QUEUE) queued.set(record.node, record);
      else deferred.add(record);
    }
  }

  function drainDeferred() {
    if (!deferred.size || queued.size >= MAX_QUEUE) return;
    for (const record of [...deferred]) {
      if (queued.size >= MAX_QUEUE) break;
      deferred.delete(record);
      if (!record.inRange || !record.node.isConnected || record.pending || record.doneKey === record.key) continue;
      queued.set(record.node, record);
    }
  }

  function scheduleBatch() {
    if (batchTimer || requestActive || !settings.enabled || !queued.size || Date.now() < retryAfter) return;
    batchTimer = setTimeout(runBatch, 80);
  }

  async function runBatch() {
    batchTimer = 0;
    if (!settings.enabled || requestActive || Date.now() < retryAfter) return;
    const batch = [];
    for (const [node, record] of queued) {
      queued.delete(node);
      if (!record.inRange || !updateSnapshot(record) || record.pending) continue;
      record.pending = true;
      batch.push({ record, input: record.input, key: record.key, version: record.version });
      if (batch.length >= BATCH_SIZE) break;
    }
    if (!batch.length) return;
    const requestEpoch = epoch;
    requestActive = true;
    try {
      const response = await chrome.runtime.sendMessage({ type: 'DCB_DETECT_TEXT', items: batch.map((item) => item.input) });
      if (!response?.ok || !Array.isArray(response.results) || response.results.length !== batch.length
        || response.results.some(({ score } = {}) => typeof score !== 'number' || !Number.isFinite(score) || score < 0 || score > 1)) {
        throw new Error('Detection unavailable');
      }
      if (!settings.enabled || requestEpoch !== epoch) return;
      batch.forEach((item, index) => {
        const record = item.record;
        if (records.get(record.node) !== record || record.version !== item.version || record.key !== item.key) return;
        const score = response.results[index]?.score;
        remember(item.key, score);
        record.doneKey = item.key;
        record.input = null;
        showResult(record, score);
      });
    } catch (_) {
      if (requestEpoch === epoch) {
        retryAfter = Date.now() + 60_000;
        queued.clear();
        deferred.clear();
      }
    } finally {
      requestActive = false;
      batch.forEach(({ record }) => { record.pending = false; });
      if (settings.enabled && Date.now() >= retryAfter) {
        drainDeferred();
        scheduleBatch();
      }
    }
  }

  function canonical(node) {
    if (!node?.closest || node.closest(EXCLUDE_SELECTOR)) return null;
    const previewBody = node.closest(`${PREVIEW} .dcbpv-comment-body`);
    if (previewBody) return { node: previewBody, kind: 'comment' };
    const post = node.closest(POST_SELECTOR);
    if (post) return { node: post.closest(`${PREVIEW} .dcbpv-article`) || post, kind: 'post' };
    const textBox = node.closest('.cmt_txtbox');
    if (textBox) return { node: textBox.querySelector('.usertxt,.reply_txt,.comment_txt') || textBox, kind: 'comment' };
    return { node, kind: 'comment' };
  }

  function forget(record) {
    removePresentation(record);
    queued.delete(record.node);
    deferred.delete(record);
    viewportObserver?.unobserve(record.node);
    records.delete(record.node);
    recordsById.delete(record.id);
  }

  function registerCandidate(candidate) {
    const target = canonical(candidate);
    if (!target || !settings[target.kind === 'post' ? 'posts' : 'comments']) return;
    if (records.has(target.node)) return;
    if (records.size >= MAX_RECORDS) pruneDisconnected();
    if (records.size >= MAX_RECORDS) return;
    const record = {
      ...target,
      id: nextRecordId++, key: '', doneKey: '', version: 0, pending: false,
      input: null, titleNode: null, dirty: true, inRange: false, placeholder: null
    };
    records.set(target.node, record);
    recordsById.set(record.id, record);
    if (viewportObserver) {
      viewportObserver.observe(target.node);
      if (visible(target.node, 350)) {
        record.inRange = true;
        consider(record);
      }
    } else {
      record.inRange = visible(target.node, 350);
      if (record.inRange) consider(record);
    }
  }

  function discoverIn(root) {
    if (!root || root.nodeType !== Node.ELEMENT_NODE) return;
    if (root.matches?.(CANDIDATE_SELECTOR)) registerCandidate(root);
    root.querySelectorAll?.(CANDIDATE_SELECTOR).forEach(registerCandidate);
  }

  function initialDiscover() {
    document.querySelectorAll(CANDIDATE_SELECTOR).forEach(registerCandidate);
    scheduleBatch();
  }

  function pruneDisconnected() {
    clearTimeout(pruneTimer);
    pruneTimer = 0;
    for (const record of [...records.values()]) {
      if (!record.node.isConnected) forget(record);
    }
  }

  function schedulePrune() {
    if (pruneTimer) return;
    pruneTimer = setTimeout(pruneDisconnected, 60);
  }

  function recordNearNode(node) {
    const element = node?.nodeType === Node.ELEMENT_NODE ? node : node?.parentElement;
    if (!element?.closest) return null;
    const candidate = element.closest(CANDIDATE_SELECTOR);
    const target = candidate ? canonical(candidate) : null;
    return target ? records.get(target.node) || null : null;
  }

  function titleWasTouched(node) {
    const element = node?.nodeType === Node.ELEMENT_NODE ? node : node?.parentElement;
    return !!element?.closest?.(`${TITLE_SELECTOR}, ${PREVIEW} .dcbpv-title`);
  }

  function ownedNode(node) {
    const element = node?.nodeType === Node.ELEMENT_NODE ? node : node?.parentElement;
    return !!element?.closest?.(`[${PLACEHOLDER_ATTR}], #${STYLE_ID}`);
  }

  function onMutations(mutations) {
    if (!settings.enabled) return;
    const touched = new Set();
    let titleChanged = false;
    let needsPrune = false;
    for (const mutation of mutations) {
      if (ownedNode(mutation.target)) continue;
      const nodes = mutation.type === 'childList'
        ? [...mutation.addedNodes, ...mutation.removedNodes]
        : [];
      if (nodes.length && nodes.every(ownedNode)) continue;

      if (titleWasTouched(mutation.target)) titleChanged = true;
      const record = recordNearNode(mutation.target);
      if (record) {
        markDirty(record);
        touched.add(record);
      }

      if (mutation.type === 'childList') {
        mutation.addedNodes.forEach((node) => discoverIn(node));
        if (mutation.removedNodes.length) needsPrune = true;
      }
    }
    if (titleChanged) {
      for (const record of records.values()) {
        if (!record.inRange) continue;
        markDirty(record);
        touched.add(record);
      }
    }
    if (needsPrune) schedulePrune();
    for (const record of touched) {
      if (record.inRange) consider(record);
    }
    scheduleBatch();
  }

  function fallbackRefresh() {
    fallbackTimer = 0;
    if (!settings.enabled) return;
    for (const record of records.values()) {
      const inRange = visible(record.node, 350);
      if (inRange !== record.inRange) record.inRange = inRange;
      if (inRange) consider(record);
    }
    scheduleBatch();
  }

  function scheduleFallbackRefresh() {
    if (viewportObserver || fallbackTimer || !settings.enabled) return;
    fallbackTimer = setTimeout(fallbackRefresh, 120);
  }

  function clearAll() {
    clearTimeout(batchTimer);
    clearTimeout(pruneTimer);
    clearTimeout(fallbackTimer);
    batchTimer = pruneTimer = fallbackTimer = 0;
    queued.clear();
    deferred.clear();
    for (const record of [...records.values()]) forget(record);
    observer?.disconnect();
    viewportObserver?.disconnect();
    observer = viewportObserver = null;
    document.getElementById(STYLE_ID)?.remove();
  }

  function apply(value) {
    settings = Config.normalize(value);
    epoch += 1;
    retryAfter = 0;
    clearAll();
    if (!settings.enabled || (!settings.posts && !settings.comments)) return;
    if (!document.documentElement) {
      document.addEventListener('DOMContentLoaded', () => apply(settings), { once: true });
      return;
    }
    ensureStyle();
    if (typeof IntersectionObserver === 'function') {
      viewportObserver = new IntersectionObserver((entries) => {
        for (const entry of entries) {
          const record = records.get(entry.target);
          if (!record) continue;
          record.inRange = entry.isIntersecting;
          if (record.inRange) consider(record);
          else {
            queued.delete(record.node);
            deferred.delete(record);
          }
        }
        scheduleBatch();
      }, { rootMargin: '350px 0px' });
    }
    observer = new MutationObserver(onMutations);
    observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
    initialDiscover();
  }

  function handleReveal(event) {
    const button = event.target?.closest?.('[data-dcb-text-detection-action="show"]');
    if (!button) return;
    const placeholder = button.closest(`[${PLACEHOLDER_ATTR}="1"]`);
    if (!placeholder) return;
    const record = recordsById.get(Number(placeholder.dataset.dcbTextDetectionId));
    if (!record || !record.key) return;
    event.preventDefault();
    event.stopPropagation();
    rememberAllowed(record.key);
    removePresentation(record);
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'sync' || !changes[Config.key]) return;
    settingsChanged = true;
    apply(changes[Config.key].newValue);
  });
  chrome.storage.sync.get({ [Config.key]: Config.defaults }, (values) => {
    if (!settingsChanged) apply(values[Config.key]);
  });
  document.addEventListener('click', handleReveal, true);
  document.addEventListener('scroll', scheduleFallbackRefresh, { passive: true, capture: true });
  window.addEventListener('resize', scheduleFallbackRefresh, { passive: true });
  window.addEventListener('pageshow', scheduleFallbackRefresh);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) scheduleFallbackRefresh(); });
})();

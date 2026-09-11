(() => {
  'use strict';
  const Config = globalThis.DCBTextDetection;
  if (!Config || !globalThis.chrome?.storage?.sync || globalThis.__dcbTextDetectorLoaded) return;
  globalThis.__dcbTextDetectorLoaded = true;

  const BADGE_ATTR = 'data-dcb-text-detection-badge';
  const STYLE_ID = 'dcb-text-detection-style';
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
    '.txtcon_txt', '.written_dccon', '.dcbpv-dccon', `[${BADGE_ATTR}]`
  ].join(',');
  const MAX_RECORDS = 256;
  const MAX_QUEUE = 64;
  const MAX_CACHE = 128;
  const BATCH_SIZE = 4;
  const records = new Map();
  const queued = new Map();
  const cache = new Map();
  let settings = Config.normalize();
  let epoch = 0;
  let requestActive = false;
  let retryAfter = 0;
  let scanTimer = 0;
  let batchTimer = 0;
  let observer = null;
  let viewportObserver = null;
  let settingsChanged = false;

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      [${BADGE_ATTR}] {
        display: inline-block !important;
        float: none !important;
        position: static !important;
        width: auto !important;
        max-width: 100% !important;
        box-sizing: border-box !important;
        margin: 0 6px 4px 0 !important;
        padding: 2px 7px !important;
        border: 1px solid #cf9d3d !important;
        border-radius: 5px !important;
        background: #fff4d6 !important;
        color: #704400 !important;
        font: 11px/1.5 system-ui, sans-serif !important;
        text-indent: 0 !important;
        white-space: normal !important;
        overflow-wrap: anywhere !important;
        vertical-align: baseline !important;
        cursor: help !important;
      }
    `;
    (document.head || document.documentElement).appendChild(style);
  }

  function removeBadge(record) {
    record.badge?.remove();
    record.badge = null;
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
    const preview = node.closest(PREVIEW);
    return preview ? preview.querySelector('.dcbpv-title') : document.querySelector(TITLE_SELECTOR);
  }

  function snapshot(record) {
    const node = record.node;
    if (!node.isConnected || node.closest(EXCLUDE_SELECTOR)) return null;
    const body = textOf(node, 6000);
    if (body.replace(/\s/g, '').length < 8) return null;
    const titleNode = titleNodeFor(node);
    const input = { kind: record.kind, title: textOf(titleNode, 500), body };
    return { input, titleNode, key: JSON.stringify(input) };
  }

  function visible(node, margin = 0) {
    if (document.hidden || !node.isConnected || !node.getClientRects().length) return false;
    if (node.checkVisibility && !node.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) return false;
    const rect = node.getBoundingClientRect();
    return rect.bottom > -margin && rect.top < innerHeight + margin
      && rect.right > -margin && rect.left < innerWidth + margin;
  }

  function updateSnapshot(record) {
    const next = snapshot(record);
    if (next?.key !== record.key) {
      removeBadge(record);
      record.version += 1;
      record.key = next?.key || '';
      record.doneKey = '';
      record.input = next?.input || null;
      queued.delete(record.node);
    }
    record.titleNode = next?.titleNode || titleNodeFor(record.node);
    if (!visible(record.node)) removeBadge(record);
    return !!record.input;
  }

  function showResult(record, score) {
    if (!Config.isFlagged(score, settings)) {
      removeBadge(record);
      return;
    }
    if (record.badge?.isConnected || !visible(record.node)) return;
    const badge = document.createElement('span');
    badge.setAttribute(BADGE_ATTR, record.kind);
    badge.textContent = record.kind === 'post' ? '갈등 표현 참고' : '갈등 표현 주의';
    badge.title = '문장 표현에 대한 자동 분류 참고 표시입니다. 이용자·계정의 성향이나 의도를 입증하지 않으며 확률을 뜻하지 않습니다.'
      + (record.kind === 'post' ? ' 댓글용 모델을 게시글에 적용한 참고 결과로 정확도가 다를 수 있습니다.' : ' 오탐이 있을 수 있으므로 문맥을 직접 확인해 주세요.');
    badge.setAttribute('aria-label', `${badge.textContent}. ${badge.title}`);
    badge.tabIndex = 0;
    record.badge = badge;
    record.node.prepend(badge);
  }

  function remember(key, score) {
    cache.delete(key);
    cache.set(key, score);
    if (cache.size > MAX_CACHE) cache.delete(cache.keys().next().value);
  }

  function consider(record) {
    if (!settings.enabled || !settings[record.kind === 'post' ? 'posts' : 'comments']) return;
    if (!updateSnapshot(record) || !visible(record.node)) return;
    if (cache.has(record.key)) {
      const score = cache.get(record.key);
      remember(record.key, score);
      record.doneKey = record.key;
      showResult(record, score);
    } else if (record.doneKey !== record.key && !record.pending && queued.size < MAX_QUEUE) {
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
      if (!updateSnapshot(record) || !visible(node) || record.pending) continue;
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
        const score = response.results[index]?.score;
        const record = item.record;
        if (records.get(record.node) !== record || !updateSnapshot(record)
          || record.version !== item.version || record.key !== item.key) return;
        remember(item.key, score);
        record.doneKey = item.key;
        showResult(record, score);
      });
    } catch (_) {
      if (requestEpoch === epoch) {
        retryAfter = Date.now() + 60_000;
        queued.clear();
      }
    } finally {
      requestActive = false;
      batch.forEach(({ record }) => { record.pending = false; });
      if (settings.enabled && Date.now() >= retryAfter) {
        records.forEach(consider);
        scheduleBatch();
      }
    }
  }

  function canonical(node) {
    if (node.closest(EXCLUDE_SELECTOR)) return null;
    const previewBody = node.closest(`${PREVIEW} .dcbpv-comment-body`);
    if (previewBody) return { node: previewBody, kind: 'comment' };
    const post = node.closest(POST_SELECTOR);
    if (post) return { node: post.closest(`${PREVIEW} .dcbpv-article`) || post, kind: 'post' };
    if (node.matches('.cmt_txtbox')) {
      return { node: node.querySelector('.usertxt,.reply_txt,.comment_txt') || node, kind: 'comment' };
    }
    return { node, kind: 'comment' };
  }

  function forget(record) {
    removeBadge(record);
    queued.delete(record.node);
    viewportObserver?.unobserve(record.node);
    records.delete(record.node);
  }

  function scan() {
    scanTimer = 0;
    if (!settings.enabled) return;
    records.forEach((record) => {
      if (!visible(record.node, 300) || !settings[record.kind === 'post' ? 'posts' : 'comments']) forget(record);
    });
    for (const candidate of document.querySelectorAll(CANDIDATE_SELECTOR)) {
      const target = canonical(candidate);
      if (!target || !settings[target.kind === 'post' ? 'posts' : 'comments'] || !visible(target.node, 150)) continue;
      if (!records.has(target.node)) {
        if (records.size >= MAX_RECORDS) continue;
        const record = { ...target, key: '', doneKey: '', version: 0, pending: false, badge: null };
        records.set(target.node, record);
        viewportObserver?.observe(target.node);
      }
      consider(records.get(target.node));
    }
    scheduleBatch();
  }

  function scheduleScan() {
    if (!settings.enabled || scanTimer) return;
    scanTimer = setTimeout(scan, 120);
  }

  function ownedNode(node) {
    const element = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
    return !!element?.closest?.(`[${BADGE_ATTR}], #${STYLE_ID}`);
  }

  function onMutations(mutations) {
    if (!settings.enabled) return;
    const changed = mutations.filter((mutation) => {
      if (ownedNode(mutation.target)) return false;
      if (mutation.type !== 'childList') return true;
      return [...mutation.addedNodes, ...mutation.removedNodes].some((node) => !ownedNode(node));
    });
    if (!changed.length) return;
    records.forEach((record) => {
      if (!record.node.isConnected) return forget(record);
      const relevant = changed.some(({ target }) => record.node.contains(target)
        || target.contains?.(record.node) || record.titleNode?.contains(target));
      if (relevant) updateSnapshot(record);
    });
    scheduleScan();
  }

  function apply(value) {
    settings = Config.normalize(value);
    epoch += 1;
    retryAfter = 0;
    clearTimeout(scanTimer);
    clearTimeout(batchTimer);
    scanTimer = batchTimer = 0;
    queued.clear();
    records.forEach(forget);
    observer?.disconnect();
    viewportObserver?.disconnect();
    observer = viewportObserver = null;
    document.getElementById(STYLE_ID)?.remove();
    if (!settings.enabled || (!settings.posts && !settings.comments)) return;
    if (!document.documentElement) {
      document.addEventListener('DOMContentLoaded', () => apply(settings), { once: true });
      return;
    }
    ensureStyle();
    if (typeof IntersectionObserver === 'function') {
      viewportObserver = new IntersectionObserver((entries) => {
        entries.forEach(({ target }) => {
          const record = records.get(target);
          if (record) consider(record);
        });
        scheduleBatch();
      });
    }
    observer = new MutationObserver(onMutations);
    observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true,
      attributes: true, attributeFilter: ['class', 'style', 'hidden', 'aria-hidden', 'contenteditable'] });
    scan();
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'sync' || !changes[Config.key]) return;
    settingsChanged = true;
    apply(changes[Config.key].newValue);
  });
  chrome.storage.sync.get({ [Config.key]: Config.defaults }, (values) => {
    if (!settingsChanged) apply(values[Config.key]);
  });
  document.addEventListener('scroll', scheduleScan, { passive: true, capture: true });
  window.addEventListener('resize', scheduleScan, { passive: true });
  window.addEventListener('pageshow', scheduleScan);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) scheduleScan(); });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', scheduleScan, { once: true });
})();

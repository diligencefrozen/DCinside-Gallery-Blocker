// Verified against gall.dcinside.com/_js/comment.js?v=261021-5 (2026-10-26).
// Writing never uses the read bridge or the site's submit handler (which retries
// CAPTCHA and saves guest passwords). Credentials remain in the live document.
const previewCommentBusy = new Set();

function previewCommentArticle(raw) {
  try {
    const url = new URL(raw);
    return url.origin === 'https://gall.dcinside.com' && !url.username && !url.password
      && /^\/(?:mgallery\/|mini\/|person\/)?board\/view\/$/.test(url.pathname)
      && /^[a-zA-Z0-9_]+$/.test(url.searchParams.get('id') || '')
      && /^[1-9]\d*$/.test(url.searchParams.get('no') || '') ? url : null;
  } catch (_) { return null; }
}

// Runs in MAIN in the requesting top-level tab. No tokens/cookies are returned
// through extension messaging; only non-secret form metadata and comment records.
async function previewCommentInPage(request) {
  const fail = (code, extra = {}) => ({ ok: false, code, ...extra });
  const frames = [...document.querySelectorAll('iframe[data-dcbpv-compose-frame]')]
    .filter(frame => frame.dataset.dcbpvComposeFrame === request.key);
  if (frames.length !== 1) return fail('unavailable');
  const frame = frames[0];
  let win, doc, url;
  try {
    win = frame.contentWindow;
    doc = win.document;
    url = new URL(doc.URL);
    const expected = new URL(request.url);
    if (url.origin !== 'https://gall.dcinside.com' || url.pathname !== expected.pathname
      || url.searchParams.get('id') !== expected.searchParams.get('id')
      || url.searchParams.get('no') !== expected.searchParams.get('no')) return fail('unavailable');
  } catch (_) { return fail('unavailable'); }
  const value = id => doc.getElementById(id)?.value;
  const id = url.searchParams.get('id'), no = url.searchParams.get('no');
  const $ = win.jQuery;
  const expectedType = url.pathname.startsWith('/mgallery/') ? 'M'
    : url.pathname.startsWith('/mini/') ? 'MI' : url.pathname.startsWith('/person/') ? 'PR' : 'G';
  if (!$ || value('_GALLTYPE_') !== expectedType || !['Y', 'N'].includes(value('member_division'))
    || !doc.querySelector(`.repley_add[data-no="${no}"]`)
    || !value('e_s_n_o') || id === 'dclottery') return fail('unavailable');
  // Shared/reposted comment streams require a separate contract; don't guess.
  if (String($(doc).data('comment_id') || id) !== id
    || String($(doc).data('comment_no') || no) !== no) return fail('unavailable');
  const memo = doc.getElementById(`memo_${no}`);
  const maxLength = memo?.maxLength;
  if (!memo || memo.disabled || !Number.isInteger(maxLength) || maxLength < 1 || maxLength > 10000) return fail('unavailable');

  const targets = [];
  doc.querySelectorAll('.cmt_info[data-no],.reply_info[data-no]').forEach(row => {
    const target = row.dataset.no;
    const parent = row.matches('.reply_info') ? row.closest('.reply_list[p-no]')?.getAttribute('p-no') : target;
    if (!/^[1-9]\d*$/.test(target || '') || !/^[1-9]\d*$/.test(parent || '')
      || !row.querySelector('.btn_reply_write_all,.btn_reply_write,.btn_re_reply_write_all')
      || row.closest('.dory,.deleted,.del')) return;
    targets.push({ id: target, parent });
  });
  const uniqueTargets = targets.filter(t => targets.filter(other => other.id === t.id).length === 1);
  const hasChallenge = !!win._TS_CMT_?.mode;
  const challengeReady = () => !hasChallenge || !!win.ts_pass_left?.()
    || !!(win.turnstile && win.ts_cmt?.id != null && win.turnstile.getResponse(win.ts_cmt.id));
  if (request.operation === 'prepare') {
    // Keep real native inputs and their security event handlers. A synthetic
    // service_code or simulated keyboard/mouse history is never used.
    let input = memo;
    let button = doc.querySelector(`.repley_add[data-no="${no}"]`);
    if (request.target) {
      const target = uniqueTargets.find(item => item.id === request.target);
      if (!target || typeof win.addReplyForm !== 'function') return fail('target');
      const row = doc.getElementById(`comment_li_${target.parent}`);
      if (!row) return fail('target');
      let list = doc.getElementById(`reply_list_${target.parent}`);
      if (!list) {
        list = doc.createElement('ul');
        list.id = `reply_list_${target.parent}`;
        list.className = 'reply_list';
        list.setAttribute('p-no', target.parent);
        row.appendChild(list);
      }
      win.addReplyForm(target.parent, 0, target.id !== target.parent ? 're_reply' : '', target.id);
      input = doc.getElementById(`memo_${target.parent}`);
      button = doc.querySelector(`.repley_add[r_idx="${target.parent}"]`);
      if (!input || !button) return fail('target');
    }
    const box = input.closest('.cmt_write_box');
    if (!box) return fail('unavailable');
    box.id = 'dcbpv-native-editor';
    doc.body.appendChild(box);
    input.value = request.draft || '';
    const notify = (kind, detail = {}) => window.postMessage({ type: 'dcb.previewComment.event', key: request.key, kind, ...detail }, location.origin);
    const sendDraft = () => notify('draft', { draft: input.value });
    input.addEventListener('input', sendDraft);
    // Prevent native Enter-to-submit shortcuts; only the native registration
    // button's real click can write. Textarea Enter still inserts a newline.
    box.addEventListener('keydown', event => {
      if (event.key === 'Enter') event.stopPropagation();
      if (event.key === 'Escape' && !event.isComposing) { event.preventDefault(); notify('escape'); }
    });
    box.querySelectorAll('button').forEach(node => {
      if (node !== button) node.style.setProperty('display', 'none', 'important');
    });
    const editorStyle = doc.createElement('style');
    editorStyle.textContent = `html,body{margin:0!important;overflow-x:hidden!important;background:#f8fafc!important}
      body{visibility:hidden!important}#dcbpv-native-editor,#dcbpv-native-editor *{visibility:visible!important}
      #dcbpv-native-editor{position:absolute!important;inset:8px 8px auto!important;width:auto!important;min-width:0!important;padding:8px!important;margin:0!important;box-sizing:border-box!important;background:#f8fafc!important;color:#172033!important}
      #dcbpv-native-editor .fl,#dcbpv-native-editor .cmt_txt_cont,#dcbpv-native-editor .cmt_write{float:none!important;width:auto!important;margin:0!important;padding:0!important}
      #dcbpv-native-editor .fl{display:flex!important;flex-wrap:wrap!important;gap:8px!important}
      #dcbpv-native-editor .user_info_input{width:140px!important;max-width:100%!important}
      #dcbpv-native-editor input{box-sizing:border-box!important;width:100%!important}
      #dcbpv-native-editor textarea{box-sizing:border-box!important;width:100%!important;height:100px!important;margin:8px 0!important;padding:8px!important;border:1px solid #94a3b8!important;background:#fff!important;color:#172033!important}
      #dcbpv-native-editor .dccon_guidebox,#dcbpv-native-editor .cmt_textarea_label,#dcbpv-native-editor .tip_box2{display:none!important}
      #dcbpv-native-auth,#dcbpv-native-auth *{visibility:visible!important}
      #dcbpv-native-auth{display:block!important;position:absolute!important;top:240px!important;left:8px!important;margin:0!important}`;
    doc.head.appendChild(editorStyle);
    // Native direct security handlers run first; stop before the document's
    // delegated submit handler (automatic CAPTCHA retry / password persistence).
    button.addEventListener('click', async event => {
      const nativeRejected = event.defaultPrevented;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (!event.isTrusted || button.disabled) return;
      sendDraft();
      if (nativeRejected || !doc.service_code) { notify('result', { result: fail('authentication') }); return; }
      button.disabled = true;
      notify('submitting');
      const suffix = request.target ? uniqueTargets.find(item => item.id === request.target)?.parent : no;
      const result = await previewCommentInPage({ ...request, operation: 'submit', activation: event,
        memo: input.value, name: value(`name_${suffix}`) || '',
        password: value(`password_${suffix}`) || '' });
      const password = doc.getElementById(`password_${suffix}`);
      if (password) password.value = '';
      button.disabled = result.code === 'uncertain' || result.ok;
      notify('result', { result });
    });
    sendDraft();
    if (hasChallenge && !challengeReady()) {
      win.ts_cmt_load?.();
      for (let n = 0; n < 40 && frame.isConnected && !win.ts_cmt?.box; n++) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      if (win.ts_cmt?.box) win.ts_cmt.box.id = 'dcbpv-native-auth';
    }
    return { ok: true, member: value('member_division') === 'Y', maxLength,
      targets: uniqueTargets, auth: hasChallenge && !challengeReady(),
      captcha: value('kcaptcha_use') === 'Y' };
  }
  if (request.operation !== 'submit' || !request.activation?.isTrusted) return fail('unavailable');
  if (!challengeReady() || value('kcaptcha_use') === 'Y'
    || doc.querySelector('.grecaptcha-submit')) return fail('authentication');
  if (!request.memo?.trim() || request.memo.length > maxLength) return fail('input');
  const target = request.target ? uniqueTargets.find(t => t.id === request.target) : null;
  if (request.target && !target) return fail('target');
  const suffix = target?.parent || no;
  const hasName = !!doc.getElementById(`name_${suffix}`);
  const hasPassword = !!doc.getElementById(`password_${suffix}`);
  const useGallNickname = value(request.target ? 'use_gall_nick_reply' : 'use_gall_nick') === 'Y';
  if ((hasName && !useGallNickname && !request.name?.trim()) || (hasPassword && request.password?.length < 2)) return fail('input');
  // A per-document guard also survives background worker suspension/restart.
  if (frame.dataset.dcbpvWriting === '1') return fail('busy');
  frame.dataset.dcbpvWriting = '1';
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  let wrote = false;
  const ajax = async (path, body) => {
    const response = await win.fetch(path, { method: 'POST', credentials: 'include',
      cache: 'no-store', redirect: 'error', signal: controller.signal,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', 'X-Requested-With': 'XMLHttpRequest' }, body });
    if (!response.ok) throw { status: response.status };
    return response.text();
  };
  const read = async () => {
    const body = new URLSearchParams({ id, no, cmt_id: id, cmt_no: no,
      focus_cno: target?.id || '', focus_pno: target?.parent || '', e_s_n_o: value('e_s_n_o'),
      comment_page: '1', sort: 'D', prevCnt: '0', _GALLTYPE_: expectedType,
      secret_article_key: value('secret_article_key') || '', clean: '', nptest: '' });
    const data = JSON.parse(await ajax('/board/comment/', body.toString()));
    if (!Array.isArray(data.comments) || !Number.isFinite(Number(data.total_cnt))) throw new Error();
    return data;
  };
  try {
    const before = await read();
    if (!frame.isConnected || frame.dataset.dcbpvCancelled === '1') return fail('cancelled');
    if (target && !before.comments.some(item => String(item.no) === target.id
      && String(Number(item.depth) > 0 ? item.c_no : item.no) === target.parent
      && item.del_yn !== 'Y')) return fail('target');
    const body = new URLSearchParams({ id, no, reply_no: target?.id || 'undefined', memo: request.memo,
      _GALLTYPE_: expectedType, c_gall_id: id, c_gall_no: no,
      t_vch2: String($(doc).data('t_vch2')), t_vch2_chk: String($(doc).data('t_vch2_chk')),
      service_code: doc.service_code, 'g-recaptcha-response': '', rc_key: String(win.dc_rc_key), headTail: '""' });
    if (target) body.set('c_no', target.parent);
    for (const field of ['cur_t', 'check_6', 'check_7', 'check_8', 'check_9', 'check_10', 'recommend', 'c_r_k_x_z']) {
      if (value(field) == null) return fail('unavailable');
      body.set(field, value(field));
    }
    if (hasName) body.set('name', request.name);
    if (hasPassword) body.set('password', request.password);
    if (doc.getElementById('use_gall_nick')) {
      body.set('use_gall_nick', useGallNickname ? 'Y' : 'N');
      body.set('gall_nick_name', value(`gall_nick_name_${suffix}`) || '');
    }
    if (hasChallenge) {
      if (typeof win.ts_cmt_fields !== 'function') return fail('authentication');
      const fields = new URLSearchParams(win.ts_cmt_fields().replace(/^&/, ''));
      for (const [key, val] of fields) {
        if (!['cf-turnstile-response', 'ts_state', 'ts_focus_ms', 'ts_token_ms', 'ts_test'].includes(key)) return fail('authentication');
        body.set(key, val);
      }
    }
    wrote = true;
    const response = (await ajax('/board/forms/comment_submit', body.toString())).trim();
    if (response.split('||')[0].trim() === 'false') {
      return fail(response.split('||')[1] === 'captcha' ? 'authentication' : 'rejected');
    }
    // HTTP 200 / non-false text alone is not evidence of registration.
    const after = await read();
    const previous = new Set(before.comments.map(item => String(item.no)));
    const plain = raw => {
      const parsed = new DOMParser().parseFromString(String(raw).replace(/<br\s*\/?\s*>/gi, '\n'), 'text/html');
      parsed.querySelectorAll('a[class*="mention"][class*="deco"]').forEach(node => node.remove());
      return parsed.body.textContent.replace(/\r\n/g, '\n').trim();
    };
    const added = after.comments.filter(item => /^[1-9]\d*$/.test(String(item.no)) && !previous.has(String(item.no))
      && plain(item.memo) === request.memo.replace(/\r\n/g, '\n').trim()
      && (target ? String(item.c_no) === target.parent : String(item.depth) === '0'));
    if (added.length !== 1 || Number(after.total_cnt) <= Number(before.total_cnt)) return fail('uncertain');
    return { ok: true, comments: after.comments, total: Number(after.total_cnt), addedId: String(added[0].no) };
  } catch (error) {
    return fail(wrote ? 'uncertain' : 'network', { status: Number(error?.status || 0) });
  } finally {
    clearTimeout(timer);
    delete frame.dataset.dcbpvWriting;
  }
}

async function handlePreviewCommentMessage(message, sender) {
  const article = previewCommentArticle(message.url);
  const source = previewCommentArticle(sender.url) || (() => {
    try { const url = new URL(sender.url); return url.origin === 'https://gall.dcinside.com' ? url : null; } catch (_) { return null; }
  })();
  if (!article || !source || sender.id !== chrome.runtime.id || sender.frameId !== 0
    || !Number.isInteger(sender.tab?.id) || !/^[a-f0-9-]{36}$/.test(message.key || '')
    || message.operation !== 'prepare') return { ok: false, code: 'unavailable' };
  if (typeof message.draft !== 'string' || message.draft.length > 10000
    || !/^(?:[1-9]\d*)?$/.test(message.target || '')) return { ok: false, code: 'input' };
  const key = `${sender.tab.id}:${article.pathname}:${article.searchParams.get('id')}:${article.searchParams.get('no')}`;
  if (previewCommentBusy.has(key)) return { ok: false, code: 'busy' };
  previewCommentBusy.add(key);
  try {
    const results = await chrome.scripting.executeScript({ target: { tabId: sender.tab.id, frameIds: [0] },
      world: 'MAIN', func: previewCommentInPage,
      args: [{ operation: message.operation, url: article.href, key: message.key,
        draft: message.draft, target: message.target }] });
    return results[0]?.result || { ok: false, code: 'unavailable' };
  } catch (_) { return { ok: false, code: message.operation === 'submit' ? 'uncertain' : 'unavailable' }; }
  finally { previewCommentBusy.delete(key); }
}

chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (message?.type !== 'dcb.previewComment') return;
  handlePreviewCommentMessage(message, sender).then(respond, () => respond({ ok: false, code: 'unavailable' }));
  return true;
});

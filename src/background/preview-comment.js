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

  const nativeTargets = () => {
    const targets = [];
    doc.querySelectorAll('.cmt_info[data-no],.reply_info[data-no]').forEach(row => {
      const target = row.dataset.no;
      const parent = row.matches('.reply_info') ? row.closest('.reply_list[p-no]')?.getAttribute('p-no') : target;
      if (!/^[1-9]\d*$/.test(target || '') || !/^[1-9]\d*$/.test(parent || '')
        || !row.querySelector('.btn_reply_write_all,.btn_reply_write,.btn_re_reply_write_all')
        || row.closest('.dory,.deleted,.del')) return;
      targets.push({ id: target, parent });
    });
    const counts = new Map();
    for (const target of targets) counts.set(target.id, (counts.get(target.id) || 0) + 1);
    return targets.filter(target => counts.get(target.id) === 1);
  };
  const uniqueTargets = frame.__dcbpvEditor?.targets || nativeTargets();
  const hasChallenge = !!win._TS_CMT_?.mode;
  const challengeReady = () => !hasChallenge || !!win.ts_pass_left?.()
    || !!(win.turnstile && win.ts_cmt?.id != null && win.turnstile.getResponse(win.ts_cmt.id));
  const notify = (kind, detail = {}) => {
    const status=doc.getElementById('dcbpv-inline-status');
    if(status&&kind==='auth')status.textContent=detail.message||'';
    if(status&&kind==='submitting')status.textContent='전송 중…';
    if(status&&kind==='result')status.textContent=detail.result?.ok?'완료':'';
    window.postMessage({ type: 'dcb.previewComment.event', key: request.key, kind, ...detail }, location.origin);
  };
  if (request.operation === 'select' || request.operation === 'delete') {
    if (!frame.__dcbpvEditor) return fail('unavailable');
    return request.operation === 'select' ? frame.__dcbpvEditor.select(request.target, request.draft)
      : frame.__dcbpvEditor.openDelete(request.target);
  }
  if (request.operation === 'prepare') {
    if (frame.__dcbpvEditor) return frame.__dcbpvEditor.metadata();
    const input = memo;
    const button = doc.querySelector(`.repley_add[data-no="${no}"]`);
    const box = input.closest('.cmt_write_box');
    if (!box) return fail('unavailable');
    const session = frame.__dcbpvEditor = { target: '', targets: uniqueTargets, owned: new Map(), deleted: new Set(), records: null,
      uncertain: false, busy: false, captchaMode: '', captchaScope: '', widget: null, drafts: new Map(), mediaDrafts: new Map() };
    const surface = doc.createElement('div');
    surface.id = 'dcbpv-editor-surface';
    doc.body.appendChild(surface);
    box.id = 'dcbpv-native-editor';
    surface.appendChild(box);
    const authHost = doc.createElement('div');
    authHost.id = 'dcbpv-auth-host';
    surface.appendChild(authHost);
    const deleteBox = doc.createElement('section');
    deleteBox.id = 'dcbpv-delete-confirm';
    deleteBox.hidden = true;
    surface.appendChild(deleteBox);
    input.value = request.draft || '';
    input.setAttribute('aria-label', '댓글 내용');
    const password = doc.getElementById(`password_${no}`);
    if (password) password.autocomplete = 'off';
    // Expose only input/authentication surfaces. Hidden article layout must not
    // contribute document height or create a second scrolling viewport.
    const style = doc.createElement('style');
    style.textContent = `
      html,body{margin:0!important;padding:0!important;min-width:0!important;width:100%!important;height:auto!important;min-height:0!important;overflow:hidden!important;background:transparent!important}
      body{display:flex!important;flex-direction:column!important}
      body>:not(#dcbpv-editor-surface):not(.dcbpv-auth-path):not(.dcbpv-native-auth){display:none!important}
      .dcbpv-auth-path{display:contents!important}
      .dcbpv-auth-path>:not(.dcbpv-auth-path):not(.dcbpv-native-auth){display:none!important}
      .dcbpv-native-auth{visibility:visible!important;position:relative!important;inset:auto!important;margin:8px 0!important;order:2}
      #dcbpv-editor-surface{display:flex;flex-direction:column;box-sizing:border-box;padding:4px;color:#253047;font:13px/1.5 sans-serif;order:1}
      #dcbpv-native-editor{display:contents!important;position:static!important;inset:auto!important;width:auto!important;min-width:0!important;border:0!important;margin:0!important;padding:0!important;background:transparent!important}
      #dcbpv-native-editor .fl,#dcbpv-native-editor .cmt_txt_cont,#dcbpv-native-editor .cmt_write{float:none!important;position:static!important;width:auto!important;min-width:0!important;margin:0!important;padding:0!important}
      #dcbpv-native-editor .fl{display:flex!important;flex-wrap:wrap!important;gap:8px!important}
      #dcbpv-native-editor>.fl{order:1}
      #dcbpv-native-editor .cmt_txt_cont{display:contents!important}
      #dcbpv-native-editor .cmt_write{order:2}
      #dcbpv-auth-host,#dcbpv-editor-surface>.dcbpv-native-auth,#dcbpv-native-editor .cmt_txt_cont>:not(.cmt_write):not(.cmt_cont_bottm){order:3}
      #dcbpv-native-editor .cmt_cont_bottm,#dcbpv-native-editor .cmt_txt_cont>.repley_add{order:4}
      #dcbpv-delete-confirm{order:5}
      #dcbpv-native-editor .user_info_input{box-sizing:border-box!important;flex:1 1 130px!important;width:auto!important;min-width:0!important;max-width:100%!important;height:auto!important;margin:0!important}
      #dcbpv-native-editor input:not([type=hidden]){box-sizing:border-box!important;max-width:100%!important;height:34px!important;padding:6px 8px!important;background:#fff!important;color:#172033!important;border:1px solid #94a3b8!important;border-radius:5px}
      #dcbpv-native-editor .user_info_input input{width:100%!important}
      #dcbpv-native-editor textarea{box-sizing:border-box!important;display:block!important;width:100%!important;min-width:0!important;height:100px!important;min-height:100px!important;margin:8px 0!important;padding:8px!important;border:1px solid #94a3b8!important;border-radius:6px!important;background:#fff!important;color:#172033!important;white-space:pre-wrap!important;resize:vertical!important}
      #dcbpv-native-editor .cmt_textarea_label,#dcbpv-native-editor .tip_box2{display:none!important}
      #dcbpv-native-editor .cmt_cont_bottm{display:flex!important;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px}
      #dcbpv-native-editor .dccon_guidebox{position:relative!important;float:none!important;min-width:0;max-width:100%}
      #dcbpv-native-editor :is(#div_con,#div_txtcon){position:relative!important;inset:auto!important;max-width:100%!important;width:min(440px,100%)!important;max-height:340px;overflow:auto;box-sizing:border-box}
      #dcbpv-native-editor :is(#div_con,#div_txtcon) :is(.dccon_list,.dccon_listbox,.txt_dccon_box){max-width:100%!important;box-sizing:border-box}
      #dcbpv-native-editor .repley_add{min-width:120px!important;min-height:42px!important;float:none!important;margin-left:auto!important;display:inline-flex;align-items:center;justify-content:center;gap:6px;font-weight:700;border-radius:10px;transition:transform .16s,background .16s}
      #dcbpv-native-editor .repley_add:not(:disabled):hover{background:#2449bc;transform:translateY(-1px)}
      #dcbpv-native-editor .repley_add:not(:disabled):active{transform:translateY(1px)}
      #dcbpv-native-editor .repley_add:focus-visible{outline:3px solid #7ba7fa;outline-offset:2px}
      #dcbpv-selection{order:3;display:flex;gap:8px;align-items:center;overflow-wrap:anywhere}
      #dcbpv-selection[hidden]{display:none}
      @media(prefers-reduced-motion:reduce){#dcbpv-native-editor .repley_add{transition:none!important;transform:none!important}}
      #dcbpv-native-editor .cmt_cont_bottm{height:auto!important;min-height:34px!important}
      #dcbpv-native-editor .repley_add,#dcbpv-delete-confirm button{padding:7px 16px;border:0;border-radius:6px;background:#315bea;color:#fff;cursor:pointer}
      #dcbpv-native-editor button:disabled,#dcbpv-delete-confirm button:disabled{opacity:.5;cursor:default}
      #dcbpv-delete-confirm{padding:10px;margin-top:8px;border:1px solid #94a3b8;border-radius:6px}
      #dcbpv-delete-confirm[hidden]{display:none}
      #dcbpv-delete-confirm input{box-sizing:border-box;max-width:100%;padding:6px;margin:6px 0}
      @media(prefers-color-scheme:dark){#dcbpv-editor-surface{color:#e2e8f0}#dcbpv-native-editor input:not([type=hidden]),#dcbpv-native-editor textarea{background:#1e293b!important;color:#f1f5f9!important}}
    `;
    doc.head.appendChild(style);
    // Keep CAPTCHA refresh and nickname controls. Only unrelated post actions
    // (DCCon, vote+submit) are hidden; native security listeners stay attached.
    box.querySelectorAll('.repley_add_vote,.btn_dccon_guide').forEach(node => node.style.setProperty('display', 'none', 'important'));
    button.textContent='➤ 댓글 등록';button.setAttribute('aria-label','댓글 등록');
    const tools=box.querySelector('.dccon_guidebox');
    let toolbar=box.querySelector('.cmt_cont_bottm');
    if(!toolbar){toolbar=doc.createElement('div');toolbar.className='cmt_cont_bottm';(box.querySelector('.cmt_txt_cont')||box).append(toolbar);}
    if(tools)toolbar.append(tools);
    toolbar.append(button); // Same-document moves retain native security listeners.
    const counter=doc.createElement('small');counter.textContent=`${input.value.length} / ${maxLength}자`;
    const inlineStatus=doc.createElement('span');inlineStatus.id='dcbpv-inline-status';inlineStatus.setAttribute('aria-live','polite');
    if(tools){tools.append(counter,inlineStatus);counter.style.margin='0 8px';}
    const selection=doc.createElement('div');selection.id='dcbpv-selection';selection.hidden=true;surface.append(selection);
    const selectedLabel=doc.createElement('span'),clearSelection=doc.createElement('button');clearSelection.type='button';clearSelection.textContent='선택 취소';selection.append(selectedLabel,clearSelection);
    const showSelection=()=>{const media=session.mediaDrafts.get(session.target);selection.hidden=!media;selectedLabel.textContent=media?.kind==='dccon'?`디시콘 ${media.details.length}개 선택`:media?`글자콘: ${media.text}`:'';};
    clearSelection.onclick=event=>{if(event.isTrusted&&!session.busy){session.mediaDrafts.delete(session.target);showSelection();}};
    // Capture native selection before its delegated handler can submit/retry.
    doc.addEventListener('click',event=>{
      const icon=event.target.closest('.img_dccon'),textButton=event.target.closest('#btn_txtcon_submit');
      if((!icon&&!textButton)||!box.contains(event.target))return;
      event.preventDefault();event.stopImmediatePropagation();
      if(!event.isTrusted||session.busy||session.uncertain)return;
      if(icon){
        const packageId=icon.getAttribute('package_idx'),detail=icon.getAttribute('detail_idx');
        if(!/^[1-9]\d*$/.test(packageId||'')||!/^[1-9]\d*$/.test(detail||'')){notify('auth',{message:'이 디시콘은 원문에서 확인해 주세요.'});return;}
        const double=!!doc.getElementById('double_dcon')?.checked,old=session.mediaDrafts.get(session.target);
        const media=double&&old?.kind==='dccon'&&old.details.length===1?{...old,packages:[...old.packages,packageId],details:[...old.details,detail]}:{kind:'dccon',packages:[packageId],details:[detail],double,big:!!doc.getElementById('big_dcon')?.checked};
        session.mediaDrafts.set(session.target,media);
        if(!double||media.details.length===2)doc.getElementById('div_con').style.display='none';
      }else{
        const text=doc.getElementById('txtcon_input')?.value,colors=win.txtcon_sel_colors?.();
        if(!text?.trim()||!colors){notify('auth',{message:'글자콘 내용과 색상을 확인해 주세요.'});return;}
        session.mediaDrafts.set(session.target,{kind:'txtcon',text,bg:colors.bg,color:colors.txt});win.txtcon_panel_close?.();
      }
      showSelection();resize();button.focus({preventScroll:true});
    },true);
    const sendDraft = () => { counter.textContent=`${input.value.length} / ${maxLength}자`;session.drafts.set(session.target, input.value); notify('draft', { draft: input.value, target: session.target }); };
    input.addEventListener('input', sendDraft);
    box.addEventListener('keydown', event => {
      if (event.key === 'Enter') event.stopPropagation();
      if (event.key === 'Escape' && !event.isComposing) { event.preventDefault(); notify('escape'); }
    });
    let lastHeight = 0, resizing = false, lastMetadata = '';
    const expose = node => {
      if (!node.classList.contains('dcbpv-native-auth')) node.classList.add('dcbpv-native-auth');
      for (let parent = node.parentElement; parent && parent !== doc.body && parent !== surface; parent = parent.parentElement) {
        if (!parent.classList.contains('dcbpv-auth-path')) parent.classList.add('dcbpv-auth-path');
      }
    };
    const resize = () => {
      if (!frame.isConnected || resizing) return;
      resizing = true;
      requestAnimationFrame(() => {
        resizing = false;
        if (win.ts_cmt?.box) expose(win.ts_cmt.box);
        const selectText=doc.getElementById('btn_txtcon_submit');if(selectText&&selectText.textContent!=='선택')selectText.textContent='선택';
        doc.querySelectorAll('body > div').forEach(node => {
          if (node !== surface && node.querySelector('iframe[src*="recaptcha/"]')) expose(node);
        });
        const bottoms = [surface, ...doc.querySelectorAll('.dcbpv-native-auth')].map(node => {
          const rect = node.getBoundingClientRect();
          return rect.width && rect.height ? rect.bottom : 0;
        });
        const height = Math.max(140, Math.ceil(Math.max(...bottoms)) + 8);
        if (height !== lastHeight && height < 2000) { lastHeight = height; notify('size', { height }); }
        // Native comments can finish loading after the iframe load event.
        // Publish only changed, non-secret metadata; never reload the editor.
        if (session.metadata) {
          if (!session.records) session.targets = nativeTargets();
          const metadata = session.metadata(), serialized = JSON.stringify(metadata);
          if (serialized !== lastMetadata) { lastMetadata = serialized; notify('metadata', {metadata}); }
        }
      });
    };
    const observer = new MutationObserver(resize);
    observer.observe(doc.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'class', 'hidden'] });
    const sizeObserver = new ResizeObserver(resize);
    sizeObserver.observe(surface);
    win.addEventListener('resize', resize);
    const nativeOwned = () => value('member_division') === 'Y' ? [...doc.querySelectorAll('.cmt_mdf_del[data-my="Y"][re_no]')]
      .filter(node => node.querySelector('.btn_cmt_delete')).map(node => node.getAttribute('re_no')) : [];
    session.metadata = () => ({ ok: true, maxLength, inlineCounter:!!tools, member: value('member_division') === 'Y', targets: session.targets,
      owned: [...new Set([...nativeOwned(), ...session.owned.keys(), ...(session.records || []).filter(row => value('member_division') === 'Y' && row.my_cmt === 'Y' && row.del_btn === 'Y').map(row => String(row.no))])].filter(id=>!session.deleted.has(id)),
      dates: session.records ? session.records.map(row => ({id:String(row.no),date:String(row.reg_date || '')}))
        : [...doc.querySelectorAll('.cmt_info[data-no],.reply_info[data-no]')].map(row=>{const time=row.querySelector('.date_time');return {id:row.dataset.no,date:time?.getAttribute('title')||time?.textContent||''};}) });
    session.resetAuth = () => {
      if (session.widget != null) { try { win.grecaptcha.reset(session.widget); } catch (_) {} }
      session.captchaMode = ''; session.captchaScope = '';
      authHost.hidden = true;
    };
    session.select = (target = '', draft) => {
      if (session.busy || session.uncertain) return fail('busy');
      if (target && !session.targets.some(row => row.id === target)) return fail('target');
      sendDraft();
      session.target = target;
      showSelection();
      box.querySelectorAll('.tx_dccon').forEach(control=>{const parent=session.targets.find(row=>row.id===target)?.parent;if(parent){control.setAttribute('r_idx',parent);control.setAttribute('reply_no',target);}else{control.removeAttribute('r_idx');control.removeAttribute('reply_no');}});
      doc.querySelectorAll('#div_con,#div_txtcon').forEach(panel=>panel.style.display='none');
      input.value = typeof draft === 'string' ? draft : session.drafts.get(target) || '';
      session.resetAuth();
      deleteBox.hidden = true;
      sendDraft(); resize();
      return session.metadata();
    };
    session.showCaptcha = async (mode, scope) => {
      if(mode==='v3' && (session.widget!=null || (win.grecaptcha && session.loadedCaptchaMode!=='v3')))mode='v2';
      session.captchaMode = mode; session.captchaScope = scope; authHost.hidden = false;
      if (mode === 'v3') {
        if(!win.dc_rc_new_v3){notify('auth',{message:'사이트 인증 키를 확인하지 못했습니다. 원문에서 확인해 주세요.'});return;}
        if(!win.grecaptcha?.execute){
          try{await new Promise((resolve,reject)=>{const script=doc.createElement('script');script.src=`https://www.google.com/recaptcha/api.js?render=${encodeURIComponent(win.dc_rc_new_v3)}`;script.onload=resolve;script.onerror=reject;doc.head.appendChild(script);});session.loadedCaptchaMode='v3';}
          catch(_){notify('auth',{message:'추가 인증을 불러오지 못했습니다. 연결을 확인해 주세요.'});return;}
        }
        notify('auth', { message: '추가 인증이 필요합니다. 등록 또는 삭제 확인 버튼을 다시 누르면 사이트 인증 후 한 번 전송합니다.' }); return;
      }
      if (!win.dc_rc_new_v2) { notify('auth', { message: '사이트 인증 키를 확인하지 못했습니다. 원문에서 확인해 주세요.' }); return; }
      try {
        if (!win.grecaptcha?.render) {
          await new Promise((resolve, reject) => {
            const script = doc.createElement('script');
            script.src = 'https://www.google.com/recaptcha/api.js?render=explicit';
            script.onload = resolve; script.onerror = reject; doc.head.appendChild(script);
          });
          for (let i=0; i<50 && !win.grecaptcha?.render; i++) await new Promise(resolve=>setTimeout(resolve,100));
        }
        if (session.widget == null) session.widget = win.grecaptcha.render(authHost, {sitekey:win.dc_rc_new_v2, size:'compact',
          callback:()=>notify('auth',{message:'인증 완료'}),
          'expired-callback':()=>notify('auth',{message:'인증이 만료됐습니다. 인증 영역에서 다시 확인해 주세요.'})});
        else win.grecaptcha.reset(session.widget);
        resize();
      } catch (_) { notify('auth', {message:'인증 화면을 불러오지 못했습니다. 연결을 확인하거나 원문에서 인증해 주세요.'}); }
    };
    session.authFields = async (scope, action) => {
      if (!session.captchaMode || session.captchaScope !== scope) return {};
      if (session.captchaMode === 'v2') {
        const token = win.grecaptcha?.getResponse(session.widget);
        return token ? {'g-recaptcha-response':token} : null;
      }
      if (!win.grecaptcha?.execute || !win.dc_rc_new_v3) return null;
      if(win.grecaptcha.ready)await new Promise(resolve=>win.grecaptcha.ready(resolve));
      const token = await win.grecaptcha.execute(win.dc_rc_new_v3,{action});
      return token ? {'g-recaptcha-token':token} : null;
    };
    session.openDelete = target => {
      if (session.busy || !session.metadata().owned.includes(target)) return fail('ownership');
      session.resetAuth();
      deleteBox.replaceChildren(); deleteBox.hidden = false;
      const notice = doc.createElement('p');
      notice.textContent = win.chk_notice_comment_avoid?.(target)
        ? `이 댓글을 삭제할까요? ${value('notice_comment_del_avoid_msg') || '공지 댓글 삭제에 따른 갤러리 제한이 적용될 수 있습니다.'}` : '내 댓글을 삭제할까요?';
      const secret = doc.createElement('input'); secret.type='password'; secret.autocomplete='off'; secret.placeholder='댓글 비밀번호'; secret.setAttribute('aria-label','삭제할 댓글 비밀번호');
      const guest = session.owned.has(target) && session.owned.get(target) != null;
      secret.hidden = !guest; secret.value = guest ? session.owned.get(target) : '';
      const confirm = doc.createElement('button'); confirm.type='button'; confirm.textContent='삭제 확인'; confirm.dataset.dcbpvDeleteConfirm='1';
      const cancel = doc.createElement('button'); cancel.type='button'; cancel.textContent='취소'; cancel.onclick=()=>{if(!session.busy){deleteBox.hidden=true;session.resetAuth();resize();}};
      confirm.addEventListener('click',async event=>{
        if (!event.isTrusted || session.busy || confirm.disabled) return;
        session.busy=true; confirm.disabled=true; button.disabled=true; cancel.disabled=true; notify('submitting',{operation:'delete'});
        let result;
        try { result=await previewCommentInPage({...request,operation:'delete-submit',target,activation:event,password:secret.value}); }
        catch (_) { result=fail('uncertain'); }
        session.busy=false; button.disabled=session.uncertain; cancel.disabled=false;
        confirm.disabled=result.code==='uncertain';
        if(result.ok){deleteBox.hidden=true;session.owned.delete(target);session.deleted.add(target);session.resetAuth();}
        if(result.comments) session.acceptRecords(result.comments);
        notify('result',{result:{...result,operation:'delete',...session.metadata(),ok:result.ok}});
        if(result.captcha) await session.showCaptcha(result.captcha,`delete:${target}`);
        resize();
      });
      deleteBox.append(notice,secret,confirm,cancel); resize(); return session.metadata();
    };
    session.acceptRecords = records => {
      session.records=records;
      const valid=records.filter(row=>/^[1-9]\d*$/.test(String(row.no)) && row.del_yn!=='Y' && !/삭제된 댓글/.test(row.memo||''));
      const counts=new Map();
      for(const row of valid){const id=String(row.no);counts.set(id,(counts.get(id)||0)+1);}
      session.targets=valid.map(row=>({id:String(row.no),parent:Number(row.depth)>0?String(row.c_no):String(row.no)}))
        .filter(row=>/^[1-9]\d*$/.test(row.parent)&&counts.get(row.id)===1&&counts.get(row.parent)===1);
    };
    button.addEventListener('click', async event => {
      const nativeRejected=event.defaultPrevented;
      event.preventDefault(); event.stopImmediatePropagation();
      if(!event.isTrusted || button.disabled || session.busy || session.uncertain) return;
      sendDraft();
      const media=session.mediaDrafts.get(session.target);
      if(media?.kind==='dccon'&&media.double&&media.details.length!==2){notify('auth',{message:'더블콘은 디시콘 2개를 선택해 주세요.'});return;}
      if(!media&&(nativeRejected || !doc.service_code)){notify('result',{result:fail('authentication')});return;}
      session.busy=true; button.disabled=true; input.readOnly=true; notify('submitting');
      const submittedPassword=password?.value||'';
      let result;
      try {result=await previewCommentInPage({...request,operation:'submit',target:session.target,activation:event,memo:input.value,media,name:value(`name_${no}`)||'',password:submittedPassword});}
      catch(_){result=fail('uncertain');}
      session.busy=false; input.readOnly=false;
      session.uncertain=result.code==='uncertain'; button.disabled=session.uncertain;
      if(result.ok){
        session.mediaDrafts.delete(session.target);showSelection();
        if(media?.kind==='txtcon')win.txtcon_recent_add?.(media.text);
        if(media?.kind==='dccon')win.recent_list='';
        session.owned.set(result.addedId,password ? submittedPassword : null);
        session.drafts.delete(session.target); session.target=''; input.value=''; session.drafts.set('','');
        session.resetAuth();
        if(value('kcaptcha_use')==='Y'){const code=doc.getElementById(`code_${no}`);if(code)code.value='';win.kcaptcha_init?.(no);}
        input.focus({preventScroll:true});
      }
      if(result.comments)session.acceptRecords(result.comments);
      if(!result.ok&&session.widget!=null){try{win.grecaptcha.reset(session.widget);}catch(_){}}
      notify('result',{result:{...result,...session.metadata(),ok:result.ok}});
      sendDraft();
      if(result.captcha)await session.showCaptcha(result.captcha,`submit:${session.target}`);
      resize();
    });
    if(request.target)session.select(request.target,request.draft);
    sendDraft();resize();
    // Native authentication routines fetch only challenges, never submit here.
    if(value('kcaptcha_use')==='Y')win.kcaptcha_init?.(no);
    if(hasChallenge&&!challengeReady())win.ts_cmt_load?.();
    if(hasChallenge){
      let previous='';
      const watch=setInterval(()=>{
        if(!frame.isConnected){clearInterval(watch);observer.disconnect();sizeObserver.disconnect();return;}
        const status=win.ts_cmt?.st;
        if(status===previous)return;previous=status;resize();
        const message={interactive:'사람인지 확인하는 인증 영역을 직접 완료해 주세요.',expired:'인증이 만료됐습니다. 인증 영역에서 다시 확인해 주세요.',error:'사이트 인증을 불러오지 못했습니다. 연결을 확인하거나 원문에서 인증해 주세요.',ok:'인증 완료'}[status];
        if(message)notify('auth',{message});
      },500);
    }
    return session.metadata();
  }

  const deleting = request.operation === 'delete-submit';
  const media=request.media;
  const session = frame.__dcbpvEditor;
  if ((!deleting && request.operation !== 'submit') || !request.activation?.isTrusted || !session) return fail('unavailable');
  if (!deleting && !challengeReady()) return fail('authentication');
  if (!deleting && !media && (!request.memo?.trim() || request.memo.length > maxLength)) return fail('input');
  if(media && (media!==session?.mediaDrafts.get(request.target||'') || !['dccon','txtcon'].includes(media.kind)))return fail('input');
  const target = request.target ? uniqueTargets.find(t => t.id === request.target) : null;
  if (!deleting && request.target && !target) return fail('target');
  if (deleting && !session.metadata().owned.includes(request.target)) return fail('ownership');
  const suffix = no; // One native editor stays mounted through all reply modes.
  const hasName = !!doc.getElementById(`name_${suffix}`);
  const hasPassword = !!doc.getElementById(`password_${suffix}`);
  const useGallNickname = value(request.target ? 'use_gall_nick_reply' : 'use_gall_nick') === 'Y';
  if (!deleting && ((hasName && !useGallNickname && !request.name?.trim()) || (hasPassword && request.password?.length < 2))) return fail('input');
  const requiresImage=!deleting&&(media ? !!doc.getElementById(`code_${no}`) : value('kcaptcha_use')==='Y');
  const imageCode = requiresImage ? value(`code_${no}`) : '';
  if (requiresImage && !imageCode?.trim()) return fail('image-captcha');
  // A per-document guard also survives background worker suspension/restart.
  if (frame.dataset.dcbpvWriting === '1') return fail('busy');
  frame.dataset.dcbpvWriting = '1';
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  let wrote = false;
  let checking = false;
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
    if (!deleting && target && !before.comments.some(item => String(item.no) === target.id
      && String(Number(item.depth) > 0 ? item.c_no : item.no) === target.parent
      && item.del_yn !== 'Y')) return fail('target');
    const auth = await session.authFields(`${deleting ? 'delete' : 'submit'}:${request.target || ''}`, deleting ? 'comment_delete_submit' : media ? 'insert_icon' : 'comment_submit');
    if (!auth) return fail('authentication');
    if (!frame.isConnected || frame.dataset.dcbpvCancelled === '1') return fail('cancelled');
    if (deleting) {
      const row = before.comments.find(item => String(item.no) === request.target && item.del_yn !== 'Y');
      const guest = session.owned.has(request.target) && session.owned.get(request.target) != null;
      if (!row || (!session.owned.has(request.target) && !(value('member_division') === 'Y' && row.my_cmt === 'Y' && row.del_btn === 'Y'))) return fail('ownership');
      if (guest && !request.password) return fail('input');
      const token = win.get_cookie?.('ci_c');
      if (!token) return fail('authentication');
      const body = new URLSearchParams({ci_t:token,id,no,re_no:request.target,mode:'del',_GALLTYPE_:expectedType,c_k_v:'dzc',rc_key:String(win.dc_rc_key),'g-recaptcha-response':'',...auth});
      if (guest) {
        const form = doc.getElementById('_cmt_del_form_');
        const time = doc.querySelector('input[name="v_cur_t"]')?.value;
        if (!form || !time) return fail('unavailable');
        for (const [key,val] of new win.FormData(form)) body.append(key,String(val));
        body.set('v_cur_t',time); body.set('re_password',request.password);
      }
      wrote=true;
      const response=(await ajax('/board/comment/comment_delete_submit',body.toString())).trim().split('||');
      if(response[0]==='false') return fail(response[1]==='captcha'?'authentication':'delete-rejected',{captcha:response[1]==='captcha'?(response[2]==='v3'?'v3':'v2'):null});
      if(response[0]!=='true') return fail('uncertain');
      checking=true;
      try {
        const after=await read();
        return {ok:true,deletedId:request.target,comments:after.comments,total:Number(after.total_cnt)};
      } catch (_) {return {ok:true,deletedId:request.target,refreshFailed:true};}
    }
    const body = new URLSearchParams({ id, no, reply_no: target?.id || 'undefined', memo: request.memo,
      _GALLTYPE_: expectedType, c_gall_id: id, c_gall_no: no,
      t_vch2: String($(doc).data('t_vch2')), t_vch2_chk: String($(doc).data('t_vch2_chk')),
      service_code: doc.service_code, 'g-recaptcha-response': '', rc_key: String(win.dc_rc_key), headTail: '""', ...auth });
    if(imageCode) body.set('code',imageCode);
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
    let endpoint='/board/forms/comment_submit',sendBody=body;
    if(media){
      // Official dccon.js?v=261026 / txtcon.js?v=261020 (2026-10-28).
      sendBody=new URLSearchParams({id,no,ci_t:win.get_cookie?.('ci_c')||'',_GALLTYPE_:expectedType,'g-recaptcha-response':'',...auth});
      if(!sendBody.get('ci_t'))return fail('authentication');
      for(const key of ['name','password','code','check_6','check_7','check_8','gall_nick_name','use_gall_nick','cf-turnstile-response','ts_state','ts_focus_ms','ts_token_ms','ts_test'])if(body.has(key))sendBody.set(key,body.get(key));
      if(target){sendBody.set('c_no',target.parent);sendBody.set('reply_no',target.id);}
      if(useGallNickname&&!sendBody.get('name'))sendBody.set('name',body.get('gall_nick_name')||'');
      if(media.kind==='dccon'){
        endpoint='/dccon/insert_icon';
        for(const [key,val] of Object.entries({package_idx:media.packages.join(','),detail_idx:media.details.join(','),double_con_chk:media.double?'1':'',input_type:'comment',t_vch2:String($(doc).data('t_vch2')),t_vch2_chk:String($(doc).data('t_vch2_chk')),c_gall_id:id,c_gall_no:no}))sendBody.set(key,val);
        if(media.big)sendBody.set('bigdccon','1');
      }else{endpoint='/txtcon/insert';for(const [key,val] of Object.entries({txtcon_text:media.text,txtcon_bg:media.bg,txtcon_color:media.color}))sendBody.set(key,val);}
    }
    wrote = true;
    const response = (await ajax(endpoint, sendBody.toString())).trim();
    if(media&&response==='code_fail'){win.kcaptcha_init?.(no);return fail('image-captcha');}
    if(media&&['not_buy','expired','unuseable','not_exists','fail','form_error','fail1'].includes(response))return fail('rejected');
    if (response.split('||')[0].trim() === 'false') {
      const parts=response.split('||');
      if(parts[1]==='captcha') return fail('authentication',{captcha:parts[2]==='v3'?'v3':'v2'});
      if(value('kcaptcha_use')==='Y' && /코드|자동입력|captcha|인증/i.test(parts[1]||'')) {win.kcaptcha_init?.(no);return fail('image-captcha');}
      return fail('rejected');
    }
    // HTTP 200 / non-false text alone is not evidence of registration.
    checking = true;
    const after = await read();
    const previous = new Set(before.comments.map(item => String(item.no)));
    const plain = raw => {
      const parsed = new DOMParser().parseFromString(String(raw).replace(/<br\s*\/?\s*>/gi, '\n'), 'text/html');
      parsed.querySelectorAll('a[class*="mention"][class*="deco"]').forEach(node => node.remove());
      return parsed.body.textContent.replace(/\r\n/g, '\n').trim();
    };
    const added = after.comments.filter(item => /^[1-9]\d*$/.test(String(item.no)) && !previous.has(String(item.no))
      && (media ? response==='ok' && (()=>{const parsed=new DOMParser().parseFromString(String(item.memo),'text/html');
        if(media.kind==='dccon')return JSON.stringify([...parsed.querySelectorAll('.written_dccon[detail]')].map(node=>node.getAttribute('detail')))===JSON.stringify(media.details);
        const text=parsed.querySelector('.coment_dccon_txt .txtcon_txt,.comment_dccon_txt .txtcon_txt');return !!text&&plain(text.innerHTML)===media.text.replace(/\r\n/g,'\n').trim();})() : plain(item.memo) === request.memo.replace(/\r\n/g, '\n').trim())
      && (target ? String(item.c_no) === target.parent : String(item.depth) === '0'));
    if (added.length !== 1 || Number(after.total_cnt) <= Number(before.total_cnt)) return fail('uncertain');
    return { ok: true, comments: after.comments, total: Number(after.total_cnt), addedId: String(added[0].no) };
  } catch (error) {
    return fail(wrote ? 'uncertain' : 'network', { status: Number(error?.status || 0), refreshFailed:checking });
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
    || !['prepare','select','delete'].includes(message.operation)) return { ok: false, code: 'unavailable' };
  if ((message.draft != null && (typeof message.draft !== 'string' || message.draft.length > 10000))
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

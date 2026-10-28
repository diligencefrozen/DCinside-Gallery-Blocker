// Official recommend_box.js?v=261026 and kcaptcha.js, checked 2026-10-28.
// MAIN installs trusted-click handlers only. No message can send a recommendation;
// hidden fields, cookies and answers remain in this same-origin page context.
function preparePreviewVote(request) {
  const overlay=document.getElementById('dcb-preview-overlay');
  const row=overlay?.querySelector('.dcbpv-vote');
  if(!row||row.dataset.recommendKey!==request.key||overlay.dataset.dcbpvUrl!==request.url)return {ok:false};
  if(row.__dcbRecommend)return {ok:true};
  const url=new URL(request.url),id=url.searchParams.get('id'),no=url.searchParams.get('no');
  const type=url.pathname.startsWith('/mgallery/')?'M':url.pathname.startsWith('/mini/')?'MI':url.pathname.startsWith('/person/')?'PR':'G';
  const article=`${type}:${id}:${no}`,registry=window.__dcbpvRecommendRegistry ||= new Map();
  if(!registry.has(article))registry.set(article,{busy:false,locked:new Set(),counts:{}});
  const state=registry.get(article);
  const buttons=[...row.querySelectorAll('[data-act="vote-up"],[data-act="vote-down"]')];
  const status=row.querySelector('[role="status"]');
  let auth=null,controller=null,sent=false,disposed=false;
  const active=()=>!disposed&&row.isConnected&&row.dataset.recommendKey===request.key&&overlay.dataset.dcbpvUrl===request.url;
  const update=()=>{
    if(!active())return;
    buttons.forEach(button=>{button.disabled=state.busy||state.locked.has(button.dataset.act==='vote-up'?'U':'D');button.setAttribute('aria-busy',String(state.busy));});
    auth?.querySelectorAll('button,input').forEach(node=>{node.disabled=state.busy;});
  };
  const message=(text,details={})=>{
    if(!active())return;
    if(details.settled){update();return;}
    status.textContent=text;
    if(details.fallback){const link=document.createElement('a');link.href=url.href;link.target='_blank';link.rel='noopener noreferrer';link.textContent=' 원문에서 개추·비추';status.append(link);}
    update();
    window.postMessage({type:'dcb.previewVote.event',key:request.key,kind:'result',...details,counts:{...state.counts}},location.origin);
  };
  state.notify=message;
  const report=(text,details)=>{state.notice={text,details};state.notify?.(text,details);};
  const dispose=()=>{disposed=true;controller?.abort();auth?.remove();auth=null;row.removeEventListener('click',click,true);observer.disconnect();if(state.notify===message)state.notify=null;};
  row.__dcbRecommend={dispose};
  const observer=new MutationObserver(()=>{if(!active())dispose();});
  observer.observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['data-recommend-key','data-dcbpv-url']});
  const clearAuth=()=>{auth?.remove();auth=null;};
  const error=(code,status=0)=>Object.assign(new Error(code),{code,status});
  const cookie=()=>document.cookie.split(';').map(x=>x.trim()).find(x=>x.startsWith('ci_c='))?.slice(5)||'';
  const sameArticle=doc=>{try{const value=new URL(doc.URL);return value.origin===url.origin&&value.pathname===url.pathname&&value.searchParams.get('id')===id&&value.searchParams.get('no')===no;}catch(_){return false;}};
  async function context(signal){
    let doc=null,win=null;
    for(const frame of overlay.querySelectorAll('iframe[data-dcbpv-compose-frame]')){
      try{if(sameArticle(frame.contentDocument)&&frame.contentDocument.getElementById('_view_form_')){doc=frame.contentDocument;win=frame.contentWindow;break;}}catch(_){}
    }
    if(!doc){
      const response=await fetch(url.href,{credentials:'include',cache:'no-store',redirect:'error',signal});
      if(!response.ok)throw error('http',response.status);
      const html=await response.text();if(html.length>8*1024*1024)throw error('unavailable');
      doc=new DOMParser().parseFromString(html,'text/html');
    }
    const form=doc.getElementById('_view_form_');
    if(!form||doc.getElementById('id')?.value!==id||doc.getElementById('no')?.value!==no||doc.getElementById('_GALLTYPE_')?.value!==type||!doc.getElementById('e_s_n_o')?.value)throw error('unavailable');
    // Read the literal server declaration; never execute fetched page scripts.
    const declaration=[...doc.scripts].filter(s=>!s.src).map(s=>s.textContent.match(/\b(?:var\s+)?mem_allow\s*=\s*([01])\s*;/)?.[1]).find(v=>v!==undefined);
    const member=win?.mem_allow??(declaration===undefined?undefined:Number(declaration));
    if(member===0)throw error('member');
    if(member!==1)throw error('unavailable');
    const fields=new URLSearchParams();
    // Equivalent to native _view_form_.serialize(): preserves duplicate hidden
    // names and current server-generated security fields, without copying DOM.
    for(const input of form.elements){
      if(!input.name||input.disabled||/^(?:button|submit|reset|file)$/i.test(input.type)||(/^(?:checkbox|radio)$/i.test(input.type)&&!input.checked))continue;
      if(input.tagName==='SELECT'&&input.multiple){for(const option of input.selectedOptions)fields.append(input.name,option.value);}
      else fields.append(input.name,String(input.value).replace(/\r?\n/g,'\r\n'));
    }
    if(fields.toString().length>65536)throw error('unavailable');
    return {doc,fields};
  }
  function challenge(ctx,mode,invalid=false){
    clearAuth();
    const native=ctx.doc.getElementById(`kcaptcha_recommend_${no}`);
    // Use the native challenge's declared type/target, not the comment CAPTCHA.
    if(!native?.matches('.kcaptcha')||!/^\w{1,32}$/.test(native.dataset.type||'')||native.dataset.type==='comment'
      ||(native.dataset.gall_id&&native.dataset.gall_id!==id)||(native.dataset.gall_type&&native.dataset.gall_type!==type))throw error('authentication');
    const group=document.createElement('div');group.className='dcbpv-recommend-auth';group.setAttribute('aria-label',mode==='U'?'추천 인증':'비추천 인증');
    const image=document.createElement('img');image.alt='추천 방지코드';image.width=130;image.height=40;
    const refresh=document.createElement('button');refresh.type='button';refresh.textContent='새로고침';
    const input=document.createElement('input');input.type='text';input.autocomplete='off';input.maxLength=20;input.placeholder='보안코드';input.setAttribute('aria-label','추천 방지코드 입력');
    const confirm=document.createElement('button');confirm.type='button';confirm.textContent=mode==='U'?'추천':'비추천';
    const cancel=document.createElement('button');cancel.type='button';cancel.textContent='취소';
    let loaded=false,issuedAt=0;
    const reload=()=>{
      loaded=false;issuedAt=0;input.value='';
      const src=new URL('/kcaptcha/image_v3/',url.origin);
      src.search=new URLSearchParams({gall_id:id,kcaptcha_type:native.dataset.type,time:String(Date.now()),_GALLTYPE_:type});image.src=src.href;
    };
    image.onload=()=>{loaded=true;issuedAt=Date.now();};
    image.onerror=()=>message('인증 이미지를 불러오지 못했습니다.',{fallback:true});
    refresh.onclick=event=>{if(event.isTrusted&&!state.busy)reload();};
    cancel.onclick=event=>{if(event.isTrusted&&!state.busy){clearAuth();message('');}};
    confirm.onclick=event=>{
      if(!event.isTrusted||state.busy||!active()||auth!==group)return;
      if(!loaded||!input.value.trim()){message('코드 이미지를 확인하고 코드를 입력해 주세요.');return;}
      if(Date.now()-issuedAt>120000){reload();message('코드를 새로 확인해 주세요.');return;}
      void run(mode,{group,ctx,answer:input.value.trim()});
    };
    group.append(image,refresh,input,confirm,cancel);row.after(group);auth=group;reload();
    message(invalid?'코드가 맞지 않습니다. 다시 입력해 주세요.':mode==='U'?'추천하려면 코드를 입력해 주세요.':'비추천하려면 코드를 입력해 주세요.');
  }
  async function run(mode,proof=null){
    if(!active()||state.busy||state.locked.has(mode)||overlay.querySelector('.dcbpv-article[data-dcbpv-filtered="1"]'))return;
    state.busy=true;state.notice=null;sent=false;controller=new AbortController();const signal=controller.signal;
    const timer=setTimeout(()=>controller.abort(),20000);
    if(!proof)clearAuth();
    message(mode==='U'?'추천 처리 중…':'비추천 처리 중…');
    try{
      const ctx=proof?.ctx||await context(signal);
      if(!active()||signal.aborted)return;
      if(!ctx.doc.querySelector(`.${mode==='U'?'btn_recom_up':'btn_recom_down'}[data-no="${no}"]:not([disabled]):not(.not)`))throw error('unavailable');
      const policy=ctx.doc.getElementById(`recommend_code_use_yn_${no}`);
      const use=policy?.getAttribute('data-use-type');
      if(policy?.value==='Y'&&!['all','recommend','non_recommend'].includes(use))throw error('authentication');
      const required=policy?.value==='Y'&&(use==='all'||use===(mode==='U'?'recommend':'non_recommend'));
      if(required&&!proof){challenge(ctx,mode);return;}
      if(proof&&auth!==proof.group)return;
      const token=cookie();if(!token)throw error('authentication');
      const body=new URLSearchParams(ctx.fields);
      for(const [name,value] of Object.entries({ci_t:token,id,no,mode,code_recommend:proof?.answer||'',_GALLTYPE_:type,link_id:id}))body.append(name,value);
      // Same 3-hour first-check cookie as set_cookie_tmp in the official handler.
      const firstCheck=`${id}${no}_Firstcheck${mode==='D'?'_down':''}`;
      document.cookie=`${firstCheck}=Y; path=/; domain=dcinside.com; expires=${new Date(Date.now()+3*3600000).toUTCString()};`;
      sent=true;
      const response=await fetch('/board/recommend/vote',{method:'POST',credentials:'include',referrer:url.href,redirect:'error',signal,headers:{'Content-Type':'application/x-www-form-urlencoded; charset=UTF-8','X-Requested-With':'XMLHttpRequest'},body:body.toString()});
      if(!response.ok)throw error('http',response.status);
      const parts=(await response.text()).trim().split('||');
      if(parts[0]==='true'&&/^\d+$/.test(parts[1]||'')&&(mode==='D'||/^\d+$/.test(parts[2]||''))){
        Object.assign(state.counts,mode==='U'?{up:parts[1],upMember:parts[2]}:{down:parts[1]});state.locked.add(mode);clearAuth();
        report(mode==='U'?'추천 완료':'비추천 완료',{ok:true});
      }else if(parts[0]==='false'){
        const reason=String(parts[1]||'추천하지 못했습니다.').slice(0,180);
        if(/코드|자동입력/.test(reason)&&active()){challenge(ctx,mode,!!proof);}
        else {state.locked.add(mode);clearAuth();report(reason==='nomember'?'비회원 추천이 제한된 게시글입니다.':reason,{fallback:true});}
      }else{
        // Unknown response cannot prove this user's action. A GET may refresh
        // counts, but never turns an ambiguous response into a success/retry.
        state.locked.add(mode);clearAuth();
        try{
          const read=await fetch(url.href,{credentials:'include',cache:'no-store',redirect:'error',signal});
          if(read.ok){const doc=new DOMParser().parseFromString(await read.text(),'text/html');
            for(const [key,selector] of [['up',`#recommend_view_up_${no}`],['upMember',`#recommend_view_up_fix_${no}`],['down',`#recommend_view_down_${no}`]]){
              const count=doc.querySelector(selector)?.textContent.trim().replace(/,/g,'');if(/^\d+$/.test(count||''))state.counts[key]=count;
            }
          }
        }catch(_){}
        report('처리 여부를 확인하지 못했습니다. 원문에서 확인해 주세요.',{uncertain:true,fallback:true});
      }
    }catch(failure){
      if(sent){state.locked.add(mode);clearAuth();}
      const text=failure.code==='member'?'멤버만 추천할 수 있습니다.':failure.code==='authentication'?'인증을 원문에서 확인해 주세요.':failure.status?`추천하지 못했습니다 (HTTP ${failure.status}).`:'처리 여부를 확인하지 못했습니다. 원문에서 확인해 주세요.';
      if(sent||active())report(text,{uncertain:sent,fallback:true});
    }finally{clearTimeout(timer);state.busy=false;controller=null;update();state.notify?.('',{settled:true});}
  }
  function click(event){
    const button=event.target.closest('[data-act="vote-up"],[data-act="vote-down"]');
    if(!button||!row.contains(button)||!event.isTrusted)return;
    event.preventDefault();void run(button.dataset.act==='vote-up'?'U':'D');
  }
  row.addEventListener('click',click,true);
  update();
  if(state.busy)message('개추·비추 처리 중…');
  else if(state.notice)message(state.notice.text,state.notice.details);
  // Non-secret state survives background restarts and preview close/reopen.
  return {ok:true,counts:{...state.counts},busy:state.busy};
}

chrome.runtime.onMessage.addListener((message,sender,respond)=>{
  if(message?.type!=='dcb.previewVote')return;
  let url,source;try{url=new URL(message.url);source=new URL(sender.url);}catch(_){respond({ok:false});return;}
  if(message.operation!=='prepare'||sender.id!==chrome.runtime.id||sender.frameId!==0||!Number.isInteger(sender.tab?.id)
    ||source.origin!=='https://gall.dcinside.com'||url.origin!==source.origin||url.username||url.password
    ||!/^\/(?:mgallery\/|mini\/|person\/)?board\/view\/$/.test(url.pathname)||!/^\w+$/.test(url.searchParams.get('id')||'')
    ||!/^[1-9]\d*$/.test(url.searchParams.get('no')||'')||!/^[a-f0-9-]{36}$/.test(message.key||'')){respond({ok:false});return;}
  chrome.scripting.executeScript({target:{tabId:sender.tab.id,frameIds:[0]},world:'MAIN',func:preparePreviewVote,args:[{url:url.href,key:message.key}]})
    .then(results=>respond(results[0]?.result||{ok:false}),()=>respond({ok:false}));return true;
});

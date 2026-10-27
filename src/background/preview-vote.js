// Contract: official recommend_box.js?v=261026, inspected 2026-10-27.
// This bridge prepares native UI only. It cannot issue a vote from a message.
async function preparePreviewVote(request) {
  const fail = () => ({ok:false,error:'원문 투표 버튼을 확인할 수 없습니다. 원문에서 확인해 주세요.'});
  const frames=[...document.querySelectorAll('iframe[data-dcbpv-vote-frame]')].filter(f=>f.dataset.dcbpvVoteFrame===request.key);
  if(frames.length!==1)return fail();
  const frame=frames[0];let doc,win,url;
  try {
    win=frame.contentWindow;doc=win.document;url=new URL(doc.URL);
    const expected=new URL(request.url);
    if(url.origin!=='https://gall.dcinside.com'||url.pathname!==expected.pathname||url.searchParams.get('id')!==expected.searchParams.get('id')||url.searchParams.get('no')!==expected.searchParams.get('no'))return fail();
  } catch(_){return fail();}
  if(frame.__dcbpvVote)return {ok:true};
  const id=url.searchParams.get('id'),no=url.searchParams.get('no');
  const type=url.pathname.startsWith('/mgallery/')?'M':url.pathname.startsWith('/mini/')?'MI':url.pathname.startsWith('/person/')?'PR':'G';
  const box=doc.querySelector('.btn_recommend_box');
  const buttons=[...doc.querySelectorAll('.btn_recom_up,.btn_recom_down')].filter(b=>b.getAttribute('data-no')===no&&box?.contains(b));
  if(!box||!buttons.length||!win.jQuery?.ajaxPrefilter||!doc.getElementById('_view_form_')||win._GALLERY_TYPE_!==type||doc.getElementById('id')?.value!==id)return fail();
  const registry=window.__dcbpvVoteRegistry ||= new Map();
  const article=`${type}:${id}:${no}`;
  let state=registry.get(article);
  if(!state){state={busy:false,locked:new Set()};registry.set(article,state);}
  while(registry.size>64){const key=[...registry.keys()].find(key=>key!==article&&!registry.get(key).busy);if(!key)break;registry.delete(key);}
  frame.__dcbpvVote=state;
  const notify=(kind,detail={})=>window.postMessage({type:'dcb.previewVote.event',key:request.key,kind,...detail},location.origin);
  const modeOf=button=>button.classList.contains('btn_recom_down')?'D':'U';
  const update=()=>buttons.forEach(button=>{button.disabled=state.busy||state.locked.has(modeOf(button))||win.mem_allow===0;button.setAttribute('aria-busy',String(state.busy));});
  const surface=doc.createElement('div');surface.id='dcbpv-vote-surface';doc.body.append(surface);surface.append(box);
  const status=doc.createElement('p');status.setAttribute('role','status');surface.append(status);
  status.textContent=win.mem_allow===0?'멤버만 투표할 수 있습니다.':'아래 원문 버튼을 직접 눌러 투표하세요. 인증이 필요하면 먼저 입력해 주세요.';
  const style=doc.createElement('style');style.textContent=`
    html,body{margin:0!important;padding:0!important;min-width:0!important;width:100%!important;min-height:0!important;height:auto!important;background:transparent!important;overflow:hidden!important}
    body>:not(#dcbpv-vote-surface){display:none!important}
    #dcbpv-vote-surface{padding:8px;box-sizing:border-box;font:13px/1.5 sans-serif;color:#253047}
    #dcbpv-vote-surface .btn_recommend_box{box-sizing:border-box;width:100%!important;min-width:0!important;height:auto!important;margin:0!important;padding:8px!important}
    #dcbpv-vote-surface .recom_bottom_box,#dcbpv-vote-surface .btn_nhitgall,#dcbpv-vote-surface .btn_silbechu,#dcbpv-vote-surface .btn_snsmore,#dcbpv-vote-surface .btn_report{display:none!important}
    #dcbpv-vote-surface input{max-width:100%;box-sizing:border-box}
    #dcbpv-vote-surface button:disabled{opacity:.5;cursor:default}
    @media(prefers-color-scheme:dark){#dcbpv-vote-surface{color:#e2e8f0}}
  `;doc.head.append(style);
  const resize=()=>{if(frame.isConnected)notify('size',{height:Math.max(140,Math.min(800,Math.ceil(surface.getBoundingClientRect().height)+8))});};
  const observer=new ResizeObserver(resize);observer.observe(surface);
  let permit=null;
  for(const button of buttons){
    button.type='button';button.setAttribute('aria-label',modeOf(button)==='U'?'개추 투표':'비추 투표');
    button.addEventListener('click',event=>{
      const mode=modeOf(button);
      if(!event.isTrusted||state.busy||state.locked.has(mode)||!frame.isConnected){event.preventDefault();event.stopImmediatePropagation();return;}
      permit={mode};
      // The current native handler issues its AJAX synchronously in this click.
      // A synthetic or delayed callback cannot reuse this permission.
      queueMicrotask(()=>{permit=null;});
    },true);
  }
  win.jQuery.ajaxPrefilter((options,_original,xhr)=>{
    let endpoint;try{endpoint=new URL(options.url,doc.URL);}catch(_){return;}
    if(endpoint.origin!==url.origin||endpoint.pathname!=='/board/recommend/vote')return;
    const fields=new URLSearchParams(options.data);
    if(!permit||state.busy||!frame.isConnected||String(options.type).toUpperCase()!=='POST'||fields.get('id')!==id||fields.get('no')!==no||fields.get('mode')!==permit.mode||fields.get('_GALLTYPE_')!==type){xhr.abort();return;}
    const mode=permit.mode;permit=null;state.busy=true;update();notify('busy');status.textContent='투표 결과를 확인하고 있습니다…';
    const success=options.success,error=options.error;
    let settled=false;
    const finish=(message,detail={},lock=true)=>{
      if(settled)return;settled=true;clearTimeout(timer);state.busy=false;if(lock)state.locked.add(mode);update();status.textContent=message;
      notify('result',{message,...detail});resize();
    };
    const timer=setTimeout(()=>finish('응답을 확인하지 못했습니다. 원문에서 결과를 확인해 주세요.',{uncertain:true}),20000);
    options.success=function(data,...args){
      const fields=String(data).trim().split('||');
      if(fields[0]==='true'&&/^\d+$/.test(fields[1]||'')&&(mode==='D'||/^\d+$/.test(fields[2]||''))){
        try{if(typeof success==='function')success.call(this,data,...args);}finally{
          finish('투표가 반영됐습니다.',{ok:true,counts:mode==='U'?{up:fields[1],upMember:fields[2]}:{down:fields[1]}});
        }
      }else if(fields[0]==='false'){
        const message=fields[1]==='nomember'?'비회원 투표가 제한된 게시글입니다.':String(fields[1]||'투표가 거절됐습니다.').slice(0,200);
        // Let the original handler refresh its image challenge and show the
        // site's restriction. It contains no vote retry in this contract.
        try{if(typeof success==='function')success.call(this,data,...args);}finally{
          finish(message,{rejected:true},!/코드|인증|captcha/i.test(message));
        }
      }else finish('응답을 확인하지 못했습니다. 원문에서 결과를 확인해 주세요.',{uncertain:true});
    };
    options.error=function(...args){
      const http=Number(args[0]?.status||0);
      finish(http?`서버가 투표를 처리하지 못했습니다 (HTTP ${http}). 원문에서 확인해 주세요.`:'연결이 끊겨 투표 결과를 확인하지 못했습니다. 원문에서 확인해 주세요.',{uncertain:true});
      // Native error uses an alert only; keep the inline error instead.
    };
  });
  update();resize();return {ok:true};
}

chrome.runtime.onMessage.addListener((message,sender,respond)=>{
  if(message?.type!=='dcb.previewVote')return;
  let url,source;
  try{url=new URL(message.url);source=new URL(sender.url);}catch(_){respond({ok:false});return;}
  if(message.operation!=='prepare'||sender.id!==chrome.runtime.id||sender.frameId!==0||!Number.isInteger(sender.tab?.id)
    ||source.origin!=='https://gall.dcinside.com'||url.origin!==source.origin||url.username||url.password
    ||!/^\/(?:mgallery\/|mini\/|person\/)?board\/view\/$/.test(url.pathname)
    ||!/^\w+$/.test(url.searchParams.get('id')||'')||!/^[1-9]\d*$/.test(url.searchParams.get('no')||'')||!/^[a-f0-9-]{36}$/.test(message.key||'')){
    respond({ok:false});return;
  }
  chrome.scripting.executeScript({target:{tabId:sender.tab.id,frameIds:[0]},world:'MAIN',func:preparePreviewVote,args:[{url:url.href,key:message.key}]})
    .then(results=>respond(results[0]?.result||{ok:false}),()=>respond({ok:false}));
  return true;
});

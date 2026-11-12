module.exports = function nativeDocument(url, member = true, captcha = false, own = false, turnstile = false) {
  const type = url.includes('/mgallery/') ? 'M' : url.includes('/mini/') ? 'MI' : url.includes('/person/') ? 'PR' : 'G';
  const no = new URL(url).searchParams.get('no');
  return `<!doctype html><html><head><meta charset="utf-8"></head><body>
    ${Object.entries({ _GALLTYPE_: type, member_division: member ? 'Y' : 'N', e_s_n_o: 'fixture-read-token',
      cur_t:'fixture-time', check_6:'0', check_7:'0', check_8:'0', check_9:'0', check_10:'0', recommend:'0', c_r_k_x_z:'fixture', kcaptcha_use:captcha?'Y':'N' })
      .map(([id,value])=>`<input id="${id}" value="${value}">`).join('')}
    <li id="comment_li_101"><div class="cmt_info" data-no="101"><div class="btn_reply_write_all">parent</div>${own?'<div class="cmt_mdf_del" data-my="Y" re_no="101"><button class="btn_cmt_delete">삭제</button></div>':''}</div>
      <ul class="reply_list" id="reply_list_101" p-no="101"><li id="reply_li_102"><div class="reply_info" data-no="102"><div class="btn_re_reply_write_all">reply</div></div></li></ul></li>
    <div class="cmt_write_box"><div class="fl">${member ? '' : `<input id="name_${no}" placeholder="닉네임"><input id="password_${no}" type="password">`}</div>
    <div class="cmt_txt_cont"><div class="cmt_write"><textarea id="memo_${no}" maxlength="400"></textarea></div>${captcha?`<div><img class="kcaptcha" data-type="comment" id="kcaptcha_${no}" alt="인증 이미지"><input id="code_${no}" placeholder="자동입력 방지코드"><button type="button" class="btn_kcap_refresh" onclick="kcaptcha_init('${no}')">새 문제</button></div>`:''}<button class="repley_add btn_svc" data-no="${no}">등록</button></div></div>
    <form id="_cmt_del_form_"><input name="fixture_delete_proof" value="fixture-proof"></form><input name="v_cur_t" value="fixture-time">
    <script>
      const ajaxHandlers=new Map();
      const nativePanelData={};
      window.jQuery = arg => typeof arg==='function'?queueMicrotask(arg):({data:(key,value)=>{
        if(arg===document)return {comment_id:${JSON.stringify(new URL(url).searchParams.get('id'))},comment_no:'${no}'}[key];
        if(value!==undefined)nativePanelData[key]=value;
        return nativePanelData[key];
      },on:(name,fn)=>ajaxHandlers.set(name,fn),off:namespace=>{for(const name of ajaxHandlers.keys())if(name.endsWith(namespace))ajaxHandlers.delete(name);}});
      const ajaxEvent=(type,xhr,data)=>ajaxHandlers.get(type+'.dcbpvPicker')?.({},xhr,{url:'/dccon/lists',data});
      window.page=0;
      const preload={status:503};
      window.fixturePreload=event=>ajaxEvent(event,preload,'target=icon&page=1');
      window.dc_rc_key='fixture-rc';
      window.dc_rc_new_v2='fixture-v2';window.dc_rc_new_v3='fixture-v3';
      window.get_cookie=key=>key==='ci_c'?'fixture-csrf':'';
      window.kcaptchaRefreshes=0;
      window.kcaptcha_init=()=>{window.kcaptchaRefreshes++;const image=document.querySelector('.kcaptcha');if(image)image.src='/kcaptcha/image_v3/?gall_id=fixture&kcaptcha_type=comment&time='+window.kcaptchaRefreshes;};
      window.nativeSubmits=0;
      document.addEventListener('click',event=>{if(event.target.matches('.repley_add'))window.nativeSubmits++});
      function secure(button){button.addEventListener('click',event=>{if(window.nativeReject)event.preventDefault();if(event.isTrusted)document.service_code='fixture-live-code';});}
      secure(document.querySelector('.repley_add'));
      const tools=document.createElement('div');tools.className='dccon_guidebox';tools.innerHTML='<button type="button" class="tx_dccon">디시콘</button><button type="button" class="tx_txtcon">글자콘</button><div id="div_con" style="display:none"><button class="img_dccon" package_idx="12" detail_idx="34"><img src="//dcimg5.dcinside.com/dccon.php?no=fixture" alt="fixture icon"></button></div><div id="div_txtcon" class="pop_wrap type3" style="display:none;width:400px"><div class="pop_content txtconlayer"><div class="txt_dccon_box"><div class="head">글자디시콘</div><div class="txtcon_box"><div class="coment_dccon_txt" style="background:#fff;color:#111;display:grid;place-items:center"><p class="txtcon_txt">미리보기</p></div></div><div class="color_section_box"><div class="color_section"><h5>배경색</h5><div class="color_options"><button type="button" class="btn_color" style="background:#fff" aria-label="흰색"></button><button type="button" class="btn_color" style="background:#3b4890" aria-label="파랑"></button><button type="button" class="btn_color" style="background:#f5e1f0" aria-label="분홍"></button></div></div><div class="color_section"><h5>글자색</h5><div class="color_options"><button type="button" class="btn_color" style="background:#111" aria-label="검정"></button></div></div></div><div class="txt_section_box"><div class="txtareabox"><textarea id="txtcon_input" placeholder="글자콘 내용 입력"></textarea></div></div><div class="latest_section_box"><ul class="latest"></ul></div><button id="btn_txtcon_submit">등록</button></div></div></div>';
      document.querySelector('.cmt_txt_cont').append(tools);document.querySelector('#txtcon_input').addEventListener('input',event=>document.querySelector('#div_txtcon .txtcon_txt').textContent=event.target.value);
      for(const panel of tools.querySelectorAll('#div_con,#div_txtcon'))document.body.append(panel);
      let listLoaded=false;
      document.querySelector('.tx_dccon').onclick=event=>{
        nativePanelData.target=event.currentTarget;nativePanelData.tar='icon';
        window.dccon_input_layer();
      };
      window.dccon_input_layer=async()=>{
        const trigger=nativePanelData.target,panel=document.querySelector('#div_con');
        const show=()=>{if(window.fixtureParkedDccon)document.body.append(panel);else trigger.after(panel);panel.style.display='';window.fixtureListReady=true;};
        if(listLoaded){show();return;}
        const controller=new AbortController(),xhr={status:0,responseText:'',abort:()=>controller.abort()};ajaxEvent('ajaxSend',xhr);
        try{const response=await fetch('/dccon/lists',{method:'POST',signal:controller.signal});xhr.status=response.status;xhr.responseText=await response.text();if(response.ok&&xhr.responseText==='ok'){listLoaded=true;show();}}catch(_){}
        ajaxEvent('ajaxComplete',xhr);
      };document.querySelector('.tx_txtcon').onclick=event=>{const panel=document.querySelector('#div_txtcon');event.target.after(panel);panel.style.display='block';};
      const swatches=document.querySelectorAll('#div_txtcon .color_section .btn_color:first-of-type');
      swatches.forEach((btn,i)=>{btn.dataset.color=i?'000000':'ffffff';btn.setAttribute('aria-pressed','true');});
      window.nativeMediaSubmits=0;
      document.addEventListener('click',event=>{if(event.target.closest('.img_dccon,#btn_txtcon_submit'))window.nativeMediaSubmits++;});
      if(${turnstile}){
        window._TS_CMT_={mode:2};window.ts_cmt={st:'pending',id:1,box:null};let token='';
        window.ts_pass_left=()=>0;window.turnstile={getResponse:()=>token};
        window.ts_cmt_fields=()=>{const out='&cf-turnstile-response='+token+'&ts_state=ok';token='';window.ts_cmt.st='expired';return out;};
        window.ts_cmt_load=()=>{if(window.ts_cmt.box)return;const box=document.createElement('div');const control=document.createElement('button');control.textContent='사람인지 확인';control.id='fixture-turnstile';control.onclick=()=>{token='fixture-turnstile-token';window.ts_cmt.st='ok';};box.append(control);window.ts_cmt.box=box;const editor=document.querySelector('.cmt_write_box');editor.querySelector(".repley_add").parentElement.prepend(box);window.ts_cmt.st='interactive';};
      }
      window.addReplyForm=(parent,count,type,target)=>{
        const li=document.createElement('li');
        li.innerHTML='<div class="cmt_write_box"><div class="cmt_txt_cont"><textarea id="memo_'+parent+'" maxlength="400"></textarea><button class="repley_add btn_svc" r_idx="'+parent+'" reply_no="'+target+'">등록</button></div></div>';
        document.getElementById('reply_list_'+parent).append(li);secure(li.querySelector('button'));
      };
    </script></body></html>`;
};

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const { chromium, firefox } = require("playwright");
require("../src/ui/options/official-memos.js");

test("paste retains punctuation, scope and explicit prefix semantics", () => {
  const text = "192.0-메모, !\r\n9user-메모\nsample-user\t메모-입니다\n테스트닉\nuid:test1\n999.300\nㅇㅇ";
  const result = DCBOfficialMemos.parseRecords(text, "global", "auto");
  assert.equal(result.entries.get("ip:192.0").memo, "메모, !");
  assert.equal(result.entries.get("uid:9user").memo, "메모");
  assert.equal(result.entries.get("uid:sample-user").memo, "메모-입니다");
  assert.deepEqual(result.blocks, ["nick-exact:테스트닉", "test1"]);
  assert.deepEqual(result.badLines, [6,7]);
  assert.deepEqual(DCBOfficialMemos.parseRecords(text,"fixture","auto").blocks, []);
});

test("alarm queue survives a fresh worker, deduplicates 100 UIDs, respects global backoff", async () => {
  const memory = {}, source = fs.readFileSync("src/background/activity-queue.js","utf8");
  let alarm, msg, wake, result = {available:false,reason:"BUDGET",retryAt:Date.now()+600000}, requests = 0;
  const event = cb => ({addListener(fn){cb(fn)}});
  function restart() {
    const chrome = {
      runtime:{onMessage:event(f=>msg=f)}, tabs:{query:async()=>[{id:3}],sendMessage:async()=>{requests++;return result}},
      alarms:{onAlarm:event(f=>wake=f),get:async()=>alarm,create:async(_,a)=>alarm={scheduledTime:a.when},clear:async()=>{alarm=null}},
      storage:{sync:{get:async()=>({dcbShowWriterActivity:true})},local:{get:async()=>structuredClone(memory),set:async p=>Object.assign(memory,structuredClone(p))}}
    };
    vm.runInNewContext(source,{chrome,Date,Math});
  }
  restart();
  const uids=Array.from({length:100},(_,i)=>"user"+i);
  await new Promise(resolve=>msg({type:"dcb.activityCandidates",uids:[...uids,...uids]}, {url:"https://gall.dcinside.com/",tab:{id:3}}, resolve));
  assert.equal(memory.dcbActivityPendingV1.length,100);
  restart(); alarm=null; wake({name:"dcb-activity-recheck"});
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(requests,1);
  assert.ok(memory.dcbActivityPendingV1.every(e=>e.next>=result.retryAt));
  assert.ok(alarm.scheduledTime>=result.retryAt);
  memory.dcbActivityPendingV1[0].next = 0;
  result = {available:true,checkedAt:Date.now()};
  restart(); alarm=null; wake({name:"dcb-activity-recheck"});
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(requests,2);
  assert.equal(memory.dcbActivityPendingV1[0].next,result.checkedAt+6*3600000);
});

for (const [engine,type] of Object.entries({chromium,firefox})) test(engine+" article exception, guest rule selection and OFF comment controls", async t => {
  const browser=await type.launch({executablePath:type.executablePath()});
  t.after(()=>browser.close());
  const page=await browser.newPage({viewport:{width:680,height:600}});
  page.setDefaultTimeout(5000);
  const errors=[];
  page.on("pageerror",e=>errors.push(e.message));
  await page.route("https://gall.dcinside.com/**",r=>r.fulfill({contentType:"text/html; charset=utf-8",body:
    '<h3 class="title_subject">연습문구</h3><div class="write_div">본문</div><ul class="cmt_list"><li class="ub-content" id="comment_li_1"><div class="cmt_info"><div class="cmt_nickbox"><span class="gall_writer ub-writer" data-nick="테스트닉" data-ip="192.0"><span class="nickname"><em>테스트닉</em></span></span></div><p class="usertxt">댓글</p></div></li></ul>'}));
  await page.goto("https://gall.dcinside.com/board/view/?id=fixture&no=1");
  await page.evaluate(()=>{
    window.tokens=[];window.listeners=[];
    window.chrome={runtime:{onMessage:{addListener(){}},sendMessage(m,cb){
      if(m.type==="dcb.userBlockAdd" || m.type==="dcb.instantCtxBlock")tokens.push(m.token);
      else if(m.type==="dcb.userBlockRemoveMany")tokens=tokens.filter(x=>!m.tokens.includes(x));
      cb({ok:true});for(const listener of listeners)listener({blockedUids:{newValue:tokens}},"local");
    }},storage:{local:{get:async()=>({blockedUids:tokens})},sync:{get:async()=>({})},onChanged:{addListener(f){listeners.push(f)}}}};
    window.settings={userBlockEnabled:false,keywordBlockEnabled:true,blockedKeywords:["연습문구"]};
    window.DCBRuntimeSettingsCache={get(d,cb){const s={...d,...settings};cb?.(s);return Promise.resolve(s)},onChanged:chrome.storage.onChanged};
  });
  for (const f of ["shared/keyword-matcher","content/keyword/keyword-blocker","content/user/writer-layout","content/user/block-target","content/user/cleaner-userblock","content/user/ctx-probe"])
    await page.addScriptTag({path:"src/"+f+".js"});
  assert.deepEqual(errors, []);
  assert.equal(await page.locator(".title_subject").textContent(), "연습문구");
  await page.getByRole("button",{name:"이번 글 계속 보기"}).click();
  await page.locator(".write_div").evaluate(e=>e.textContent+="연습문구");
  assert.equal(await page.locator("#dcb-keyword-article-overlay").count(),0);
  await page.evaluate(()=>{
    const row = document.querySelector("#comment_li_1");
    const fragment = document.createDocumentFragment();
    for(let i=3;i<=2001;i++) {
      const copy=row.cloneNode(true);
      copy.querySelector("[data-dcb-owned=userblock]")?.remove();
      copy.id="comment_li_"+i;
      fragment.append(copy);
    }
    row.after(fragment);
    document.dispatchEvent(new Event("dcb-userblock:refresh"));
    for(const f of listeners) f({userBlockEnabled:{newValue:false}},"sync");
  });
  await page.locator("#comment_li_5 .dcb-userblock-unblock").waitFor();
  assert.ok(await page.locator(".dcb-userblock-unblock").count()<100);
  await page.evaluate(()=>{for(const row of [...document.querySelectorAll(".cmt_list li")].slice(1))row.remove()});
  await page.locator(".dcb-userblock-unblock").click();
  await page.getByRole("button",{name:"닉네임 정확 일치 · 테스트닉"}).click();
  await page.waitForFunction(()=>document.querySelector(".dcb-userblock-unblock")?.dataset.add==="false");
  assert.deepEqual(await page.evaluate(()=>tokens),["nick-exact:테스트닉"]);
  await page.locator(".dcb-userblock-unblock").click();
  await page.waitForFunction(()=>tokens.length===0);
  await page.locator(".nickname").click({button:"right"});
  await page.getByRole("button",{name:"닉네임 일부 포함 · 테스트닉"}).click();
  assert.deepEqual(await page.evaluate(()=>tokens),["nick:테스트닉"]);
  await page.evaluate(()=>{
    const old = document.getElementById("comment_li_1");
    const other = old.cloneNode(true);
    other.querySelector(".dcb-userblock-unblock-host")?.remove();
    other.id = "comment_li_2";
    other.querySelector(".gall_writer").dataset.nick = "앞테스트닉";
    other.querySelector(".nickname").textContent = "앞테스트닉";
    old.after(other);
    settings.userBlockEnabled = true;
    for(const f of listeners) f({userBlockEnabled:{newValue:true}},"sync");
  });
  await page.waitForFunction(()=>document.querySelectorAll("li.dcb-userblock-hidden").length===2);
  await page.evaluate(()=>{
    window.tokens = ["nick-exact:테스트닉"];
    for(const f of listeners) f({blockedUids:{newValue:tokens},userBlockEnabled:{newValue:true}},"sync");
  });
  await page.waitForFunction(()=>document.querySelectorAll("li.dcb-userblock-hidden").length===1);
  assert.equal(await page.locator("li.dcb-userblock-hidden").getAttribute("id"),"comment_li_1");
  await page.evaluate(()=>{history.pushState({},"","?id=fixture&no=2");document.querySelector(".write_div").textContent="연습문구";});
  await page.getByRole("button",{name:"이번 글 계속 보기"}).waitFor();
  // Read state on the following row must not intercept a menu that overlaps it.
  await page.setContent('<style>table{width:100%;border-collapse:collapse}td{height:40px;background:white}.gall_writer{position:relative}.user_data_list{position:absolute;top:22px;left:0;z-index:4;background:white;padding:12px}</style><table class="gall_list"><tr class="dcb-read-post"><td class="gall_tit"><a>제목</a></td><td class="gall_writer"><button>작성자</button><div class="user_data_list"><button>작성글 검색</button></div></td></tr><tr class="dcb-read-post"><td>제목</td><td class="gall_writer">다음 작성자</td></tr></table>');
  await page.addStyleTag({path:"src/content/appearance/visited-posts.css"});
  const search = page.getByRole("button",{name:"작성글 검색"});
  await search.click({trial:true});
  assert.equal(await search.evaluate(node=>getComputedStyle(node.closest("tr")).opacity),"1");
  assert.deepEqual(errors,[]);
});

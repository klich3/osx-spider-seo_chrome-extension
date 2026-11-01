// Real app (Xcode build) + stdio MCP + Chromium extension. All state is isolated.
// Run with SPIDER_APP_EXECUTABLE=/path/Spider\ SEO.app/Contents/MacOS/Spider\ SEO
// and optionally SPIDER_MCP_EXECUTABLE=/path/spider-mcp.
import {chromium} from 'playwright';
import {spawn} from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import readline from 'node:readline';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
const source = fileURLToPath(new URL('../',import.meta.url));
const repo = path.resolve(source,'../..');
const executable = process.env.SPIDER_APP_EXECUTABLE;
if (!executable) throw new Error('Set SPIDER_APP_EXECUTABLE to the actual built app executable.');
const port = Number(process.env.SPIDERSEO_CHROME_TEST_PORT || 47836);
const temp = fs.mkdtempSync(path.join(os.tmpdir(),'spider-native-chrome-'));
const extension = path.join(temp,'extension'); fs.mkdirSync(extension);
for (const name of ['src','vendor','icons','manifest.json','panel.html','panel.css','devtools.html','about.html','privacy.html']) fs.cpSync(path.join(source,name),path.join(extension,name),{recursive:true});
const companionPath=path.join(extension,'src/companion.js');
fs.writeFileSync(companionPath,fs.readFileSync(companionPath,'utf8').replace('127.0.0.1:47836',`127.0.0.1:${port}`));
const manifest=JSON.parse(fs.readFileSync(path.join(extension,'manifest.json')));
manifest.permissions.push(...manifest.optional_permissions);manifest.host_permissions=manifest.optional_host_permissions;delete manifest.optional_permissions;delete manifest.optional_host_permissions;
fs.writeFileSync(path.join(extension,'manifest.json'),JSON.stringify(manifest));
const env={...process.env,CHROME_PATH:process.env.CHROME_PATH || chromium.executablePath(),SPIDERSEO_APP_SUPPORT:path.join(temp,'native'),SPIDERSEO_STORE_PATH:path.join(temp,'native/crawl.sqlite')};
const sleep = ms => new Promise(r => setTimeout(r,ms));
const log=fs.openSync('/tmp/spider-native-chrome-app.log','w');
const server=http.createServer((req,res) => {res.setHeader('Content-Type','text/html');res.end('<!doctype html><html lang="es"><title>Native Chrome bridge fixture</title><meta name="description" content="Real app and MCP test"><body><h1>App to Chrome to MCP</h1><script>window.dataLayer=[];function gtag(){dataLayer.push(arguments)}gtag("consent","default",{analytics_storage:"denied"});setTimeout(()=>navigator.sendBeacon("https://www.google-analytics.com/g/collect?tid=G-NATIVE&en=fixture_view&gcs=G100","v=2"),400)</script></body></html>');});
let app,mcp,context,seq=0;
const pending=new Map();
async function call(name,args) {
 const id=++seq;
 return new Promise((resolve,reject) => {
  const timer=setTimeout(() => {pending.delete(id);reject(new Error(`MCP timed out: ${name}`));},20000);
  pending.set(id,{resolve:r => {clearTimeout(timer);if(r.error)reject(new Error(JSON.stringify(r.error)));else {
   const tool=r.result;if(tool.isError)reject(new Error(tool.content[0].text));else resolve(JSON.parse(tool.content[0].text));
  }}});
  mcp.stdin.write(JSON.stringify({jsonrpc:'2.0',id,method:'tools/call',params:{name,arguments:args}})+'\n');
 });
}
let secret;
async function controller(action,body={}) {
 const response=await fetch(`http://127.0.0.1:${port}/v1/controller/${action}`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${secret}`},body:JSON.stringify(body)});
 const data=await response.json();assert.equal(response.status,200,JSON.stringify(data));return data;
}
async function waitJob(id,timeout=30000) {
 const end=Date.now()+timeout;
 while(Date.now()<end) {const job=await controller('job',{id});if(job.status==='failed')throw new Error(job.error);if(job.status==='completed')return job;await sleep(250);}
 throw new Error(`Job timeout: ${id}`);
}
try {
 // Refuse to attach to or disturb a broker from a user's running app.
 try {await fetch(`http://127.0.0.1:${port}/`,{signal:AbortSignal.timeout(500)});throw new Error('Port 47836 already in use; close the other Spider SEO instance before this isolated test.');}
 catch(error) {if(error.message.includes('already in use'))throw error;}
 await new Promise(r => server.listen(0,'127.0.0.1',r));const url=`http://127.0.0.1:${server.address().port}`;
 app=spawn(executable,['-debug.chromeExtensionEnabled','YES'],{env,stdio:['ignore',log,log]});
 for(let i=0;i<100;i++) {
  if(app.exitCode!=null)throw new Error(`App exited: ${app.exitCode}; see /tmp/spider-native-chrome-app.log`);
  try {secret=fs.readFileSync(path.join(env.SPIDERSEO_APP_SUPPORT,'chrome-extension/controller-token'),'utf8');await controller('status');break;}catch{await sleep(300);}
 }
 assert.ok(secret,'Actual app did not start the bridge');
 console.log('Actual app started loopback broker');
 mcp=spawn(process.env.SPIDER_MCP_EXECUTABLE || path.join(repo,'.build/debug/spider-mcp'),[],{env,stdio:['pipe','pipe',log]});
 readline.createInterface({input:mcp.stdout}).on('line',line=>{const result=JSON.parse(line);const waiter=pending.get(result.id);if(waiter){pending.delete(result.id);waiter.resolve(result);}});
 const initial=await call('spider_chrome_extension',{action:'status'});assert.equal(initial.available,false);assert.equal(initial.installed,null);
 const pairing=await call('spider_chrome_extension',{action:'pair'});
 context=await chromium.launchPersistentContext('',{channel:'chromium',headless:!process.env.SPIDER_HEADED,args:[`--disable-extensions-except=${extension}`,`--load-extension=${extension}`]});
 const worker=context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');const id=new URL(worker.url()).host;
 await context.route('https://www.google-analytics.com/**',route=>route.fulfill({status:204,headers:{'access-control-allow-origin':'*'}}));
 const page=await context.newPage();await page.goto(url);
 const panel=await context.newPage();await page.bringToFront();await panel.goto(`chrome-extension://${id}/panel.html`);
 await panel.waitForFunction(() => document.body.dataset.ready === 'true');
 await panel.locator('#tab-connection').click();
 await panel.locator('#pair-code').fill(pairing.code);await panel.locator('#pair').click();
 try { await panel.waitForFunction(()=>document.querySelector('#connection').textContent.startsWith('Connected'),null,{timeout:15000}); }
 catch(error) { console.error('Connection UI:',await panel.locator('#connection').textContent());throw error; }
 const online=await call('spider_chrome_extension',{action:'status'});assert.equal(online.available,true);assert.equal(online.installed,true);
 console.log('Extension paired through UI; app and MCP detect it');
 for(const action of ['open','snapshot','capture']) {
  const queued=await call('spider_chrome_extension',{action,url,allow_private_hosts:true});
  const result=await waitJob(queued.id);assert.equal(result.using_extension,true);
  if(action==='snapshot')assert.equal(result.result.page.seo.title,'Native Chrome bridge fixture');
  if(action==='capture')assert.ok(result.result.capture.events.some(e=>e.name==='fixture_view' && e.provider==='GA4'));
  const fromMCP=await call('spider_chrome_extension',{action:'result',job_id:queued.id});assert.equal(fromMCP.status,'completed');
  console.log('PASS app broker ↔ Chrome ↔ MCP:',action);
 }
 const fromApp=await controller('enqueue',{action:'snapshot',url,client:'app'});
 assert.equal((await waitJob(fromApp.id)).result.page.seo.title,'Native Chrome bridge fixture');
 console.log('PASS app-originated page test');
 const invalidPage=await panel.evaluate(() => chrome.runtime.sendMessage({type:'companion:sendPage'}));
 assert.ok(invalidPage.error,'Missing target must not inspect an unrelated tab');
 await panel.locator('#tab-overview').click();
 await panel.locator('#send-page').click();
 await panel.waitForFunction(() => document.querySelector('#status').textContent.includes('Page report sent'));
 const pageUpload=await call('spider_chrome_extension',{action:'latest'});
 assert.equal(pageUpload.result.page.seo.title,'Native Chrome bridge fixture');
 assert.ok(pageUpload.result.page.audit.issues);
 assert.ok(pageUpload.result.page.performance.navigation);
 console.log('PASS manual page audit + timing report delivered to native app and MCP');
 if(process.env.SPIDER_TEST_LIGHTHOUSE) {
  const queued=await call('spider_chrome_extension',{action:'test',url,allow_private_hosts:true,strategy:'desktop'});
  const result=await waitJob(queued.id,180000);assert.ok(result.result.lighthouse.lighthouseVersion);assert.equal(result.result.using_extension,true);
  assert.ok(result.result.page.audit);
  assert.ok(result.result.capture.events.some(e=>e.name==='fixture_view'));
  const history=await controller('reports');assert.ok(history.reports.some(r=>r.id===queued.id));
  await worker.evaluate(tabId => chrome.tabs.update(tabId,{active:true}),result.result.tabId);
  await panel.reload();
  await panel.waitForFunction(() => document.body.dataset.ready === 'true');
  await panel.waitForFunction(() => document.querySelector('#status').textContent.includes('Full test completed'));
  assert.equal(await panel.locator('.score-card').count(),4,'Reopening the popup restores the finished report');
  const report=result.result.lighthouse;
  for(const category of ['accessibility','best-practices','seo'])assert.equal(typeof report.categories[category].score,'number');
  const wrongTab=await panel.evaluate(() => chrome.runtime.sendMessage({type:'companion:sendTest',tabId:-1}));
  assert.ok(wrongTab.error,'A report from another tab must not be sent accidentally');
  const sent=await panel.evaluate(tabId => chrome.runtime.sendMessage({type:'companion:sendTest',tabId}),result.result.tabId);
  assert.ok(!sent.error,sent.error);
  const uploaded=await controller('latest');assert.equal(uploaded.result.lighthouse.lighthouseVersion,report.lighthouseVersion);
  const received=await call('spider_chrome_extension',{action:'latest'});assert.equal(received.result.lighthouse.lighthouseVersion,report.lighthouseVersion);
  console.log('PASS real Lighthouse LHR returned to app/MCP; standalone Send report also received by both; performance availability:',report.categories.performance.score);
 }
 if (process.env.SPIDER_TEST_NATIVE_LIGHTHOUSE) {
   const result = await panel.evaluate(() => chrome.runtime.sendMessage({type:'companion:nativeLighthouse',tabId:undefined}));
   assert.ok(result.error,'Missing page cannot start a native audit');
   const tabId = await worker.evaluate(async url => (await chrome.tabs.query({})).find(t=>t.url?.startsWith(url)).id,url);
   const native = await panel.evaluate(tabId => chrome.runtime.sendMessage({type:'companion:nativeLighthouse',tabId,strategy:'desktop'}),tabId);
   assert.ok(!native.error,native.error);
   assert.equal(native.result.engine,'native');
   for (const key of ['performance','accessibility','best-practices','seo']) assert.equal(typeof native.result.lighthouse.categories[key].score,'number',key);
   assert.equal((await controller('latest')).result.engine,'native');
   console.log('PASS COMPLETE native Lighthouse via extension → app → report: all FOUR scores numeric');
 }
 await call('spider_chrome_extension',{action:'disconnect'});
 assert.equal((await controller('status')).available,false);
 console.log('PASS disconnect/revocation; native end-to-end smoke complete');
} finally {
 await context?.close();mcp?.stdin.end();app?.kill('SIGTERM');mcp?.kill('SIGTERM');server.close();fs.closeSync(log);fs.rmSync(temp,{recursive:true,force:true});
}

import {chromium} from 'playwright';
import http from 'node:http';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const source = fileURLToPath(new URL('../', import.meta.url));
const extension = fs.mkdtempSync(path.join(os.tmpdir(),'spider-lighthouse-smoke-'));
for (const name of ['src','vendor','icons','manifest.json','panel.html','panel.css','devtools.html','about.html','privacy.html']) fs.cpSync(path.join(source,name),path.join(extension,name),{recursive:true});
const manifest = JSON.parse(fs.readFileSync(path.join(extension,'manifest.json')));
manifest.permissions.push(...manifest.optional_permissions);
manifest.host_permissions = manifest.optional_host_permissions;
delete manifest.optional_permissions; delete manifest.optional_host_permissions;
fs.writeFileSync(path.join(extension,'manifest.json'),JSON.stringify(manifest));
const server = http.createServer((req,res) => { res.setHeader('Content-Type','text/html');res.end('<!doctype html><html lang="en"><head><title>Spider SEO audit fixture</title><meta name="description" content="Local Lighthouse fixture for Spider SEO"><meta name="viewport" content="width=device-width, initial-scale=1"><style>body{font:20px system-ui;background:#fff;color:#222;padding:40px}h1{color:#a62658}</style></head><body><main><h1>Spider SEO local Lighthouse test</h1><p>This page verifies a real local Lighthouse audit, without a remote service.</p><a href="/">Home</a></main></body></html>'); });
await new Promise(r => server.listen(0,'127.0.0.1',r));
let context;
try {
 console.log('Launching isolated Chromium');
 context = await chromium.launchPersistentContext('',{channel:'chromium',headless:!process.env.SPIDER_HEADED,args:[...(process.env.SPIDER_DISABLE_GPU ? ['--disable-gpu'] : []),`--disable-extensions-except=${extension}`,`--load-extension=${extension}`]});
 console.log('Chromium launched');
 const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
 const extensionId = new URL(worker.url()).host;
 worker.on('close',() => console.log('WORKER CLOSED'));
 worker.on('console', message => { console.log('WORKER',message.type(),message.text().slice(0,500)); });
 const page = await context.newPage(); await page.goto(`http://127.0.0.1:${server.address().port}`);
 const tabId = await worker.evaluate(async url => (await chrome.tabs.query({})).find(t => t.url?.startsWith(url)).id,page.url());
 const panel = await context.newPage(); await page.bringToFront(); await panel.goto(`chrome-extension://${extensionId}/panel.html`);
 await worker.evaluate(() => {
   globalThis.traceDiagnostic = {count:0,names:{},markers:[]};
   chrome.debugger.onEvent.addListener((source,method,params) => {
     if (method !== 'Tracing.dataCollected') return;
     for (const event of params.value) {
       traceDiagnostic.count++;
       traceDiagnostic.names[event.name]=(traceDiagnostic.names[event.name] || 0)+1;
       if (/TracingStarted|FrameCommitted|navigationStart/.test(event.name) && traceDiagnostic.markers.length<20) traceDiagnostic.markers.push(event);
     }
   });
 });
 console.log('Starting local Lighthouse',tabId);
 const watcher=setInterval(() => worker.evaluate(() => chrome.storage.session.get('lighthouseProgress')).then(x => console.log('PROGRESS',x)).catch(() => {}),5000);
 const result = await Promise.race([panel.evaluate(({tabId,full}) => chrome.runtime.sendMessage({type:full ? 'companion:test' : 'companion:lighthouse',tabId,strategy:'desktop'}),{tabId,full:!!process.env.SPIDER_TEST_FULL}),new Promise((_,reject) => setTimeout(() => reject(new Error('Lighthouse smoke timed out after 150 s')),150000).unref())]);
 clearInterval(watcher);
 fs.writeFileSync('/tmp/spider-trace-diagnostic.json',JSON.stringify(await worker.evaluate(() => traceDiagnostic),null,2));
 assert.ok(!result.error,result.error);
 if (process.env.SPIDER_TEST_FULL) {
   assert.ok(result.result.page.audit);
   assert.ok(result.result.capture.events);
   assert.equal(result.result.capture.recording,false,'The combined report must describe a finished capture');
   const state = await worker.evaluate(tabId => chrome.storage.session.get(`tab:${tabId}`),tabId);
   assert.equal(state[`tab:${tabId}`].recording,false,'Capture must stop before Lighthouse');
   assert.ok(Array.isArray(result.result.warnings));
 }
 const lhr = result.result.lighthouse;
 fs.writeFileSync('/tmp/spider-extension-lighthouse.json',JSON.stringify(lhr));
 console.log('AUDIT ERRORS',Object.entries(lhr.audits).filter(([,v]) => v.errorMessage).map(([id,v]) => ({id,error:v.errorMessage})).slice(0,20));
 console.log(JSON.stringify({version:lhr.lighthouseVersion,runtimeError:lhr.runtimeError,scores:Object.fromEntries(Object.entries(lhr.categories).map(([k,v]) => [k,v.score]))}));
 assert.ok(lhr.lighthouseVersion);
 assert.equal(lhr.configSettings.formFactor,'desktop');
 assert.equal(lhr.configSettings.throttling.cpuSlowdownMultiplier,1);
 for (const id of ['accessibility','best-practices','seo']) assert.equal(typeof lhr.categories[id].score,'number',id);
 assert.ok(lhr.categories.performance,'The performance category must be present, even when Chrome cannot provide its score');
 if (lhr.categories.performance.score == null) {
  assert.ok(lhr.audits['speed-index']?.errorMessage || lhr.runtimeError,'Unavailable performance must have an explicit cause');
  assert.ok(lhr.runWarnings.some(w => w.includes('Performance score is unavailable')));
  console.log('LIMITATION: this Chrome returned no full performance trace/filmstrip; score stays null with visible errors.');
 } else assert.equal(typeof lhr.categories.performance.score,'number');
 assert.equal(result.result.using_extension,true);
 fs.writeFileSync('/tmp/spider-extension-lighthouse.json',JSON.stringify(lhr));
 const ownsDebugger = await worker.evaluate(async tabId => { try { await chrome.debugger.sendCommand({tabId},'Runtime.evaluate',{expression:'1'}); return true; } catch { return false; } },tabId);
 assert.equal(ownsDebugger,false,'This extension must release its debugger after audit (other test clients may still be attached).');
 console.log('PASS: real bundled Lighthouse report, three verified category scores, explicit performance availability/errors, and debugger cleanup.');
} finally { await context?.close();server.close();fs.rmSync(extension,{recursive:true,force:true}); }

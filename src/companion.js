
const base = 'http://127.0.0.1:47836/v1';
import {siteOrigin} from './permissions.js';
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
let running = false, polling = false, activeTabId = null, generation = 0;
let api;
async function credentials() { return (await chrome.storage.local.get('companion')).companion; }
async function post(path, body, token) {
  const response = await fetch(`${base}/${path}`, {method:'POST', headers:{'Content-Type':'application/json', ...(token ? {Authorization:`Bearer ${token}`} : {})}, body:JSON.stringify(body), signal:AbortSignal.timeout(12000)});
  const json = await response.json();
  if (!response.ok) { const error = new Error(json.error || `Local app returned HTTP ${response.status}`); error.status = response.status; throw error; }
  return json;
}
async function connectionStatus() {
  const session = await chrome.storage.session.get(['connectionStatus']);
  return {...(session.connectionStatus || {connected:false}),paired:!!(await credentials()),running,progress:running ? 'Capturing analytics in Chrome…' : null};
}
async function badge() {
  const states = await chrome.storage.session.get(null);
  const captureCount = Object.entries(states).filter(([key,value]) => key.startsWith('tab:') && value.recording).length;
  await chrome.action.setBadgeText({text:running ? 'TEST' : (captureCount ? 'REC' : '')});
  await chrome.action.setBadgeBackgroundColor({color:'#bd235c'});
  await chrome.action.setTitle({title:running ? 'Spider SEO — using Chrome extension for a test' : captureCount ? 'Spider SEO — recording analytics' : 'Spider SEO — Tags & Analytics'});
}
async function completeTab(id, timeout = 30000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    const tab = await chrome.tabs.get(id);
    if (tab.status === 'complete') return tab;
    await delay(200);
  }
  throw new Error('Chrome page load timed out.');
}
async function execute(job) {
  if (!['open','snapshot','capture'].includes(job.action)) throw new Error('Unsupported app/MCP action.');
  const origin = siteOrigin(job.url);
  const tab = await chrome.tabs.create({url:job.url, active:true});
  activeTabId = tab.id;
  if (job.action === 'open') return {using_extension:true, tabId:tab.id, url:job.url};
  if (!await chrome.permissions.contains({origins:[origin]})) throw new Error(`Page opened. Open the extension on ${new URL(job.url).origin} and choose “Allow this site” before app/MCP inspection.`);
  await completeTab(tab.id);
  if (job.action === 'snapshot') return {using_extension:true, tabId:tab.id, page:await api.snapshot(tab.id)};
  await api.start(tab.id);
  try {
    await chrome.tabs.reload(tab.id);
    await completeTab(tab.id);
    await delay(10000);
    return {using_extension:true, tabId:tab.id, capture:await api.read(tab.id)};
  } finally { await api.stop(tab.id); }
}
async function poll() {
  if (polling) return;
  const config = await credentials();
  if (!config) return;
  polling = true;
  try {
    const pending = (await chrome.storage.session.get('pendingResult')).pendingResult;
    if (pending) {
      try {
        await post('result', pending, config.token);
        if (pending.result?.completedAt) {
          const saved = (await chrome.storage.session.get('latestTest')).latestTest;
          if (saved?.completedAt === pending.result.completedAt) {
            saved.sent = true;
            await chrome.storage.session.set({latestTest:saved});
          }
        }
      }
      catch (error) { if (error.status !== 409) throw error; }
      await chrome.storage.session.remove('pendingResult');
    }
    const response = await post('poll', {version:chrome.runtime.getManifest().version, busy:running}, config.token);
    await chrome.storage.session.set({connectionStatus:{connected:true, checked:Date.now()}});
    if (response.job && !running) {
      running = true; await badge();
      // Do not hold the poll lock for the audit; heartbeat continues while Chrome works.
      const startedGeneration = generation;
      void (async () => {
        let result;
        try { result = {id:response.job.id, result:await execute(response.job)}; }
        catch (error) { result = {id:response.job.id, error:error.message}; }
        if (startedGeneration !== generation) result = {id:response.job.id,error:'Test cancelled by user.'};
        await chrome.storage.session.set({pendingResult:result});
        running = false; await badge();
        void poll();
      })().catch(async error => {
        running = false;
        await chrome.storage.session.set({connectionStatus:{connected:false,error:error.message}}); await badge();
      });
    }
  } catch (error) {
    if (error.status === 403) { await chrome.storage.local.remove('companion'); await chrome.storage.session.remove('pendingResult'); await chrome.alarms.clear('spider-companion'); }
    await chrome.storage.session.set({connectionStatus:{connected:false, error:error.message, checked:Date.now()}});
  }
  finally { polling = false; }
}
export function installCompanion(captureAPI) {
  api = captureAPI;
  void chrome.storage.local.setAccessLevel({accessLevel:'TRUSTED_CONTEXTS'});
  void chrome.storage.session.setAccessLevel({accessLevel:'TRUSTED_CONTEXTS'});
  chrome.runtime.onMessage.addListener((message, sender, respond) => {
    if (!message.type?.startsWith('companion:') || !sender.url?.startsWith(chrome.runtime.getURL(''))) return;
    (async () => {
      switch (message.type) {
      case 'companion:status': void poll(); return connectionStatus();
      case 'companion:pair': {
        const response = await post('pair', {code:String(message.code)}, null);
        await chrome.storage.local.set({companion:{token:response.token}});
        await chrome.alarms.create('spider-companion', {periodInMinutes:0.5});
        await poll(); return connectionStatus();
      }
      case 'companion:disconnect': {
        generation++;
        if (activeTabId != null && running) { await api.stop(activeTabId); }
        const config = await credentials();
        if (config) await post('unpair', {}, config.token).catch(() => {});
        await chrome.storage.local.remove('companion'); await chrome.alarms.clear('spider-companion');
        await chrome.storage.session.remove(['connectionStatus','pendingResult']);
        return {paired:false,connected:false};
      }
      case 'companion:delete': {
        generation++;
        const states = await chrome.storage.session.get(null);
        for (const [key,value] of Object.entries(states)) if (key.startsWith('tab:') && value.recording) await api.stop(Number(key.slice(4)));
        await chrome.storage.session.clear(); await badge(); return {deleted:true};
      }
      case 'companion:sendPage': {
        const config = await credentials(); if (!config) throw new Error('Pair with the local app/MCP first.');
        const page = await api.snapshot(message.tabId);
        const capture = await api.read(message.tabId);
        await post('upload',{result:{using_extension:true,source:'Chrome extension (local)',page,capture}},config.token);
        return {sent:true};
      }
      default: throw new Error('Unknown companion action.');
      }
    })().then(result => respond({result}), error => respond({error:error.message}));
    return true;
  });
  chrome.alarms.onAlarm.addListener(alarm => { if (alarm.name === 'spider-companion') void poll(); });
  chrome.runtime.onStartup.addListener(() => { void poll(); });
  chrome.storage.onChanged.addListener((changes, area) => { if (area === 'session' && Object.keys(changes).some(key => key.startsWith('tab:'))) void badge(); });
  setInterval(() => void poll(), 2500);
  void poll();
}

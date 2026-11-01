import {auditPage} from './audit.js';
import {installCompanion} from './companion.js';
import {classify, parseRequest} from './analytics.js';
import {observePage, bridgePage, snapshotPage} from './page.js';

const key = id => `tab:${id}`;
// Serialize mutations: webRequest, content messages and UI actions can arrive together.
let queue = Promise.resolve();
function serial(work) {
  const result = queue.then(work);
  queue = result.catch(() => {});
  return result;
}
async function read(id) { return (await chrome.storage.session.get(key(id)))[key(id)]; }
async function write(id, state) { await chrome.storage.session.set({[key(id)]: state}); }
async function inject(id) {
  await chrome.scripting.executeScript({target: {tabId: id}, func: bridgePage});
  await chrome.scripting.executeScript({target: {tabId: id}, world: 'MAIN', func: observePage});
}
async function snapshot(id) {
  const [result] = await chrome.scripting.executeScript({target: {tabId: id}, world: 'MAIN', func: snapshotPage});
  return {...result.result, audit:auditPage(result.result)};
}
function append(state, event) {
  state.events.push({...event, scenario: state.scenario});
  if (state.events.length > 1000) { state.events.shift(); state.dropped++; }
}

chrome.webRequest.onBeforeRequest.addListener(details => {
  if (details.tabId < 0 || !classify(details.url)) return;
  serial(async () => {
    const state = await read(details.tabId);
    if (!state?.recording) return;
    for (const event of parseRequest(details)) append(state, {...event, source: 'network', status: 'pending'});
    await write(details.tabId, state);
  }).catch(() => {});
}, {urls: ['http://*/*', 'https://*/*']}, ['requestBody']);

for (const [name, failure] of [['onCompleted', false], ['onErrorOccurred', true]]) {
  chrome.webRequest[name].addListener(details => {
    if (details.tabId < 0 || !classify(details.url)) return;
    serial(async () => {
      const state = await read(details.tabId);
      if (!state?.recording) return;
      for (const event of state.events) if (event.requestId === details.requestId) {
        event.status = failure ? 'failed' : details.statusCode;
        if (failure) event.error = details.error;
      }
      await write(details.tabId, state);
    }).catch(() => {});
  }, {urls: ['http://*/*', 'https://*/*']});
}

chrome.webNavigation.onCommitted.addListener(details => {
  if (details.frameId !== 0) return;
  serial(async () => {
    const state = await read(details.tabId);
    if (!state?.recording) return;
    append(state, {kind: 'navigation', source: 'browser', time: details.timeStamp, name: new URL(details.url).origin});
    await write(details.tabId, state);
    await inject(details.tabId);
  }).catch(() => {});
}, {url: [{schemes: ['http', 'https']}]});
chrome.tabs.onRemoved.addListener(id => { serial(() => chrome.storage.session.remove(key(id))).catch(() => {}); });

async function startCapture(id) {
  return serial(async () => {
    const tab = await chrome.tabs.get(id);
    if (!/^https?:\/\//.test(tab.url || '')) throw new Error('Open a regular HTTP(S) page first.');
    const state = {recording: true, started: Date.now(), scenario: 'Unspecified', events: [], dropped: 0};
    await write(id, state);
    try { await inject(id); state.page = await snapshot(id); await write(id, state); }
    catch (error) { state.recording = false; await write(id, state); throw error; }
    return state;
  });
}
async function stopCapture(id) {
  return serial(async () => {
    const state = await read(id);
    if (state) { state.recording = false; await write(id, state); }
    await chrome.scripting.executeScript({target: {tabId: id}, world: 'MAIN', func: () => window.dispatchEvent(new Event('spider-seo-stop'))}).catch(() => {});
    return state;
  });
}

chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (message.type?.startsWith('companion:')) return;
  if (message.type === 'observation') {
    // Page observations are untrusted diagnostics, never commands or authorization.
    const id = sender.tab?.id;
    if (!id || sender.frameId !== 0) return;
    serial(async () => {
      const state = await read(id);
      if (!state?.recording) return;
      const o = message.observation;
      if (!o || !['consent', 'configuration', 'dataLayer'].includes(o.kind)) return;
      const fields = {};
      for (const field of ['analytics_storage','ad_storage','ad_user_data','ad_personalization','functionality_storage','security_storage'])
        if (['granted','denied'].includes(o.fields?.[field])) fields[field] = o.fields[field];
      append(state, {source: 'page', kind: o.kind, time: Date.now(), historical: !!o.historical,
        name: String(o.name || o.command || o.id || '').slice(0, 120), fields});
      await write(id, state);
    }).catch(() => {});
    return;
  }
  // Only extension UI pages can control captures or read stored results.
  if (!sender.url?.startsWith(chrome.runtime.getURL(''))) return;
  if (message.type === 'start' || message.type === 'stop') {
    if (!Number.isInteger(message.tabId) || message.tabId < 0) { respond({error:'Choose an HTTP(S) tab.'}); return; }
    (message.type === 'start' ? startCapture(message.tabId) : stopCapture(message.tabId))
      .then(state => respond({state}), error => respond({error:error.message}));
    return true;
  }
  serial(async () => {
    const id = message.tabId;
    if (!Number.isInteger(id) || id < 0) throw new Error('Choose an HTTP(S) tab.');
    let state = await read(id);
    if (message.type === 'clear') {
      if (state) { state.events = []; state.dropped = 0; await write(id, state); }
    } else if (message.type === 'scenario') {
      if (state && ['Before consent', 'Accepted', 'Rejected', 'Unspecified'].includes(message.value)) {
        state.scenario = message.value;
        append(state, {source: 'user', kind: 'marker', name: message.value, time: Date.now()});
        await write(id, state);
      }
    } else if (message.type === 'snapshot') {
      state ||= {recording:false, started:Date.now(), scenario:'Unspecified', events:[], dropped:0};
      state.page = await snapshot(id);
      await write(id, state);
    } else if (message.type !== 'state') throw new Error('Unknown action.');
    return await read(id) || null;
  }).then(state => respond({state}), error => respond({error: error.message}));
  return true;
});

installCompanion({start:startCapture, stop:stopCapture, read:id => serial(() => read(id)), snapshot});

import {providerOrigins, siteOrigin} from './permissions.js';
const $ = id => document.getElementById(id);
let tabId = chrome.devtools?.inspectedWindow?.tabId;
let state = null;
const tabs = [...document.querySelectorAll('[role="tab"]')];
function selectTab(tab, focus = false, persist = true) {
  if (persist) void chrome.storage.local.set({selectedWorkspace:tab.id});
  for (const item of tabs) {
    const selected = item === tab;
    item.setAttribute('aria-selected', String(selected));
    item.tabIndex = selected ? 0 : -1;
    $(item.getAttribute('aria-controls')).hidden = !selected;
  }
  if (focus) tab.focus();
}
for (const tab of tabs) {
  tab.onclick = () => selectTab(tab);
  tab.onkeydown = event => {
    if (!['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
    event.preventDefault();
    const index = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 :
      (tabs.indexOf(tab) + (event.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length;
    selectTab(tabs[index], true);
  };
}
let actionMessage = null, connectionError = null;
let lastTestTime = null, wasRunning = false;
let currentTabURL = null;
if (tabId === undefined) tabId = (await chrome.tabs.query({active: true, currentWindow: true}))[0]?.id;
async function readTargetURL() {
  if (chrome.devtools?.inspectedWindow) {
    return new Promise(resolve => chrome.devtools.inspectedWindow.eval('location.href',(value,error) => resolve(error ? null : value)));
  }
  return Number.isInteger(tabId) ? (await chrome.tabs.get(tabId).catch(() => null))?.url : null;
}
currentTabURL = await readTargetURL();
const preferences = await chrome.storage.local.get(['selectedWorkspace']);
selectTab(tabs.find(tab => tab.id === preferences.selectedWorkspace) || $('tab-connection'), false, false);
async function send(type, extra = {}) {
  const result = await chrome.runtime.sendMessage({type, tabId, ...extra});
  if (result.error) throw new Error(result.error);
  state = result.state;
  if (type === 'state') currentTabURL = await readTargetURL();
  if (type !== 'state') actionMessage = null;
  render();
}
function render() {
  $('status').textContent = actionMessage || (state ? `${state.recording ? 'Recording' : 'Stopped'} · ${state.events.length} observations · ${state.dropped} older observations dropped` : 'Choose Inspect page or Start capture to inspect this tab.');
  $('start').disabled = !!state?.recording;
  $('stop').disabled = !state?.recording;
  $('scenario').value = state?.scenario || 'Unspecified';
  document.querySelector('.status-dot').classList.toggle('recording', !!state?.recording);
  const page = state?.page;
  if (page) {
    const values = [['URL',page.url],['Title',page.seo?.title],['Description',page.seo?.description],['Canonical',page.seo?.canonical]];
    $('page-summary').replaceChildren(...values.flatMap(([label,value]) => {
      const term = document.createElement('dt'); term.textContent = label;
      const detail = document.createElement('dd'); detail.textContent = value || 'Not present';
      return [term,detail];
    }));
  }
  $('audit-summary').textContent = page?.audit ? `· ${page.audit.issues.length} findings` : '';
  $('audit-issues').replaceChildren(...(page?.audit?.issues || []).map(issue => {
    const node=document.createElement('li'); node.textContent=`${issue.severity.toUpperCase()}: ${issue.message}`;node.className=`issue-${issue.severity}`;return node;
  }));
  if (page?.audit && !page.audit.issues.length) { const node=document.createElement('li');node.textContent='No issues found by these checks.';$('audit-issues').append(node); }
  $('browser-timing').textContent = page?.performance ? JSON.stringify(page.performance,null,2) : 'Inspect this page first.';
  $('tags').textContent = page ? page.tags.map(t => `${t.provider} ${t.id} (${t.source})`).join(' · ') || 'No supported tag script/runtime detected.' : 'Not inspected.';
  $('globals').textContent = page ? Object.entries(page.globals).map(([k,v]) => `${k}: ${v ? 'present' : 'not observed'}`).join(' · ') : '';
  $('banners').textContent = page ? page.banners.map(b => `${b.name}: ${b.visible ? 'visible' : 'in DOM, hidden'}`).join(' · ') || 'No known banner selector detected (this does not prove absence).' : 'Not inspected.';
  $('seo').textContent = page ? JSON.stringify({url: page.url, ...page.seo}, null, 2) : 'Not inspected.';
  const filter = $('filter').value.toLowerCase();
  const rows = (state?.events || []).filter(e => JSON.stringify(e).toLowerCase().includes(filter)).slice(-300).reverse();
  $('count').textContent = `(${rows.length} shown)`;
  $('events').replaceChildren(...rows.map(e => {
    const row = document.createElement('tr');
    for (const text of [new Date(e.time).toLocaleTimeString(), `${e.source} · ${e.provider || e.kind}${e.historical ? ' (history; time unknown)' : ''}`, [e.name, e.id, e.endpoint].filter(Boolean).join(' · '), `${e.scenario} ${JSON.stringify(e.fields || {})}`, e.error || e.status || 'Observed']) {
      const td = document.createElement('td'); td.textContent = text; row.append(td);
    }
    return row;
  }));
}
function showActionError(error) { actionMessage = error.message; render(); }
function allowSite(includeProviders = true) {
  // Call request in the click's user gesture, before awaiting any other API.
  if (!currentTabURL) throw new Error('Open a regular HTTP(S) page and reopen the inspector.');
  const origins = [siteOrigin(currentTabURL), ...(includeProviders ? providerOrigins : [])];
  return chrome.permissions.request({origins}).then(granted => { if (!granted) throw new Error('Site access was not granted.'); });
}
for (const action of ['start','stop','snapshot','clear']) $(action).onclick = async () => {
  try { if (action === 'start' || action === 'snapshot') await allowSite(action === 'start'); await send(action); }
  catch (error) { showActionError(error); }
};
$('scenario').onchange = () => send('scenario', {value: $('scenario').value}).catch(showActionError);
$('filter').oninput = render;
$('export').onclick = () => {
  if (!state) return;
  const blob = new Blob([JSON.stringify({schemaVersion: 1, exportedAt: new Date().toISOString(), ...state}, null, 2)], {type: 'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = `spider-seo-analytics-${Date.now()}.json`; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
setInterval(() => { void send('state').catch(showActionError); void refreshConnection(); }, 1500);
async function companion(action, extra = {}) {
  const response = await chrome.runtime.sendMessage({type:`companion:${action}`, tabId, ...extra});
  if (response.error) throw new Error(response.error);
  return response.result;
}
async function refreshConnection() {
  try {
    const connection = await companion('status');
    $('connection').textContent = connectionError || (connection.connected ? 'Connected to local app/MCP' : connection.paired ? `Paired · app/MCP unavailable${connection.error ? `: ${connection.error}` : ''}` : 'Not paired · standalone mode');
    $('connection-summary').textContent = connection.connected ? '· Connected' : connection.paired ? '· Unavailable' : '· Standalone';
    $('connection-badge').textContent = connection.connected ? 'Connected' : connection.paired ? 'Unavailable' : 'Standalone';
    $('disconnect').disabled = !connection.paired;
  } catch (error) { connectionError=error.message; $('connection').textContent=connectionError; }
}
$('pair').onclick = async () => {
  try {
    const code = $('pair-code').value.replace(/\s/g,'');
    if (!/^\d{8}$/.test(code)) throw new Error('Enter the 8-digit pairing code from the app/MCP.');
    if (!await chrome.permissions.request({origins:['http://127.0.0.1/*']})) throw new Error('Local connection access was not granted.');
    await companion('pair', {code}); connectionError=null; $('pair-code').value = ''; await refreshConnection();
  } catch (error) { connectionError=error.message; $('connection').textContent=connectionError; }
};
$('disconnect').onclick = async () => {
  try { await companion('disconnect'); connectionError=null; await refreshConnection(); }
  catch (error) { connectionError=error.message; $('connection').textContent=connectionError; }
};
$('allow-site').onclick = () => allowSite().then(() => { actionMessage='This site is allowed for app/MCP tests.';render(); }).catch(showActionError);
$('send-page').onclick = () => companion('sendPage').then(() => { actionMessage='Page report sent to local app/MCP.';render(); }).catch(showActionError);
$('delete-data').onclick = () => companion('delete').then(() => { $('page-summary').replaceChildren(); return send('state'); }).catch(showActionError);
await send('state').catch(showActionError);
for (const button of document.querySelectorAll('button')) button.disabled = false;
render();
await refreshConnection();
document.body.setAttribute('aria-busy','false');
document.body.dataset.ready = 'true';

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
const preferences = await chrome.storage.local.get(['selectedWorkspace','lighthouseStrategy','lighthouseEngine']);
selectTab(tabs.find(tab => tab.id === preferences.selectedWorkspace) || $('tab-connection'), false, false);
$('lighthouse-strategy').value = preferences.lighthouseStrategy === 'desktop' ? 'desktop' : 'mobile';
$('lighthouse-engine').value = preferences.lighthouseEngine === 'chrome' ? 'chrome' : 'native';
$('lighthouse-engine').onchange = () => chrome.storage.local.set({lighthouseEngine:$('lighthouse-engine').value});
$('lighthouse-strategy').onchange = () => chrome.storage.local.set({lighthouseStrategy:$('lighthouse-strategy').value});
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
    if (connection.running) { $('lighthouse-summary').textContent = connection.progress; $('lighthouse-result').textContent = `Using Chrome extension — ${connection.progress}`; $('status').textContent = connection.progress; }
    $('full-test').disabled = connection.running;
    $('lighthouse').disabled = connection.running;
    $('lighthouse-target').textContent = currentTabURL ? `Page to test: ${currentTabURL}` : 'Open a website to test it.';
    if (!connection.running && wasRunning) {
      showLighthouse(await companion('latest').catch(() => null));
      await restoreTest();
    }
    wasRunning = connection.running;
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
function lighthouseMessage(message) {
  $('lighthouse-result').textContent = message;
  $('lighthouse-summary').textContent = message;
}

let latestLighthouse;
function showLighthouse(result) {
  if (!result || result.tabId !== tabId) return;
  latestLighthouse = result;
  const lhr = result.lighthouse;
  const cards = Object.entries(lhr.categories || {}).map(([key,category]) => {
    const card = document.createElement('div'); card.className='score-card';
    const score = document.createElement('strong'); score.textContent=category.score == null ? '—' : String(Math.round(category.score * 100));
    const title = document.createElement('span'); title.textContent=category.title || key;
    card.append(score,title); return card;
  });
  const grid = document.createElement('div'); grid.className='score-grid'; grid.append(...cards);
  const warning = document.createElement('p'); warning.className='hint';
  warning.textContent = [result.engine === 'native' ? 'Complete report from desktop app · clean Chrome session · sent to app/MCP.' : null,lhr.runtimeError?.message,...(lhr.runWarnings || [])].filter(Boolean).join(' ');
  $('lighthouse-summary').replaceChildren(grid,warning);
  $('lighthouse-result').textContent = JSON.stringify({source:result.source, using_extension:true, url:result.lighthouse.finalDisplayedUrl || result.lighthouse.finalUrl, version:result.lighthouse.lighthouseVersion,
    scores:Object.fromEntries(Object.entries(result.lighthouse.categories || {}).map(([key,value]) => [key, value.score])), runtimeError:result.lighthouse.runtimeError, warnings:result.lighthouse.runWarnings, failedToRun:Object.entries(result.lighthouse.audits || {}).filter(([,a]) => a.errorMessage).map(([id,a]) => ({id,error:a.errorMessage}))},null,2);
}
function showTest(result) {
  if (!result || result.tabId !== tabId || result.completedAt === lastTestTime) return;
  lastTestTime = result.completedAt;
  if (result.lighthouse) showLighthouse(result);
  actionMessage = `Full test completed${result.sent ? ' · Report sent to app/MCP' : ' · Report saved locally; use Send full report to share it'}.${result.warnings?.length ? ' ' + result.warnings.join(' ') : ''}`;
  render();
}
async function restoreTest() { showTest(await companion('latestTest').catch(() => null)); }
$('send-test').onclick = () => companion('sendTest').then(() => { actionMessage='Full report sent to local app/MCP.';render(); }).catch(showActionError);
$('full-test').onclick = async () => {
  $('full-test').disabled = true;
  try {
    if (!currentTabURL) throw new Error('Open an HTTP(S) page first.');
    const granted = await chrome.permissions.request({permissions:['debugger'],origins:[siteOrigin(currentTabURL),...providerOrigins]});
    if (!granted) throw new Error('Site and debugger access are required for a full test.');
    const result = await companion('test', {strategy:$('lighthouse-strategy').value});
    if (result.lighthouse) showLighthouse(result);
    await send('state');
    showTest(result);
  } catch (error) { showActionError(error); }
  finally { $('full-test').disabled = false; }
};
$('lighthouse').onclick = async () => {
  $('lighthouse').disabled = true; lighthouseMessage('Using Chrome extension — running local Lighthouse…');
  try {
    if (!currentTabURL) throw new Error('Open the website you want to test, then reopen Spider SEO.');
    siteOrigin(currentTabURL);
    if ($('lighthouse-engine').value === 'native') {
      showLighthouse(await companion('nativeLighthouse', {strategy:$('lighthouse-strategy').value}));
      return;
    }
    if (!await chrome.permissions.request({permissions:['debugger']})) throw new Error('Chrome permission was declined. Click Run Lighthouse and allow debugging to start.');
    showLighthouse(await companion('lighthouse', {strategy:$('lighthouse-strategy').value}));
  }
  catch (error) { lighthouseMessage(error.message); }
  finally { $('lighthouse').disabled = false; }
};
$('send-page').onclick = () => companion('sendPage').then(() => { actionMessage='Page report sent to local app/MCP.';render(); }).catch(showActionError);
$('send-lighthouse').onclick = () => companion('send').then(() => { actionMessage='Lighthouse report sent to local app/MCP.'; render(); }).catch(error => lighthouseMessage(error.message));
$('export-lighthouse').onclick = () => {
  if (!latestLighthouse) return;
  const url = URL.createObjectURL(new Blob([JSON.stringify(latestLighthouse.lighthouse,null,2)], {type:'application/json'}));
  const link = document.createElement('a'); link.href=url; link.download='spider-seo-lighthouse.json'; link.click(); setTimeout(() => URL.revokeObjectURL(url),1000);
};
$('delete-data').onclick = () => companion('delete').then(() => { latestLighthouse=null; $('lighthouse-summary').replaceChildren(); $('page-summary').replaceChildren(); $('lighthouse-result').textContent='No Lighthouse report yet.'; return send('state'); }).catch(showActionError);
await send('state').catch(showActionError);
await refreshConnection();
showLighthouse(await companion('latest').catch(() => null));
await restoreTest();
for (const button of document.querySelectorAll('button')) button.disabled = false;
render();
await refreshConnection();
document.body.setAttribute('aria-busy','false');
document.body.dataset.ready = 'true';

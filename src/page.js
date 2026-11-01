// Runs in MAIN only after the user starts capture. No arbitrary page data is sent.
export function observePage() {
  if (window.__spiderSEOObserver) return;
  window.__spiderSEOObserver = true;
  const cleanups = [];
  let active = true;
  const emit = payload => { if (active) window.postMessage({source: 'spider-seo-observation', ...payload}, location.origin); };
  const wrap = layer => {
    if (!Array.isArray(layer) || layer.push.__spiderSEO) return;
    const inspect = (item, historical = false) => {
      try {
        const a = item && typeof item === 'object' && '0' in item ? Array.from(item) : null;
        if (a?.[0] === 'consent' && ['default', 'update'].includes(a[1])) {
          const fields = {};
          for (const key of ['analytics_storage','ad_storage','ad_user_data','ad_personalization','functionality_storage','security_storage']) {
            if (['granted','denied'].includes(a[2]?.[key])) fields[key] = a[2][key];
          }
          emit({kind: 'consent', command: a[1], fields, historical, time: Date.now()});
        } else if (a?.[0] === 'config' && typeof a[1] === 'string') {
          emit({kind: 'configuration', id: a[1].slice(0, 80), historical, time: Date.now()});
        } else if (item && typeof item.event === 'string') {
          emit({kind: 'dataLayer', name: item.event.slice(0, 120), historical, time: Date.now()});
        }
      } catch { /* Observing must never break the site's own push. */ }
    };
    layer.slice(-200).forEach(item => inspect(item, true));
    const original = layer.push;
    function push(...items) {
      const result = Reflect.apply(original, this, items);
      items.forEach(item => inspect(item));
      return result;
    }
    push.__spiderSEO = true;
    layer.push = push;
    cleanups.push(() => { if (layer.push === push) layer.push = original; });
  };
  // Include custom data layer names declared by the installed Google loader.
  const tick = () => {
    const names = new Set(['dataLayer']);
    for (const script of document.scripts) {
      try {
        const u = new URL(script.src);
        if (u.hostname === 'www.googletagmanager.com') names.add(u.searchParams.get('l') || 'dataLayer');
      } catch {}
    }
    for (const name of names) { try { wrap(window[name]); } catch {} }
  };
  tick();
  const timer = setInterval(tick, 1000);
  window.addEventListener('spider-seo-stop', () => {
    active = false;
    clearInterval(timer);
    cleanups.forEach(cleanup => cleanup());
    window.__spiderSEOObserver = false;
  }, {once: true});
}

export function bridgePage() {
  if (window.__spiderSEOBridge) return;
  window.__spiderSEOBridge = true;
  window.addEventListener('message', event => {
    if (event.source !== window || event.origin !== location.origin || event.data?.source !== 'spider-seo-observation') return;
    const data = event.data;
    if (!['consent', 'configuration', 'dataLayer'].includes(data.kind)) return;
    chrome.runtime.sendMessage({type: 'observation', observation: data}).catch(() => {});
  });
}

export async function snapshotPage() {
  const scripts = Array.from(document.scripts, s => s.src).filter(Boolean);
  const tags = [];
  for (const src of scripts) {
    try {
      const u = new URL(src);
      if (/(^|\.)googletagmanager\.com$/.test(u.hostname)) {
        tags.push({provider: u.pathname === '/gtm.js' ? 'GTM' : 'Google tag', id: u.searchParams.get('id') || '', source: 'script'});
      }
      if (/(^|\.)facebook\.net$/.test(u.hostname) && /fbevents\.js$/.test(u.pathname)) tags.push({provider: 'Meta Pixel', id: '', source: 'script'});
    } catch {}
  }
  for (const id of Object.keys(window.google_tag_manager || {}).filter(id => /^(GTM-|G-|AW-|GT-)/.test(id)).slice(0, 100))
    tags.push({provider: 'Google runtime', id, source: 'runtime'});
  const banners = [];
  for (const [name, selector] of [['OneTrust','#onetrust-banner-sdk'],['Cookiebot','#CybotCookiebotDialog'],['Didomi','#didomi-host'],['CookieYes','.cky-consent-container'],['Quantcast','.qc-cmp2-container']]) {
    const node = document.querySelector(selector);
    if (node) { const r = node.getBoundingClientRect(); banners.push({name, visible: r.width > 0 && r.height > 0 && getComputedStyle(node).visibility !== 'hidden'}); }
  }
  const clip = (value, max = 2000) => String(value || '').slice(0, max);
  const safeURL = raw => { try { const u = new URL(raw,location.href); return u.origin + u.pathname; } catch { return ''; } };
  const images = Array.from(document.images);
  const linkSummary = {total:document.links.length, internal:0, external:0, nofollow:0, blankWithoutNoopener:0};
  for (const link of document.links) {
    try { const u = new URL(link.href); if (['http:','https:'].includes(u.protocol)) linkSummary[u.origin === location.origin ? 'internal' : 'external']++; } catch {}
    if (link.relList.contains('nofollow')) linkSummary.nofollow++;
    if (link.target === '_blank' && !link.relList.contains('noopener') && !link.relList.contains('noreferrer')) linkSummary.blankWithoutNoopener++;
  }
  const structuredData = {blocks:0, types:[], errors:0, skipped:0};
  const types = new Set();
  let visited = 0;
  const walk = (node, depth = 0) => {
    if (++visited > 2000 || depth > 10 || !node || typeof node !== 'object') return;
    if (typeof node['@type'] === 'string') types.add(clip(node['@type'],100));
    if (Array.isArray(node['@type'])) for (const type of node['@type']) if (typeof type === 'string') types.add(clip(type,100));
    for (const value of Object.values(node)) if (typeof value === 'object') walk(value,depth+1);
  };
  for (const node of document.querySelectorAll('script[type="application/ld+json" i]')) {
    structuredData.blocks++;
    if (structuredData.blocks > 20 || node.textContent.length > 524288) { structuredData.skipped++; continue; }
    try { walk(JSON.parse(node.textContent)); } catch { structuredData.errors++; }
  }
  structuredData.types = [...types].slice(0,100);
  const observed = {largestContentfulPaintMs:null, cumulativeLayoutShift:null};
  const observers = [];
  const shifts = [];
  for (const type of ['largest-contentful-paint','layout-shift']) {
    try {
      if (!PerformanceObserver.supportedEntryTypes.includes(type)) continue;
      if (type === 'layout-shift') observed.cumulativeLayoutShift = 0;
      const observer = new PerformanceObserver(list => {
        for (const entry of list.getEntries()) {
          if (type === 'largest-contentful-paint') observed.largestContentfulPaintMs = entry.startTime;
          else if (!entry.hadRecentInput) shifts.push({time:entry.startTime,value:entry.value});
        }
      });
      observer.observe({type,buffered:true}); observers.push(observer);
    } catch { if (type === 'layout-shift') observed.cumulativeLayoutShift = null; }
  }
  await new Promise(resolve => setTimeout(resolve,80));
  observers.forEach(observer => observer.disconnect());
  let windowStart = -Infinity, lastShift = -Infinity, score = 0;
  for (const shift of shifts.sort((a,b) => a.time-b.time)) {
    if (shift.time-lastShift >= 1000 || shift.time-windowStart >= 5000) { windowStart=shift.time; score=0; }
    score += shift.value; lastShift=shift.time;
    observed.cumulativeLayoutShift = Math.max(observed.cumulativeLayoutShift || 0,score);
  }
  const nav = performance.getEntriesByType('navigation')[0];
  const paints = performance.getEntriesByType('paint');
  const resources = performance.getEntriesByType('resource');
  const timing = nav ? {
    timeToFirstByteMs:nav.responseStart > 0 ? nav.responseStart-nav.startTime : null,
    dnsMs:nav.domainLookupEnd-nav.domainLookupStart, connectMs:nav.connectEnd-nav.connectStart,
    downloadMs:nav.responseEnd-nav.responseStart,
    domContentLoadedMs:nav.domContentLoadedEventEnd || null, loadMs:nav.loadEventEnd || null,
    transferBytes:nav.transferSize, encodedBodyBytes:nav.encodedBodySize, decodedBodyBytes:nav.decodedBodySize,
  } : null;
  return {url:safeURL(location.href), title:clip(document.title,300), tags, banners,
    globals:{gtag:typeof window.gtag === 'function',dataLayer:Array.isArray(window.dataLayer),fbq:typeof window.fbq === 'function'},
    seo:{title:clip(document.title),titleCount:document.querySelectorAll('title').length,
      description:clip(document.querySelector('meta[name="description" i]')?.content),descriptionCount:document.querySelectorAll('meta[name="description" i]').length,
      canonical:clip(document.querySelector('link[rel~="canonical" i]')?.href),canonicalCount:document.querySelectorAll('link[rel~="canonical" i]').length,
      robots:Array.from(document.querySelectorAll('meta[name="robots" i],meta[name="googlebot" i]'),n => clip(n.content,500)).slice(0,20),
      viewport:clip(document.querySelector('meta[name="viewport" i]')?.content,500),
      h1:Array.from(document.querySelectorAll('h1'),n => clip(n.textContent,300)).slice(0,100),
      headings:Array.from(document.querySelectorAll('h1,h2,h3,h4,h5,h6'),n => ({level:Number(n.tagName.slice(1)),text:clip(n.textContent,300)})).slice(0,100),
      lang:clip(document.documentElement.lang,100),links:document.links.length,linkSummary,
      images:{total:images.length,missingAlt:images.filter(n => !n.hasAttribute('alt')).length,emptyAlt:images.filter(n => n.getAttribute('alt') === '').length,
        missingDimensions:images.filter(n => !n.getAttribute('width') || !n.getAttribute('height')).length},
      hreflang:Array.from(document.querySelectorAll('link[rel~="alternate" i][hreflang]'),n => ({language:clip(n.hreflang,100),url:safeURL(n.href)})).slice(0,100),structuredData},
    performance:{navigation:timing, firstContentfulPaintMs:paints.find(n => n.name === 'first-contentful-paint')?.startTime ?? null,
      ...observed,resourceCount:resources.length,visibleResourceTransferBytes:resources.reduce((sum,n) => sum+n.transferSize,0),
      resourceTypes:resources.reduce((types,n) => { const key=n.initiatorType || 'other'; types[key]=(types[key] || 0)+1;return types; },{}),
      note:'Observed in the current Chrome navigation, not a Lighthouse score or CrUX field data. LCP/CLS reflect buffered entries available at inspection time; cross-origin transfer sizes may be hidden.'}};
}

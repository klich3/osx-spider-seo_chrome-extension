// Shared parsers: never equate a script/config call with a sent analytics hit.
export function classify(raw) {
  let u;
  try { u = new URL(raw); } catch { return null; }
  const host = u.hostname.toLowerCase();
  const is = domain => host === domain || host.endsWith(`.${domain}`);
  if ((is('google-analytics.com') || is('analytics.google.com')) && /\/(?:g\/)?collect\/?$/.test(u.pathname))
    return {provider: u.pathname.includes('/g/') ? 'GA4' : 'Universal Analytics', kind: 'event'};
  if (is('googletagmanager.com') && /\/(gtm|gtag\/js)/.test(u.pathname))
    return {provider: u.pathname === '/gtm.js' ? 'GTM' : 'Google tag', kind: 'script'};
  if (is('facebook.com') && /^\/tr\/?$/.test(u.pathname)) return {provider: 'Meta Pixel', kind: 'event'};
  if (is('facebook.net') && /fbevents\.js$/.test(u.pathname)) return {provider: 'Meta Pixel', kind: 'script'};
  if (is('doubleclick.net') && /activity|conversion/.test(u.pathname)) return {provider: 'Google Ads', kind: 'event'};
  if (is('googleadservices.com') && /conversion/.test(u.pathname)) return {provider: 'Google Ads', kind: 'event'};
  return null;
}

export function parseRequest(details) {
  const tag = classify(details.url);
  if (!tag) return [];
  const url = new URL(details.url);
  const base = new URLSearchParams(url.search);
  const body = details.requestBody;
  let lines = [''];
  if (body?.formData) {
    const params = new URLSearchParams();
    for (const [key, values] of Object.entries(body.formData)) for (const value of values) params.append(key, value);
    lines = [params.toString()];
  } else if (body?.raw) {
    const decoder = new TextDecoder();
    let text = '';
    for (const part of body.raw) if (part.bytes) text += decoder.decode(part.bytes, {stream: true});
    text += decoder.decode();
    lines = text.slice(0, 131072).split(/\r?\n/).filter(Boolean).slice(0, 100);
  }
  return (lines.length ? lines : ['']).map(line => {
    const params = new URLSearchParams(base);
    for (const [key, value] of new URLSearchParams(line)) params.set(key, value);
    // Keep only diagnostic fields, not client IDs, URLs, cookies or arbitrary event/user properties.
    const fields = {};
    for (const key of ['tid', 'id', 'en', 'ev', 'gcs', 'gcd', 'npa', 'dma', 'v']) {
      if (params.has(key)) fields[key] = params.get(key).slice(0, 256);
    }
    return {...tag, requestId: details.requestId, time: details.timeStamp,
      endpoint: url.origin + url.pathname, method: details.method,
      id: fields.tid || fields.id || '', name: fields.en || fields.ev || (tag.kind === 'script' ? 'Script loaded' : 'collect'), fields};
  });
}

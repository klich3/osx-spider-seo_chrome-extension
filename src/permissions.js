export const providerOrigins = ['https://*.google-analytics.com/*','https://*.analytics.google.com/*',
  'https://*.googletagmanager.com/*','https://*.googleadservices.com/*','https://*.doubleclick.net/*',
  'https://*.facebook.com/*','https://*.facebook.net/*'];
export function siteOrigin(raw) {
  const url = new URL(raw);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('Choose an HTTP(S) URL without credentials.');
  return `${url.origin}/*`;
}

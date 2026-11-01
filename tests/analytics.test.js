import {test} from 'node:test';
import assert from 'node:assert/strict';
import {classify, parseRequest} from '../src/analytics.js';
const req = (url, requestBody) => ({url, requestId: '42', timeStamp: 100, method: 'POST', requestBody});

test('recognizes providers without accepting lookalike hosts', () => {
  assert.equal(classify('https://region1.google-analytics.com/g/collect').provider, 'GA4');
  assert.equal(classify('https://www.googletagmanager.com/gtm.js?id=GTM-123').kind, 'script');
  assert.equal(classify('https://www.facebook.com/tr/?ev=PageView').provider, 'Meta Pixel');
  assert.equal(classify('https://google-analytics.com.evil.test/g/collect'), null);
  assert.equal(classify('invalid'), null);
});
test('parses GA4 batch body and query defaults without retaining personal identifiers', () => {
  const bytes = new TextEncoder().encode('en=page_view&ep.email=private%40example.com\nen=purchase&gcs=G111').buffer;
  const events = parseRequest(req('https://www.google-analytics.com/g/collect?v=2&tid=G-TEST&cid=secret&dl=https%3A%2F%2Fexample.com%2Fprivate', {raw: [{bytes}]}));
  assert.equal(events.length, 2);
  assert.equal(events[0].id, 'G-TEST');
  assert.equal(events[1].name, 'purchase');
  assert.equal(events[1].fields.gcs, 'G111');
  assert.ok(!JSON.stringify(events).includes('secret'));
  assert.ok(!JSON.stringify(events).includes('private'));
});
test('parses Meta form data and GET requests', () => {
  assert.equal(parseRequest(req('https://www.facebook.com/tr/', {formData: {id: ['123'], ev: ['Purchase']}}))[0].name, 'Purchase');
  assert.equal(parseRequest(req('https://www.google-analytics.com/g/collect?en=page_view'))[0].name, 'page_view');
  assert.deepEqual(parseRequest(req('https://example.com/unrelated')), []);
});

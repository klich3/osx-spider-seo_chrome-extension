import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {observePage} from '../src/page.js';

test('observes consent history/live pushes, preserves push result, restores on stop/restart', () => {
  const messages = [], handlers = {};
  const layer = [];
  layer.push(['consent', 'default', {analytics_storage: 'denied', email: 'secret'}]);
  const original = layer.push;
  const window = {dataLayer: layer, postMessage: m => messages.push(m), addEventListener: (name, fn) => handlers[name] = fn};
  const context = vm.createContext({window, location: {origin: 'https://example.com'}, document: {scripts: []}, setInterval: () => 1, clearInterval: () => {}});
  vm.runInContext(`(${observePage.toString()})()`, context);
  assert.equal(messages[0].historical, true);
  assert.equal(messages[0].fields.analytics_storage, 'denied');
  assert.equal(messages[0].fields.email, undefined);
  assert.equal(layer.push(['consent', 'update', {analytics_storage: 'granted'}]), 2);
  assert.equal(messages[1].historical, false);
  handlers['spider-seo-stop']();
  assert.equal(layer.push, original);
  layer.push({event: 'ignored-after-stop'});
  assert.equal(messages.length, 2);
  vm.runInContext(`(${observePage.toString()})()`, context);
  assert.ok(messages.some(m => m.name === 'ignored-after-stop' && m.historical));
});

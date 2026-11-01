// Load the actual shipping manifest, with no optional grants.
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
const extension=fileURLToPath(new URL('../',import.meta.url));
const context=await chromium.launchPersistentContext('',{channel:'chromium',headless:true,args:['--disable-gpu',`--disable-extensions-except=${extension}`,`--load-extension=${extension}`]});
try {
 const worker=context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
 const permissions=await worker.evaluate(()=>chrome.permissions.getAll());
 assert.ok(!permissions.permissions.includes('debugger'));
 assert.deepEqual(permissions.origins || [],[]);
 const stored=await worker.evaluate(()=>chrome.storage.session.get(null));
 assert.ok(!Object.keys(stored).some(key=>key.startsWith('tab:')));
 const about=await context.newPage();await about.goto(`chrome-extension://${new URL(worker.url()).host}/about.html`);
 assert.equal(await about.locator('#version').textContent(),'0.3.0');
 assert.equal(await worker.evaluate(()=>chrome.action.getBadgeText({})), '');
 console.log('PASS: actual production MV3 manifest loads; no host/debugger grants, captures or recording badge before opt-in; About works.');
} finally {await context.close();}

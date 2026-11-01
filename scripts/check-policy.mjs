// Static release checks support a manual policy review; they are not Google approval.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {parse} from 'acorn';
import {fileURLToPath} from 'node:url';
const root = fileURLToPath(new URL('../',import.meta.url));
const manifest = JSON.parse(fs.readFileSync(path.join(root,'manifest.json')));
assert.equal(manifest.manifest_version,3);
assert.ok(!manifest.host_permissions?.length,'Site access must stay optional');
assert.ok(!manifest.permissions.includes('debugger'),'Debugger must stay optional');
assert.ok(manifest.optional_permissions.includes('debugger'));
for (const forbidden of ['history','cookies','webRequestBlocking','nativeMessaging','management','unlimitedStorage']) assert.ok(!manifest.permissions.includes(forbidden),forbidden);
assert.deepEqual(manifest.content_security_policy,{extension_pages:"script-src 'self'; object-src 'none'"});
assert.equal(manifest.options_page,'about.html');
assert.equal(manifest.homepage_url,'https://spider-seo.app');
for (const n of [16,32,48,128]) {
 const buffer=fs.readFileSync(path.join(root,manifest.icons[n]));
 assert.equal(buffer.readUInt32BE(16),n);assert.equal(buffer.readUInt32BE(20),n);
}
for (const html of ['panel.html','about.html','privacy.html','devtools.html']) {
 const source=fs.readFileSync(path.join(root,html),'utf8');
 assert.ok(!/<script[^>]+src=["']https?:/i.test(source),'Remote executable script');
 assert.ok(!/\son(?:click|load|error)=/i.test(source),'Inline event handlers');
}
for (const name of fs.readdirSync(path.join(root,'src')).filter(x => x.endsWith('.js'))) {
 const source=fs.readFileSync(path.join(root,'src',name),'utf8');
 const walk = node => {
  if (!node || typeof node !== 'object') return;
  if (['CallExpression','NewExpression'].includes(node.type)) {
   const callee=node.callee;
   assert.ok(!(callee.type==='Identifier' && ['eval','Function'].includes(callee.name)),`Dynamic executable string in ${name}`);
   if(callee.type==='MemberExpression' && (callee.property.name==='eval' || callee.property.value==='eval')) {
    // A fixed, bundled URL lookup in the inspected DevTools page is the only
    // permitted eval API call. It never accepts downloaded/user-supplied logic.
    assert.ok(source.slice(callee.start,callee.end)==='chrome.devtools.inspectedWindow.eval' && node.arguments[0]?.type==='Literal' && node.arguments[0].value==='location.href',`Unreviewed eval API in ${name}`);
   }
  }
  for(const [key,value] of Object.entries(node)) if(key!=='parent' && typeof value==='object') {
   if(Array.isArray(value)) value.forEach(walk); else walk(value);
  }
 };
 walk(parse(source,{ecmaVersion:'latest',sourceType:'module'}));
}
for (const file of ['vendor/lighthouse.js','vendor/LIGHTHOUSE-LICENSE','vendor/THIRD-PARTY-NOTICES.txt','STORE-REVIEW.md']) assert.ok(fs.statSync(path.join(root,file)).size>0,file);
const privacy=fs.readFileSync(path.join(root,'privacy.html'),'utf8');
assert.ok(privacy.includes('Limited Use'));
assert.ok(privacy.includes('127.0.0.1:47836'));
assert.ok(privacy.includes('MCP client'));
console.log('PASS: MV3, optional site/debugger permissions, CSP, icons, local scripts, About/privacy and notices. Manual store/account/policy review still required.');

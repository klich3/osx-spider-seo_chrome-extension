import {test} from 'node:test';
import assert from 'node:assert/strict';
import {auditPage} from '../src/audit.js';

test('finds actionable rendered metadata, accessibility and JSON-LD problems', () => {
 const audit=auditPage({seo:{title:'',titleCount:2,description:'',canonicalCount:2,h1:[],lang:'',images:{missingAlt:3,missingDimensions:2},structuredData:{errors:1},robots:['max-snippet:-1, noindex']}});
 const ids=audit.issues.map(i=>i.id);
 for(const id of ['title-missing','title-multiple','description-missing','canonical-multiple','h1-missing','lang-missing','viewport-missing','images-missing-alt','jsonld-invalid','noindex'])assert.ok(ids.includes(id),id);
 assert.equal(audit.counts.error,4);
 assert.ok(audit.issues.find(i=>i.id==='images-missing-alt').message.includes('3'));
});
test('does not treat ordinary robots words or decorative alt as an indexability failure', () => {
 const audit=auditPage({seo:{title:'A useful page',description:'A clear summary.',canonical:'https://example.com/',h1:['Page'],lang:'en',viewport:'width=device-width',images:{missingAlt:0,emptyAlt:4},robots:['index, follow, max-image-preview:large']}});
 assert.deepEqual(audit.issues,[]);
 assert.ok(audit.note.includes('no ranking or indexability verdict'));
});
test('length and multiple-H1 guidance stays informational', () => {
 const audit=auditPage({seo:{title:'x'.repeat(61),description:'x'.repeat(156),canonical:'https://example.com/',h1:['One','Two'],lang:'en',viewport:'width=device-width'}});
 assert.deepEqual(audit.issues.map(i=>i.severity),['notice','notice','notice']);
});

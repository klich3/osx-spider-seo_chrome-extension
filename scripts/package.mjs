import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
execFileSync(process.execPath,[path.join(root,'scripts/check-policy.mjs')],{stdio:'inherit'});
const stage=fs.mkdtempSync(path.join(os.tmpdir(),'spider-extension-package-'));
try {
 for (const name of ['manifest.json','panel.html','panel.css','devtools.html','about.html','privacy.html','icons','src']) fs.cpSync(path.join(root,name),path.join(stage,name),{recursive:true});
 const version=JSON.parse(fs.readFileSync(path.join(root,'manifest.json'))).version;
 fs.mkdirSync(path.join(root,'dist'),{recursive:true});
 const target=path.join(root,'dist',`spider-seo-chrome-${version}.zip`);
 fs.rmSync(target,{force:true});
 execFileSync('/usr/bin/zip',['-qr',target,'.'],{cwd:stage});
 console.log(target);
} finally { fs.rmSync(stage,{recursive:true,force:true}); }

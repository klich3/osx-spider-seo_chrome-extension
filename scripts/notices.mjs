import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root = fileURLToPath(new URL('../',import.meta.url));
const info = JSON.parse(fs.readFileSync(path.join(root,'vendor/build-info.json')));
const directories = new Set();
for (const input of info.inputs) {
  const match = input.match(/(?:^|\/)node_modules\/((?:@[^/]+\/)?[^/]+)/);
  if (match) directories.add(path.join(root,'node_modules',match[1]));
}
let output = 'Spider SEO Chrome companion — third-party notices\nBundled locally; no runtime downloads.\n\n';
for (const dir of [...directories].sort()) {
  const pkg = JSON.parse(fs.readFileSync(path.join(dir,'package.json')));
  output += `\n${'='.repeat(70)}\n${pkg.name} ${pkg.version} · ${typeof pkg.license==='string' ? pkg.license : JSON.stringify(pkg.license)}\n`;
  for (const file of fs.readdirSync(dir).filter(name => /^(licen[cs]e|notice|copying)(\.|$)/i.test(name))) {
    if (fs.statSync(path.join(dir,file)).isFile()) output += `\n${file}\n${fs.readFileSync(path.join(dir,file),'utf8')}\n`;
  }
}
fs.writeFileSync(path.join(root,'vendor/THIRD-PARTY-NOTICES.txt'),output);
console.log('Third-party notices:',directories.size,'packages');

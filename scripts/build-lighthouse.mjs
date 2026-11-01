// Browser bundling follows GoogleChrome/lighthouse v13.6.0's build/build-bundle.js.
// Vendored build-time helpers retain Apache-2.0 notices; no code is fetched at runtime.
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import esbuild from 'esbuild';
import {Runner} from 'lighthouse/core/runner.js';
import {LH_ROOT} from 'lighthouse/shared/root.js';
import * as plugins from './vendor/lighthouse/esbuild-plugins.js';
const require = createRequire(import.meta.url);
const root = fileURLToPath(new URL('../', import.meta.url));
const dynamic = [...Runner.getGathererList().map(x => `../gather/gatherers/${x}`), ...Runner.getAuditList().map(x => `../audits/${x}`)];
const modules = dynamic.map(x => `[${JSON.stringify(x.replace('.js',''))}, import(${JSON.stringify(x)})]`).join(',\n');
const shims = {...plugins.nodeModuleShims, ...Object.fromEntries(Object.entries(plugins.nodeModuleShims).map(([k,v]) => [`node:${k}`,v])),
  '@puppeteer/browsers': 'export const ChromeReleaseChannel = {}; export default {};',
  'ws': 'export default {};',
  'puppeteer-core/lib/puppeteer/node/ScreenRecorder.js': 'export const ScreenRecorder = null;',
  // LH only uses this default connect when it creates its own Node browser; we supply a Page.
  'puppeteer-core': 'export default {};',
  '@sentry/node': 'export default {};',
  'source-map': 'export default {};',
  [`${LH_ROOT}/report/generator/report-assets.js`]: 'export const reportAssets = {};',
  [`${LH_ROOT}/shared/localization/locales.js`]: 'export const locales = {};'
};
const result = await esbuild.build({
  absWorkingDir: root, entryPoints: ['src/lighthouse-entry.js'], outfile: 'vendor/lighthouse.js',
  bundle: true, write: true, format: 'esm', platform: 'browser', target: 'chrome125', minify: false,
  keepNames: true, define: {global: 'globalThis'}, inject: ['scripts/process-global.js'],
  banner: {js: `// Lighthouse ${require('lighthouse/package.json').version} · Copyright Google LLC · Apache-2.0. See LIGHTHOUSE-LICENSE.\nglobalThis.isDevtools = true;`},
  alias: {'debug': require.resolve('debug/src/browser.js')},
  plugins: [plugins.replaceModules(shims, {disableUnusedError: true}), plugins.bulkLoader([
    plugins.partialLoaders.inlineFs({verbose:false}), plugins.partialLoaders.rmGetModuleDirectory,
    plugins.partialLoaders.replaceText({
      // Chrome's restricted debugger has no Animation domain. Animation names are
      // optional decoration; trace node/CLS/LCP collection remains real. Never
      // swallow other protocol errors or fabricate animation/coverage records.
      "await context.driver.defaultSession.sendCommand('Animation.enable');": "await context.driver.defaultSession.sendCommand('Animation.enable').catch(error => { if (!error.message.includes(\"wasn't found\")) throw error; });",
      "await context.driver.defaultSession.sendCommand('Animation.disable');": "await context.driver.defaultSession.sendCommand('Animation.disable').catch(error => { if (!error.message.includes(\"wasn't found\")) throw error; });",
      '/* BUILD_REPLACE_BUNDLED_MODULES */': `[${modules}]`,
      'global.isLightrider': 'globalThis.isLightrider', 'global.isDevtools': 'globalThis.isDevtools',
      'import.meta.url': id => JSON.stringify(path.relative(LH_ROOT,id)),
      'import.meta.filename': id => JSON.stringify(path.relative(LH_ROOT,id)),
      'import.meta': id => `{url:${JSON.stringify(path.relative(LH_ROOT,id))}}`
    })
  ])], metafile: true
});
fs.writeFileSync(path.join(root,'vendor/build-info.json'), JSON.stringify({lighthouse:require('lighthouse/package.json').version, inputs:Object.keys(result.metafile.inputs).sort()},null,2)+'\n');
console.log('Bundled local Lighthouse:', fs.statSync(path.join(root,'vendor/lighthouse.js')).size, 'bytes');

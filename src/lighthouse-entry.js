import log from 'lighthouse-logger';
import {navigation} from 'lighthouse/core/index.js';
import desktopConfig from 'lighthouse/core/config/desktop-config.js';
import {connect, ExtensionTransport} from 'puppeteer-core/lib/puppeteer/puppeteer-core-browser.js';

export async function runLighthouse(tabId, url, strategy = 'mobile') {
  let browser;
  const progress = message => { void chrome.storage.session.set({lighthouseProgress:String(message)}); };
  const onStatus = status => progress(status[1] || status[0]);
  log.events.on('status',onStatus);
  try {
    progress('Attaching Chrome debugger');
    const transport = await ExtensionTransport.connectTab(tabId);
    progress('Connecting browser protocol');
    browser = await Promise.race([connect({transport, defaultViewport:null, protocolTimeout:15000}),new Promise((_,reject) => setTimeout(() => reject(new Error('Chrome debugger connection timed out')),20000))]);
    progress('Reading Chrome page');
    const [page] = await browser.pages();
    // ExtensionTransport exposes one synthetic page session; creating another session
    // by that synthetic target ID cannot work. Reuse the attached session for LH's
    // driver, and leave its lifetime to the transport/finally below (pinned Puppeteer).
    const session = page._client();
    session.detach = async () => {};
    page.target().createCDPSession = async () => session;
    progress('Running Lighthouse navigation');
    const {lhr} = await navigation(page, url, {config: {
      extends: 'lighthouse:default',
      settings: {onlyCategories: ['performance', 'accessibility', 'best-practices', 'seo'],
        skipAudits: ['unused-javascript','script-treemap-data','non-composited-animations','bf-cache'],
        formFactor: strategy, disableStorageReset: true, disableFullPageScreenshot: true,
        maxWaitForLoad: 45000, maxWaitForFcp: 30000, locale: 'en-US',
        ...(strategy === 'desktop' ? desktopConfig.settings : {})}
    }, flags: {logLevel: 'error'}});
    // The LHR itself is the portable result consumed by the GUI/MCP's existing parser.
    lhr.runWarnings.push('Chrome extension debugger restricts Profiler and Animation. JavaScript coverage, animation names and back/forward cache audits are not available in this source.');
    if (lhr.categories.performance?.score == null) lhr.runWarnings.push('Performance score is unavailable: Chrome did not provide a complete trace/filmstrip. No score has been estimated or substituted. See failed audit messages; PageSpeed Insights is an alternative source in the app.');
    progress('Lighthouse complete');
    return lhr;
  } finally {
    log.events.off('status',onStatus);
    // Best effort reset even if Lighthouse throws during gather/cleanup.
    for (const method of ['Emulation.clearDeviceMetricsOverride', 'Emulation.setCPUThrottlingRate']) {
      await chrome.debugger.sendCommand({tabId}, method, method.endsWith('setCPUThrottlingRate') ? {rate: 1} : {}).catch(() => {});
    }
    await chrome.debugger.sendCommand({tabId},'Network.emulateNetworkConditions',{offline:false,latency:0,downloadThroughput:-1,uploadThroughput:-1}).catch(() => {});
    await chrome.debugger.sendCommand({tabId},'Network.setUserAgentOverride',{userAgent:''}).catch(() => {});
    await chrome.debugger.sendCommand({tabId},'Network.setCacheDisabled',{cacheDisabled:false}).catch(() => {});
    await chrome.debugger.sendCommand({tabId},'Emulation.setTouchEmulationEnabled',{enabled:false}).catch(() => {});
    await browser?.disconnect();
    await chrome.debugger.detach({tabId}).catch(() => {});
  }
}

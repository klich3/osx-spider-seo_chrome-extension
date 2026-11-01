# Spider SEO — Chrome companion 0.3.0

Standalone page SEO/analytics/consent inspection and bundled local Lighthouse, with
optional authenticated connection to the **Spider SEO macOS app and MCP**.
Website: [spider-seo.app](https://spider-seo.app).

Status: implemented and tested locally; **not published** in the Chrome Web Store.
Lighthouse's restricted Chrome debugger source has limitations described below.

## Added in 0.3.0

- **Inspect page without recording analytics**: requests only the selected site's
  optional access. Starting analytics capture separately requests provider access.
- **Rendered page audit**: title/description/canonical counts, robots, viewport,
  language, heading outline, image alt/dimension counts, link summary, hreflang and
  JSON-LD types/parse errors. Findings are heuristics, not ranking guarantees.
- **Observed browser timing**: Navigation Timing (TTFB/DNS/connect/download/DOM/load),
  FCP, buffered LCP/CLS and aggregate resource counts/visible transferred bytes.
  These are the current page's observations, not Lighthouse scores or CrUX field data;
  buffers/cross-origin restrictions can make them incomplete.
- **Send page report to app/MCP**: explicit local transfer of the rendered audit,
  browser timing and any existing capture; read it through the app Chrome panel or
  MCP `action=latest`. The Lighthouse send operation remains separate.
- Optional permission requests run directly in the user's click gesture. Pairing
  codes are validated before requesting loopback access; errors remain visible
  across background polling. DevTools resolves its inspected URL with a fixed,
  bundled `location.href` lookup before requesting that site's permission.

## Install locally

1. Open `chrome://extensions` → Developer mode → **Load unpacked** → this directory.
   The committed local Lighthouse bundle is included; no runtime/build download is needed.
2. Open an HTTP(S) page and click Spider SEO (or DevTools → Spider SEO).
3. Read the disclosure, choose **Inspect / refresh page** for a rendered audit, or
   **Start capture** for analytics, and allow the
   optional site/provider permissions. Reload to observe startup network traffic.
4. Mark Before consent / Accepted / Rejected and use the site's own banner. The
   extension never accepts/rejects consent, blocks requests, or reads cookie values.
5. Stop/Clear/Delete session results and JSON export are available. About has the
   original Spider SEO logo, version, website, permissions, privacy and license links.

## Connect the app and MCP

The first app/MCP process to start the bridge listens **only on 127.0.0.1:47836**;
other native processes use its authenticated API. In an App Store build, app and
helper have `network.server` and share controller credentials through the App Group.
Development/tests use `SPIDERSEO_APP_SUPPORT` to isolate bridge state.

1. In the app: **Chrome → Pair extension…**. Or request this MCP tool:
   `spider_chrome_extension` with `{"action":"pair"}`.
2. In the extension → Connection: enter the 8-digit code and click **Pair local
   app/MCP**, allowing optional loopback access. Code is single-use, expires after
   5 minutes, and is rate limited. Pairing explicitly authorizes fixed page-test
   operations and local result transfer; there is no eval/script/remote-code command.
3. On each target site, **Allow this site** before an app/MCP snapshot/capture.
   Lighthouse requires the separate **Allow Lighthouse debugging** action.
4. Use the app's Chrome panel to open a URL, read its rendered page or capture
   analytics for 10 seconds. In **Page Tests → Lighthouse**, select **Chrome extension**.
   Results use the existing Lighthouse parser, show their source and support CSV/JSON.
5. The extension can run Lighthouse itself and choose **Send report to app/MCP**.
   App: Chrome → Receive latest report, or Page Tests → Lighthouse → Receive report.
   MCP: `spider_chrome_extension` with `{"action":"latest"}`.
6. Disconnect from either side revokes pairing. Browser/profile credentials are not
   synced. No data goes to Spider SEO servers. An MCP client may send results to its
   own configured AI provider; the extension discloses this before pairing.

Native status reports `available`, `paired`, `state`, `last_seen`, `version` and
`using_extension`. `installed=true` is reported only with an active heartbeat;
otherwise `installed=null`: Chrome closed/disabled/uninstalled cannot be distinguished
from silence. Native jobs have `using_extension=true`, a client and a bounded lifetime.
App toolbar: green connected, orange in use. Extension: REC/TEST badge and Chrome's
standard debugger indicator during Lighthouse.

### MCP examples

`spider_chrome_extension`:

```json
{"action":"status"}
{"action":"open","url":"https://example.com/"}
{"action":"snapshot","url":"https://example.com/"}
{"action":"capture","url":"https://example.com/"}
{"action":"lighthouse","url":"https://example.com/","strategy":"desktop"}
{"action":"result","job_id":"ID returned by the page-test operation"}
{"action":"latest"}
{"action":"disconnect"}
```

Page operations return immediately with a job ID; poll `result` until completed or
failed. The existing `spider_lighthouse_audit` tool also accepts `source="extension"`
and waits for the report before returning its usual score/audit summary. Local/private
URLs require the MCP's explicit `allow_private_hosts=true` flag. Chrome must be running
with the paired extension. Snapshots/captures require that site's optional permission;
an unauthorized site opens but returns an actionable permission error.

## What is captured

- Google tag/GTM scripts/runtime, Meta Pixel script/global detection.
- Real GA4, legacy UA, Google Ads and Meta requests: query/form/POST/batched GA4,
  measurement/pixel ID, event name, consent diagnostics, status and errors.
- dataLayer history and live pushes, default/custom Google-loader layer names,
  consent default/update, plus explicit user scenario markers.
- Known OneTrust/Cookiebot/Didomi/CookieYes/Quantcast banner selectors.
- Rendered SEO metadata, outline, image/link counts, hreflang and JSON-LD type/parse diagnostics.
- Heuristic findings and observed Navigation/Resource/Paint/LCP/CLS timings for the current selected page.
- A portable Lighthouse JSON report from the bundled Google Lighthouse engine.

Script presence ≠ configuration ≠ a network hit. HTTP success does not prove provider
acceptance. A denied consent setting may allow cookieless pings. Scenario markers are
user annotations. Historical dataLayer timestamps are unknown. Absence of a known
selector/event is not proof that a banner/tag is absent. Iframes and custom/proxied
analytics endpoints are not yet covered. There is no full DOM/WebKit comparison yet.

## Lighthouse limitations — do not hide partial results

Local Lighthouse **13.5.0** runs through Puppeteer's Chrome ExtensionTransport and
`chrome.debugger`, without Node or an external audit service at runtime. It reloads
and emulates the selected tab but preserves existing site storage. Close that page's
DevTools first. Permissions and Chrome enterprise policies may prevent attaching.

Chrome's restricted API excludes Profiler/Animation: JavaScript coverage, animation
names and back/forward-cache audits are not available in this source. Those audits
are omitted with an explicit report warning; no coverage/animation data is fabricated.
The adapter reuses ExtensionTransport's existing page session for Lighthouse's driver.
CPU/network/device emulation is reset and this extension detaches in `finally`.

**Observed on Chrome 156:** Accessibility, Best Practices and SEO scores are returned.
Performance may be `null` because the trace/filmstrip is incomplete (`NO_SCREENSHOTS`
or `NO_TRACING_STARTED`). The extension, app and MCP retain the raw errors/warnings;
no estimated score replaces the missing one. Complete Performance remains an open
validation item. The app's PageSpeed Insights source remains available separately.

## Privacy, permissions and publication

Site access is optional and requested per site plus known analytics provider origins.
Debugger access is optional and used only by an explicitly requested Lighthouse test.
No mandatory broad hosts, history/cookies/management access, ads, developer telemetry,
arbitrary remote scripts or automatic exports. Captures/LHR use in-memory session
storage; pairing credentials use local trusted-context storage. Native tokens have
user-only filesystem permissions, origin-bound extension credentials and a separate
controller secret. Web origins cannot call controller APIs. Broker results are bounded
in memory with approximately 15-minute expiry. Exports remain until deleted.

Read [privacy.html](privacy.html) and [STORE-REVIEW.md](STORE-REVIEW.md) for precise
handling, Dashboard justifications and the complete publication checklist. The site's
privacy section is staged in the parent website repo; it must be deployed before
submission. Google approval, account requirements, public privacy URL and final store
assets still require the normal submission process. Static checks are not approval.

## Build, tests and ZIP

```sh
npm ci
npm run build            # reproducible bundled Lighthouse + third-party notices
npm test                 # 7 parser, audit and page-observer tests
npm run check            # static policy/package checks
npx playwright install chromium
npm run test:permissions # actual production manifest; no optional grants or captures
npm run test:browser     # isolated Chromium UI/capture/consent/About smoke
npm run test:lighthouse  # real LHR, explicit availability errors, debugger cleanup
npm run package          # dist/spider-seo-chrome-0.3.0.zip
```

Browser tests simulate optional permissions already granted in an isolated test copy
of the manifest; the production manifest stays optional. Manual optional-grant and
revocation checks in stable Chrome are still required before store submission.

For a real native integration smoke test, first build the parent app with Xcode:

```sh
SPIDER_APP_EXECUTABLE='/path/Spider SEO.app/Contents/MacOS/Spider SEO' \
SPIDER_MCP_EXECUTABLE='/path/spider-mcp' \
SPIDER_TEST_LIGHTHOUSE=1 npm run test:native
```

This launches the actual app plus stdio MCP with isolated app support **and crawl
store**, then Chromium; verifies pairing, status, open, snapshot, GA4 capture, manual page/audit/timing delivery, native
app requests, optional Lighthouse/report upload and token revocation. It refuses to
use an already occupied bridge port. Fixture analytics requests are intercepted
without contacting Google. Test logs/artifacts go to `/tmp/spider-*`.

## References and licensing

Reviewed the parent `_ref/extension` samples: Tag Assistant 26.279.2.45 manifests,
service worker and installed-tag workflow; Analytics Debugger 3.0.1 manifest,
service worker, DevTools entry and consent-related bundles. They inform the two
workflows; no compiled reference code, icons, branding, keys or external connections
are copied. Google's Apache-2.0 Lighthouse/Puppeteer dependencies are bundled under
their own licenses; readable build sources and third-party notices are included.

API references: [webRequest](https://developer.chrome.com/docs/extensions/reference/api/webRequest),
[debugger restrictions](https://developer.chrome.com/docs/extensions/reference/api/debugger),
[Puppeteer in extensions](https://pptr.dev/guides/running-puppeteer-in-extensions).

Browser timing references: [Navigation Timing](https://www.w3.org/TR/navigation-timing-2/),
[CLS session windows](https://web.dev/articles/cls),
[Chrome optional permission gestures](https://developer.chrome.com/docs/extensions/reference/api/permissions).

### Inspector tabs

- **Overview**: Run full test (rendered page → 10-second analytics capture → Lighthouse), automatically sending the combined report to the paired local app/MCP. Or inspect/send only the page.
- **Analytics**: start/stop capture, label consent scenarios, filter events and export.
- **Lighthouse**: allow debugging, choose device, run a local audit and send/export its report.
- **Connection**: pair with the local app/MCP, grant site access, disconnect or delete session results.

Recording status remains visible across tabs. Use arrow keys, Home and End to navigate the tab bar. Switching tabs preserves captured data.

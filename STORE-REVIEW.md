# Chrome Web Store review — 0.3.0

Reviewed against the official policies on 2026-10-31. This is a submission checklist,
not a certification or guarantee that Google will approve the extension.

## Single purpose and listing draft

**Name:** Spider SEO — Tags & Analytics

**Single purpose:** Audit SEO, analytics/consent implementation and performance of
explicitly selected web pages in the user's Chrome session, with optional delivery
to the local Spider SEO app/MCP.

**Short description:** Audit selected pages in Chrome: SEO, analytics, consent and
local Lighthouse, with optional Spider SEO app/MCP pairing.

**Description:** Inspect installed Google/Meta tags and actual analytics requests,
record consent changes without accepting or rejecting cookies, audit a page's
rendered SEO metadata/outline/images/links/JSON-LD and observed navigation timing, and run bundled Lighthouse locally (Chrome restricts some audits; unavailable scores retain their errors). Start/stop controls and
recording/debugger indicators keep tests visible. Site and Lighthouse permissions
are optional. Works without an account or the macOS app. Pairing by expiring code
optionally allows your local app/MCP to open URLs you request and receive results.
Data stays on your device unless you export/share it or your configured MCP client
passes it to its AI provider. No developer telemetry, ads, sale of data, general
browsing-history collection, cookie reading, or runtime code downloads.

## Permissions justification (paste into Developer Dashboard)

| Permission | Existing feature requiring it |
| --- | --- |
| activeTab | Identify/inspect the page explicitly selected through the extension action |
| scripting | Read rendered SEO/tag/banner information and observe selected page dataLayer |
| storage | In-memory bounded session captures/LHR; local, unsynced pairing credential |
| webRequest | Observe supported analytics endpoint metadata, request diagnostics and completion/errors for recording tabs only; never block/modify |
| webNavigation | Resume page observer after top-level reload/navigation on recording tabs |
| alarms | Heartbeat and poll the paired native bridge, only when pairing is enabled |
| optional HTTP(S) hosts | Request the specific tested site plus known analytics-provider origins on an explicit Allow/Start action; Chrome's narrower activeTab grant alone cannot observe cross-origin provider requests or let a local app inspect a page it opens |
| optional debugger | Run bundled Lighthouse in the selected tab via Chrome's restricted CDP API; attach only for an explicit local/user audit; always detach/reset emulation afterwards |
| optional 127.0.0.1 host | Optional code-paired communication with native app/MCP on this computer |

No `cookies`, `history`, `management`, `tabs`, remote code, content scripts on every
site, broad mandatory host access, or unused future permissions. The native bridge
supports only fixed open/snapshot/capture/Lighthouse operations, not eval/scripts.
Google documents the native same-computer transport exception to encryption in
[user-data-faq §16](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq).
Loopback-only binding, expiring/rate-limited code, origin-bound bearer credentials,
separate native-controller secret, bounded HTTP bodies, no website CORS/controller
access and disconnect/revocation defend this local transport.

## Privacy disclosures and Limited Use

- Handles website content and web activity needed for explicitly requested audits;
  URLs/tag IDs/event names/diagnostic request metadata and report content can be sensitive.
- Pairing credential is authentication information, stored locally; no account sync.
- No sale/advertising/credit/profiling uses or developer access to audit data.
- No general history, passwords, cookies, financial, health or personal-communication
  collection is sought. Arbitrary website content may contain those incidentally;
  do not claim that page content is guaranteed free of personal information.
- Captures/LHR stay in browser session memory; pairing token persists until disconnect
  or uninstall. Broker data is in native memory with approximately 15-minute retention and bounded jobs.
  Exported files remain on disk until the user deletes them.
- Local app/MCP sharing requires explicit pairing and requested tests; an MCP client may
  send results to its own provider. Disclose this in the listing and UI, not only policy.
- Standalone local processing still counts as handling data; do not tick “no data handled”
  just because we have no backend. Check Dashboard definitions for the exact data-type
  checkboxes and certify Limited Use accurately against the final artifact.
- Prominent in-product disclosure is in the inspector before Start/Pair/Lighthouse.
  About links privacy, website and permissions. Native app/MCP status never treats a
  missing heartbeat as proof that the extension is uninstalled.

## Code readability, security and intellectual property

Lighthouse 13.5.0 and Puppeteer are built into a readable, unminified local bundle.
No CDN/imported executable code, obfuscation, `unsafe-eval` or arbitrary remote
interpreter. Lighthouse executes its bundled page probes through the documented
Debugger API. Build sources, versions, lockfile and third-party licenses/notices are
retained in this repository. The reference Tag Assistant/Analytics Debugger packages
are not included or copied into the shipping artifact. Their store keys, icons and
trademarks are not reused. Logo uses the user's original Spider SEO asset. Listing
must not imply Google endorsement or official affiliation.

## Functionality, content, conduct and monetization

The extension has substantial standalone inspection functionality, not merely an
app launcher. No injected ads, search/homepage replacement, deceptive installation,
spam, affiliate redirection, review/install manipulation, unsolicited messages,
malware, illegal/abusive content or account impersonation. Standalone features are
free; optional macOS app plans are separate and the listing must state that clearly.
No payment processing or user-generated content service is provided by the extension.

## Reviewer test steps

1. Load the ZIP, open any regular HTTP(S) page. No collection/network bridge polling
   occurs before Start or Pair. Open About: logo/version/website/privacy are present.
2. Choose Start/Allow this site and accept the optional site/provider grant. Reload.
   Verify tags/timeline, label consent scenarios and interact with the site's banner.
   Stop/Clear/Delete session results. Denied optional grants must produce an explanation.
3. Allow Lighthouse debugging, close that page's DevTools and run Mobile/Desktop.
   Chrome shows debugging; the genuine Lighthouse report/export is returned. Inspect raw audit errors: Chrome restricts Profiler/Animation and Chrome 156 may return Performance=null when the trace/filmstrip is incomplete. No substitute score is shown. Observed browser timing has its own label and is never substituted for Lighthouse Performance.
   Existing page storage is not cleared. Debugger detaches on success/failure. Complete Performance validation remains open; the store listing must disclose this limitation.
4. Optional native test: in app Chrome → Pair, or MCP spider_chrome_extension action=pair.
   Enter the code in Connection, allow loopback. Native status reports connected.
   Allow the specific site's access, then request open/snapshot/capture/lighthouse from
   app/MCP. Check using_extension indicator and results. Disconnect rejects old token.
5. Website origins cannot access the broker; wrong/reused pairing codes and other
   extension origins are rejected. No traffic to Spider SEO/analytics developer servers.

## External submission tasks still required

- [ ] Deploy the staged extension section of spider-seo.app/privacy and use its public
      HTTPS URL in the Dashboard. Bundled privacy alone does not satisfy the public URL.
- [ ] Review the generated 1280×800 fixture screenshots in `docs/store-screenshots` and capture any additional store views from the final released build,
      correct 128 px store icon and optional promo artwork; no placeholder testimonials.
- [ ] Review final name/description, category, support contact and accurate pricing.
- [ ] Complete privacy practice fields, permission justifications, Limited Use and
      remote-code declarations. Explain local bundled Lighthouse/debugger probes.
- [ ] Developer account: identity/contact details, registration and 2-step verification;
      accept current Developer Agreement. Use an owned/verified website where required.
- [ ] Manual tests in current stable Chrome on real sites/CMPs, restricted-site permission
      denial, revoked debugger permission, Chrome restart, app/MCP absent, no internet.
- [ ] Inspect final ZIP, dependency/security/license audit and final policy re-check just
      before upload. Submit for Google's review; publish only after that process.

Policy sources: [Program policies](https://developer.chrome.com/docs/webstore/program-policies/policies/),
[User data FAQ](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq),
[MV3 requirements](https://developer.chrome.com/docs/webstore/program-policies/mv3-requirements),
[Permissions](https://developer.chrome.com/docs/webstore/program-policies/permissions).

# Spider SEO Chrome companion

Proprietary software. All rights reserved.

Detect supported pixels, Google Analytics, Tag Manager and consent events on selected pages. Pairing is in the first tab (Connection), using the local desktop app/MCP at 127.0.0.1:47836. The last selected tab is remembered.

Choose Inspect page for detection or Start capture in Analytics for live requests and consent diagnostics. Capture is explicit and site access is optional. Send page report shares the selected report with the paired local app/MCP.

Lighthouse is available only through the MCP tool `spider_lighthouse_audit` (source `local` or `psi`). The extension does not run Lighthouse, request debugger permission or contain the Lighthouse bundle.

Development: `npm ci`, `npm test`, `npm run check`, `npm run test:browser`, `npm run package`. Native integration: set SPIDER_APP_EXECUTABLE and optionally SPIDER_MCP_EXECUTABLE, then `npm run test:native`.

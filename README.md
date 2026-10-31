# Spider SEO — Chrome extension

Companion extension for **Spider SEO**, the macOS crawler and SEO auditor
([spider-seo.app](https://spider-seo.app)). It shows, from the user's own Chrome
session, what a crawler cannot see, and sends it to the Spider SEO app on the same Mac.

> Status: planning. Nothing here is published yet.

## What it will do

- **Real analytics events** while you browse your site: GA4, Google Tag Manager,
  Meta Pixel and other tags actually fired, with and without cookie consent.
- **Consent banners**: which tags fire before and after accepting or rejecting.
- **Chrome's rendered DOM** of a page, to compare with the WebKit render of the app.
- **Audits through Chrome** (Lighthouse-style checks via the `chrome.debugger` API),
  on the page you are looking at.

## How it talks to the app

- Manifest V3 extension.
- The Spider SEO app listens on `127.0.0.1` only (never on the network). The
  extension pairs with it once with a short code shown in the app, then sends
  results over that local connection.
- Nothing is sent to Spider SEO servers or third parties. Without the app running,
  the extension shows its results in its own popup.

## Publishing (Chrome Web Store)

To do before submitting:

- [ ] Extension icons (16, 32, 48, 128 px)
- [ ] Store listing: screenshots (1280×800), small promo tile (440×280), marquee (1400×560)
- [ ] Splash / landing page on spider-seo.app for the extension (what it does, privacy,
      how to pair it with the app)
- [ ] Privacy policy section covering the extension (permissions and data use)
- [ ] Justification for each permission requested (`webRequest`, `debugger`, host permissions)

## Repository

Part of [`osx-spider-seo`](https://github.com/klich3/osx-spider-seo) as a git submodule
at `_apps/chrome_extension`.

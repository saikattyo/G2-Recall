# G2 Recall Even Hub app

This directory contains the Even Hub plugin for Even G2. The app renders fixed 576x288 monochrome containers through `@evenrealities/even_hub_sdk`; the phone-side controller handles `.apkg` import and library selection.

## Runtime behavior

- The phone controller imports Anki `.apkg` files only.
- Imported sources are stored locally and can be renamed.
- The G2 range menu selects today's due cards, all cards, an imported source, or a deck.
- Review state is persisted in Even Hub local storage.
- New cards use Anki-style learning steps (`1 minute` -> `10 minutes` -> `1 day`).
- Correct reviews increase intervals; Again moves cards into a short relearning step.
- Imported card due dates, intervals, ease, and review counts are used when available.
- Japanese and English are supported.

## G2 controls

| Screen | Gesture | Action |
| --- | --- | --- |
| Range menu | Swipe up/down | Choose a range |
| Range menu | Tap | Start reviewing |
| Any screen | Double tap | Exit |
| Question | Tap | Reveal the answer |
| Question | Swipe up | Previous card |
| Answer | Tap | Good |
| Answer | Swipe up | Easy |
| Answer | Swipe down | Again |
| Answer | Double tap | Hard |

## Development

Install dependencies and start Vite:

```bash
npm ci
npm run dev
```

Run the official simulator in another terminal:

```bash
npx --yes @evenrealities/evenhub-simulator@latest http://localhost:5173
```

For local testing on paired glasses, use the computer's LAN address:

```bash
npx --yes @evenrealities/evenhub-cli@latest qr --url "http://<YOUR-LAN-IP>:5173"
```

Then scan the QR code in `Even Hub > Scan QR`. Developer Mode must be enabled, and the phone must be able to reach the computer over the local network.

## Package for Even Hub

```bash
npm run build
npm run pack
```

This creates `dist/g2-recall.ehpk`. Upload that file as a private build in the Even Hub developer portal, then install it from `Even Hub > Me > Apps > Private builds` in the Even Realities phone app.

## Implementation notes

- `src/main.js` owns the bridge lifecycle, G2 containers, gestures, scheduling, and phone controller.
- `src/library.js` validates `.apkg` extensions and normalizes common Basic, reversed Basic, and Cloze cards.
- `src/cards.js` provides the bundled starter deck.
- Review state and imported libraries are local to the Even Hub app. They are not synced with AnkiWeb.
- Vendored runtime licenses are documented in [the repository's third-party notices](../THIRD_PARTY_NOTICES.md).

## Screenshots

See the repository-level [README](../README.md) for G2 and phone-controller screenshots.

## Official references

- [Even Hub Quickstart](https://hub.evenrealities.com/docs/get-started/quickstart/index)
- [Even Hub testing modes](https://hub.evenrealities.com/docs/test)
- [Even Hub SDK](https://www.npmjs.com/package/@evenrealities/even_hub_sdk)

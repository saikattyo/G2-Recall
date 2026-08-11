# G2 Recall Even Hub companion

This folder is the Even Hub plugin target for Even G2. It is separate from the full browser app in the repository root because Even G2 plugins use the Even Hub SDK and render fixed 576x288 monochrome containers instead of arbitrary HTML/CSS.

The current companion is a hardware smoke-test and quick-review surface:

- tap on the question: show the answer
- tap on the answer: grade Good
- swipe up on the answer: grade Again
- swipe down on the answer: grade Easy
- double tap on the answer: grade Hard
- double tap on the question: exit

Cards are defined in `src/cards.js` and review counts are stored in Even Hub local storage. The companion does not yet share the browser app database or import `.apkg` files.

## Local development

From this directory:

```bash
npm install
npm run dev
```

For the simulator, in another terminal run:

```bash
evenhub-simulator http://localhost:5173
```

For a paired G2, use the computer's LAN address:

```bash
evenhub qr --url "http://<YOUR-LAN-IP>:5173"
```

Then open `Even Hub > Scan QR` in the Even Realities phone app. Developer Mode must be enabled, and the phone must be able to reach the computer over the local network.

## Private package

```bash
npm run pack
```

Upload `dist/g2-recall.ehpk` to the Even Hub developer portal as a private build, then install it from `Even Hub > Me > Apps > Private builds` in the phone app.

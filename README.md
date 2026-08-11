# G2 Recall

G2 Recall is a lightweight offline flashcard app for spaced repetition. It is a static web app: no build step, no server, no account, and no external dependencies.

It is inspired by mature SRS workflows, including Anki-style review habits, but it is not affiliated with Anki, AnkiWeb, or Ankitects.

## Features

- Decks and `Parent::Child`-style deck names
- Basic, reverse, and cloze notes
- Tags, colored flags, suspension, and bury-until-tomorrow
- SM-2-style scheduling with learning, relearning, and review states
- Again / Hard / Good / Easy grading
- Automatic sibling burying
- Daily new and review limits
- Rollover hour setting
- Browser/search view with `tag:`, `deck:`, `is:`, `flag:`, and `model:` filters
- Stats, due forecast, state breakdown, and review heatmap
- JSON backup/restore
- TSV import/export
- Anki `.apkg` import/export for common Basic, reversed Basic, and Cloze decks
- Local image and audio attachments
- Keyboard shortcuts for review

## Run Locally

Open `index.html` directly in a browser, or run a tiny local static server:

```bash
npm start
```

Then open:

```text
http://localhost:4173
```

No install step is required.

## GitHub Pages

This repository includes a GitHub Pages workflow at `.github/workflows/pages.yml`.

To publish:

1. Create a new GitHub repository.
2. Push this folder as the repository root.
3. In GitHub, open `Settings > Pages`.
4. Set the source to `GitHub Actions`.
5. Push to `main`.

The app can also be served by any static host because it only needs the committed static files; there is no build step.

## Even G2 / Even Hub

The browser app and the Even G2 app are different targets. Even G2 does not render an arbitrary GitHub Pages HTML page directly: an Even Hub plugin must use the Even Hub SDK and be packaged as an `.ehpk` file. The repository includes a small G2 companion plugin in [`evenhub/`](evenhub/).

The companion is intentionally focused on hands-free review on the glasses. It uses the same card concept and grading flow, but it does not yet sync the browser app's `localStorage`, import `.apkg` files, or expose the full desktop editor. Edit [`evenhub/src/cards.js`](evenhub/src/cards.js) before packaging to put your own short deck on the glasses.

### Test on the simulator

Install Node.js 20 LTS or 22+, then install the official Even Hub tools:

```bash
npm install -g @evenrealities/evenhub-cli @evenrealities/evenhub-simulator
cd evenhub
npm install
npm run dev
```

In another terminal:

```bash
evenhub-simulator http://localhost:5173
```

The simulator uses the Even G2 576x288 monochrome layout. A tap shows the answer, swipe up grades `Again`, swipe down grades `Easy`, a tap on the answer grades `Good`, and a double tap on the answer grades `Hard`. Double tap on the question exits.

### Test on your own Even G2

1. Install and pair the Even Realities App, then update the glasses firmware.
2. Sign in to the Even Hub developer portal with the same account and enable Developer Mode.
3. In `evenhub/`, run `npm run dev`.
4. Find your computer's LAN IP and run `evenhub qr --url "http://<YOUR-LAN-IP>:5173"`.
5. In the phone app, open `Even Hub > Scan QR` and scan the terminal QR code.
6. Use the temple gestures described above to review the sample cards.

The phone and computer must be on a network that allows the phone to reach the development server. The local QR flow is for development and hot reload; it is not the public Even Hub store submission flow.

### Build a private `.ehpk`

```bash
cd evenhub
npm run pack
```

Upload `evenhub/dist/g2-recall.ehpk` in the Even Hub developer portal under a private build, then install it from the Even Realities App's `Even Hub > Me > Apps > Private builds`. This is the path for testing a packaged build on your own glasses.

Even Hub documentation: [Quickstart](https://hub.evenrealities.com/docs/get-started/quickstart/index), [Local Testing](https://hub.evenrealities.com/docs/test/local-testing), and [Packaging & Deployment](https://hub.evenrealities.com/docs/ship/packaging).

## Anki Package Exchange

Open `入出力` to import an `.apkg` or export the current G2 Recall collection as an `.apkg`. The package adapter runs in the browser and includes the collection SQLite database and local media files.

The supported conversion targets are Basic, Basic (and reversed card), and Cloze note types. Anki scheduling fields, flags, suspension state, tags, and review history are transferred where the G2 Recall data model has an equivalent. Custom note types and complex templates are simplified to front/back/extra fields with an import warning.

## Data And Privacy

All study data is stored in the browser's `localStorage` under `g2-recall-db-v1`.

Important details:

- Data stays on the device unless you export or sync the browser profile yourself.
- JSON backups include card text and embedded media as data URLs.
- Do not commit personal backup files or private study data.
- Browser storage can be cleared by browser cleanup tools, private mode, or site-data reset.

Use `入出力 > JSONを書き出す` regularly if the cards matter.

## Import Format

TSV import accepts either a header row or this column order:

```text
deck	model	front	back	extra	tags
```

For cloze cards, use `model` = `cloze` and put the cloze text in `front` or a `text` column:

```text
Japanese	cloze	東京は{{c1::日本}}の首都です。		geography
```

Cloze syntax:

```text
{{c1::answer}}
{{c1::answer::hint}}
```

## Search Syntax

Examples:

```text
tag:exam
deck:Japanese
is:due
is:new
is:suspended
is:flagged
flag:red
model:cloze
```

Plain text searches across deck name, note content, tags, template name, and card state.

## Review Shortcuts

- `Space` or `Enter`: show answer
- `1`: Again
- `2`: Hard
- `3`: Good
- `4`: Easy
- `B`: bury card
- `S`: suspend card
- `F`: cycle flag
- `E`: edit note
- `Z`: undo last review

## Development

Run the static checks:

```bash
npm run check
```

This checks JavaScript syntax and runs a small startup smoke test in Node.

## Compatibility Notes

G2 Recall covers the core local study workflow, but it is not a full Anki replacement. These are intentionally not implemented:

- AnkiWeb sync
- Anki add-ons
- Anki's full template engine and arbitrary custom note types
- Full FSRS scheduler parity

`.apkg` import/export is intended for common Basic, Basic (and reversed card), and Cloze note types. Complex custom templates are converted to the available front/back/extra fields and the app reports a warning. JSON backups remain the complete local backup format, while TSV is useful for simple migration.

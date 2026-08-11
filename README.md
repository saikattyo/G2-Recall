# G2 Recall

[日本語版 README](README.ja.md)

> Review Anki flashcards on **Even G2 smart glasses**. Import an `.apkg` deck from your phone, choose what to study, and answer with simple gestures.

G2 Recall is an open-source, local-first spaced-repetition app for Even G2. It puts the review loop on the glasses so you can choose a range, reveal the answer, grade the card, and continue without reaching for a phone.

The Even Hub app in [`evenhub/`](evenhub/) is the only supported product in this repository.

> G2 Recall is an independent open-source project. It is not affiliated with Anki, AnkiWeb, or Ankitects.

**At a glance**

| Item | Details |
| --- | --- |
| Platform | Even G2 smart glasses with Even Hub |
| Input | Anki `.apkg` files from the phone-side controller |
| Review | Spaced repetition with gesture-based grading |
| Languages | Japanese and English |
| Storage | Local on the phone; no project-operated cloud backend |
| Current scope | Lightweight Anki import; no AnkiWeb sync or add-ons |

G2 Recall is a focused glasses companion, not a full replacement for the Anki desktop or mobile app. It imports supported `.apkg` decks for review on Even G2 and keeps the review data local.

> Distribution status: the GitHub repository is public, but the Even Hub app is currently distributed as a private build for testing. It is not yet a one-click public Hub listing.

## Screenshots

### Even G2 display

The G2 images below were captured from the official Even Hub simulator and use the same 576x288 display layout as the packaged app.

| Choose a range | Question | Answer and grades |
| --- | --- | --- |
| ![G2 range menu](docs/screenshots/g2-menu.jpg) | ![G2 question](docs/screenshots/g2-question.jpg) | ![G2 answer](docs/screenshots/g2-answer.jpg) |

### Phone controller

The phone-side Even Hub page is used to import `.apkg` files and choose the file or deck to review.

![G2 Recall phone controller](docs/screenshots/phone-controller.jpg)

## Features

### Even G2 app

- Choose `Today's review`, all cards, an imported file, or an individual deck on G2.
- Import Anki `.apkg` files from the phone-side controller. Other file types are rejected.
- Keep multiple imported sources and give them display names on the phone.
- Japanese and English language selection for the phone controller and G2 UI.
- Anki-style local scheduling with learning steps, due times, intervals, ease, repetitions, and lapses.
- New cards use short learning steps (`1 minute` -> `10 minutes`), then graduate to a `1 day` review interval.
- Correct answers gradually extend the interval; Again sends difficult cards back to a short relearning step.
- Imported `.apkg` card state, interval, ease, and due date are used as the starting point when available.
- Due cards are lightly shuffled to avoid always seeing cards in the same order.
- Compact gesture-based review designed for short sessions.

## G2 controls

| Screen | Gesture | Action |
| --- | --- | --- |
| Range menu | Swipe up/down | Choose a range |
| Range menu | Tap | Start reviewing |
| Any G2 screen | Double tap | Exit the app |
| Question | Tap | Show the answer |
| Question | Swipe up | Return to the previous card |
| Answer | Tap | Good |
| Answer | Swipe up | Easy |
| Answer | Swipe down | Again |
| Answer | Double tap | Hard |

The answer screen shows the next interval for each grade so the gesture choice is visible before you commit it. Deck and source ranges default to due cards; `All cards` remains available when you intentionally want to study ahead.

## Install a private build

The simplest way to try the packaged app on your own glasses is an Even Hub private build:

1. Open the project in the Even Hub developer portal.
2. Upload `evenhub/dist/g2-recall.ehpk` as a private build.
3. In the Even Realities phone app, open `Even Hub > Me > Apps > Private builds`.
4. Install or update **G2 Recall**, then launch it from the app list.

The packaged app runs inside Even Hub.

## Local development

### Requirements

- Node.js 20 LTS or newer
- An Even Realities account and the Even Realities phone app
- Paired Even G2 glasses for hardware testing
- Developer Mode enabled for QR sideloading

### Run the Even Hub app

```bash
cd evenhub
npm ci
npm run dev
```

In another terminal, run the simulator:

```bash
npx --yes @evenrealities/evenhub-simulator@latest http://localhost:5173
```

For a paired G2 on the same network, generate a QR code from the computer's LAN address:

```bash
npx --yes @evenrealities/evenhub-cli@latest qr --url "http://<YOUR-LAN-IP>:5173"
```

Scan the QR code from `Even Hub > Scan QR` in the Even Realities phone app. The phone and computer must be able to reach each other on the local network.

### Build the packaged app

```bash
cd evenhub
npm run build
npm run pack
```

The package is written to `evenhub/dist/g2-recall.ehpk`.

## Anki compatibility

The Even G2 app accepts `.apkg` files only. It currently extracts common Basic, reversed Basic, and Cloze cards into a lightweight front/back review model.

Complex custom note types and templates are simplified during import. The following are intentionally not implemented in the Even G2 app:

- AnkiWeb sync
- Anki add-ons
- Full custom template rendering
- Full FSRS or Anki scheduler parity (the app uses a lightweight Anki-style scheduler designed for G2)
- Media rendering on the G2 display

## Data and privacy

G2 review data and imported decks stay in the Even Hub app's local storage on the phone. This project does not include a cloud backend or automatic sync.

Do not commit personal `.apkg` files, JSON backups, private study notes, credentials, or `.env` files.

## Project structure

```text
.
├── evenhub/              # Primary Even G2 / Even Hub app
│   ├── app.json          # Even Hub package manifest
│   ├── src/main.js       # G2 review flow and phone controller
│   ├── src/library.js    # .apkg import and source library handling
│   └── public/           # Bundled .apkg parser and runtime files
├── docs/screenshots/     # README screenshots from the Even Hub simulator
└── LICENSE               # MIT license
```

## Contributing

Bug reports and improvements are welcome. Please include the target surface (`Even G2` or `Even Hub phone page`), the app/build version, the device/app state, and reproducible steps. See [`CONTRIBUTING.md`](CONTRIBUTING.md).

## License

Original G2 Recall code and documentation are released under the [MIT License](LICENSE). Vendored third-party runtimes retain their own licenses; see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

## Even Hub references

- [Even Hub Quickstart](https://hub.evenrealities.com/docs/get-started/quickstart/index)
- [Even Hub testing modes](https://hub.evenrealities.com/docs/test)
- [Even Hub SDK](https://www.npmjs.com/package/@evenrealities/even_hub_sdk)
- [Even Hub starter templates](https://github.com/even-realities/evenhub-templates)

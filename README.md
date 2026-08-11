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

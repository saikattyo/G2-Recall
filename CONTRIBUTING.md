# Contributing to G2 Recall

Thanks for helping improve G2 Recall.

## Before opening an issue

Please check whether the problem belongs to one of these surfaces:

- `Even G2`: glasses rendering or gestures
- `Even Hub phone page`: `.apkg` import, language, deck selection, or titles
- `Browser prototype`: browser-only collection tools

Include the app version, Even Realities app version if relevant, whether the issue happens in the simulator or on physical glasses, and exact reproduction steps. Do not attach private decks or study data unless they are sanitized.

## Development checks

From the repository root:

```bash
npm install
npm run check
```

For Even Hub changes:

```bash
cd evenhub
npm install
npm run build
npm run pack
```

Please keep G2 text short enough to be readable at a glance and test gesture changes in the simulator before testing on hardware.

## Pull requests

- Keep changes focused and explain the user-visible behavior.
- Update the relevant README when setup or gestures change.
- Add or refresh a simulator screenshot when the G2 UI changes materially.
- Do not commit personal decks, backups, credentials, build output, or `.env` files.

# Security Policy

G2 Recall is local-first. The Even Hub app stores imported decks and review state in Even Hub local storage on the phone. The optional browser prototype stores its collection in browser `localStorage`. There is no project-operated cloud backend.

- Do not import JSON backups from people you do not trust.
- Backups may contain all card text and embedded media as data URLs.
- Do not commit personal decks, study backups, private notes, credentials, or `.env` files.
- When reporting an issue, remove private card content and attachments from logs or screenshots.

If you find a security issue, open a private report or contact the repository owner directly.

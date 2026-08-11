const DEFAULT_DECK = "インポート";

function cleanMarkup(value) {
  return String(value || "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .trim();
}

function clozePrompt(value) {
  return String(value || "").replace(/\{\{c\d+::([^:}]+)(?::([^}]+))?\}\}/gi, (_, answer, hint) => {
    return hint ? `[${hint}]` : "[…]";
  });
}

function clozeAnswer(value) {
  return Array.from(String(value || "").matchAll(/\{\{c\d+::([^:}]+)(?::([^}]+))?\}\}/gi))
    .map((match) => match[1])
    .join(" / ");
}

function stableId(sourceId, value, index) {
  const raw = String(value || index).replace(/[^a-zA-Z0-9_-]+/g, "-");
  return `g2-${sourceId}-${raw || index}`;
}

function normalizeCard(raw, sourceId, index, fallbackDeck = DEFAULT_DECK) {
  const fields = raw?.fields || {};
  const model = String(raw?.model || raw?.type || "basic").toLowerCase();
  const rawFront = raw?.front ?? raw?.question ?? fields.front ?? fields.text ?? raw?.text ?? "";
  const rawBack = raw?.back ?? raw?.answer ?? fields.back ?? fields.extra ?? "";
  const front = cleanMarkup(model === "cloze" ? clozePrompt(rawFront) : rawFront);
  const clozeBack = cleanMarkup(clozeAnswer(rawFront));
  const back = cleanMarkup(rawBack || clozeBack);
  const importedSchedule = raw?.schedule || (raw?.state ? raw : null);

  if (!front || !back) return null;

  const card = {
    id: stableId(sourceId, raw?.id || raw?.cardId || raw?.ankiCardId, index),
    deck: cleanMarkup(raw?.deck || raw?.deckName || fallbackDeck) || DEFAULT_DECK,
    front,
    back,
    sourceId,
    sourceName: raw?.sourceName || sourceId,
    model
  };

  if (importedSchedule) {
    const rawEase = Number(importedSchedule.ease);
    card.schedule = {
      state: String(importedSchedule.state || "new"),
      learningStep: Math.max(0, Number(importedSchedule.learningStep || 0)),
      dueAt: Math.max(0, Number(importedSchedule.dueAt || importedSchedule.due || Date.now())),
      intervalDays: Math.max(0, Number(importedSchedule.intervalDays ?? importedSchedule.interval ?? 0)),
      ease: rawEase > 10 ? rawEase / 100 : rawEase || 2.5,
      reps: Math.max(0, Number(importedSchedule.reps || 0)),
      lapses: Math.max(0, Number(importedSchedule.lapses || 0))
    };
  }

  return card;
}

async function parseApkg(file, sourceId) {
  if (!window.G2Apkg || typeof window.G2Apkg.importFile !== "function") {
    throw new Error(".apkg parser is not available");
  }

  const imported = await window.G2Apkg.importFile(file);
  const notes = new Map((imported.notes || []).map((note) => [note.id, note]));
  const decks = new Map((imported.decks || []).map((deck) => [deck.id, deck.name]));

  return (imported.cards || []).map((raw, index) => {
    const note = notes.get(raw.noteId) || {};
    return normalizeCard({
      id: raw.id,
      model: note.model,
      deck: decks.get(raw.deckId || note.deckId) || DEFAULT_DECK,
      front: note.fields?.front || note.fields?.text,
      back: note.fields?.back || note.fields?.extra,
      state: raw.state,
      due: raw.due,
      interval: raw.interval,
      ease: raw.ease,
      reps: raw.reps,
      lapses: raw.lapses
    }, sourceId, index);
  }).filter(Boolean);
}

export async function parseDeckFile(file) {
  const sourceId = file.name.replace(/\.[^.]+$/, "").replace(/[^a-zA-Z0-9_-]+/g, "-") || "imported";
  const fileTitle = file.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim();
  const extension = file.name.toLowerCase().split(".").pop();
  if (extension !== "apkg") throw new Error("対応形式は .apkg のみです");

  const importedCards = await parseApkg(file, sourceId);
  const deckNames = [...new Set(importedCards.map((card) => card.deck).filter((deck) => deck && deck !== "インポート"))];
  const preferredTitle = deckNames.length === 1 ? deckNames[0] : "";

  if (!importedCards.length) throw new Error("問題を読み込めませんでした");

  return {
    sourceId,
    name: preferredTitle || fileTitle || file.name,
    title: preferredTitle || fileTitle || file.name,
    importedAt: Date.now(),
    cards: importedCards,
    stats: { cards: importedCards.length, decks: new Set(importedCards.map((card) => card.deck)).size }
  };
}

export function libraryCards(library) {
  return library.flatMap((source) => source.cards || []);
}

export function normalizeLibrary(value, starterCards) {
  if (!Array.isArray(value) || !value.length) {
    return [{ sourceId: "starter", name: "サンプル", importedAt: Date.now(), cards: starterCards }];
  }

  return value.filter((source) => source && Array.isArray(source.cards) && source.cards.length)
    .map((source) => ({
      sourceId: String(source.sourceId || source.name || "imported"),
      name: String(source.title || source.name || source.sourceId || "インポート"),
      title: String(source.title || source.name || source.sourceId || "インポート"),
      importedAt: Number(source.importedAt || Date.now()),
      cards: source.cards.map((card, index) => normalizeCard(card, source.sourceId || "imported", index, card.deck)).filter(Boolean)
    }))
    .filter((source) => source.cards.length);
}

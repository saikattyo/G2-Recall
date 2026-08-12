import {
  CreateStartUpPageContainer,
  OsEventTypeList,
  RebuildPageContainer,
  TextContainerProperty,
  waitForEvenAppBridge
} from "@evenrealities/even_hub_sdk";
import { cards as starterCards } from "./cards.js";
import { libraryCards, normalizeLibrary, parseDeckFile } from "./library.js";
import {
  DAY_MS,
  MINUTE_MS,
  previewSchedule,
  reviewForCard,
  scheduleCard
} from "./scheduler.js";

const REVIEW_CONTAINER_ID = 1;
const CONTAINER_NAME = "main";
const REVIEW_KEY = "g2-recall-even-reviews-v1";
const LIBRARY_KEY = "g2-recall-even-library-v1";
const LANGUAGE_KEY = "g2-recall-language-v1";
const MAX_AGAIN_REPEATS = 2;

const COPY = {
  ja: {
    appName: "G2 Recall",
    language: "言語",
    filePanelTitle: "ファイルを読み込む",
    filePanelDescription: "スマホからAnkiの.apkgファイルを追加できます。対応形式: .apkgのみ",
    fileLabel: "ファイルを選択",
    waiting: "読み込み待機中",
    loadingFile: "{name} を読み込んでいます…",
    importAdded: "{name}: {cards}枚、{decks}デッキを追加しました",
    importFailed: "読み込み失敗: .apkgファイルを選択してください",
    titleLabel: "デッキの表示名",
    titlePlaceholder: "例: 英単語 初級",
    saveTitle: "タイトルを保存",
    titleSaved: "{name} の表示名を保存しました",
    titleRequired: "表示名を入力してください",
    scopeTitle: "復習する範囲",
    startReview: "この範囲をG2で復習",
    scopeHint: "G2ではスワイプで選択、タップで決定します。",
    menuChoose: "UP/DOWN: 範囲を選択",
    sample: "サンプル",
    todayReview: "今日の復習",
    allCards: "全カード",
    imported: "インポート",
    defaultDeck: "デフォルト",
    remaining: "残り{count}",
    reviewComplete: "今日の復習は完了",
    next: "次回",
    noDueCards: "この範囲に期限カードはありません",
    notScheduled: "未定",
    selectRange: "範囲を選び直す",
    question: "問題",
    answer: "答え",
    tapReveal: "TAP: 答えを見る",
    previous: "UP: 前の問題",
    exit: "DOUBLE: 終了",
    tapStart: "TAP: 復習を開始",
    easy: "Easy",
    again: "Again",
    good: "Good",
    hard: "Hard",
    minutes: "分",
    days: "日"
  },
  en: {
    appName: "G2 Recall",
    language: "Language",
    filePanelTitle: "Import a file",
    filePanelDescription: "Add an Anki .apkg file from your phone. Supported: .apkg only",
    fileLabel: "Choose a file",
    waiting: "Ready to import",
    loadingFile: "Loading {name}...",
    importAdded: "{name}: added {cards} cards from {decks} decks",
    importFailed: "Import failed: choose an .apkg file",
    titleLabel: "Deck display name",
    titlePlaceholder: "Example: English vocabulary - beginner",
    saveTitle: "Save title",
    titleSaved: "Saved the display name for {name}",
    titleRequired: "Enter a display name",
    scopeTitle: "Choose a review range",
    startReview: "Review this range on G2",
    scopeHint: "Swipe on G2 to choose, then tap to start.",
    menuChoose: "UP/DOWN: Choose a range",
    sample: "Sample",
    todayReview: "Today's review",
    allCards: "All cards",
    imported: "Imported",
    defaultDeck: "Default",
    remaining: "{count} left",
    reviewComplete: "Review complete",
    next: "Next",
    noDueCards: "No due cards in this range",
    selectRange: "Choose another range",
    question: "Question",
    answer: "Answer",
    tapReveal: "TAP: Show answer",
    previous: "UP: Previous card",
    exit: "DOUBLE: Exit",
    tapStart: "TAP: Start review",
    easy: "Easy",
    again: "Again",
    good: "Good",
    hard: "Hard",
    minutes: " min",
    days: " days"
  }
};

let bridge;
let language = "ja";
let reviews = {};
let library = [];
let allCards = [];
let scopeOptions = [];
let selectedScopeId = "due:all";
let selectedSourceId = null;
let mode = "menu";
let queue = [];
let position = 0;
let sessionTotal = 0;
let answerShown = false;

function t(key, values = {}) {
  const template = COPY[language]?.[key] || COPY.ja[key] || key;
  return template.replace(/\{(\w+)\}/g, (_, name) => String(values[name] ?? ""));
}

function displaySourceName(source) {
  return source?.sourceId === "starter" ? t("sample") : String(source?.title || source?.name || t("imported"));
}

function displayDeckName(deck) {
  if (deck === "インポート") return t("imported");
  if (deck === "デフォルト") return t("defaultDeck");
  return deck;
}

function crop(value, max) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function currentItem() {
  return queue[position] || null;
}

function currentCard() {
  return currentItem()?.card || null;
}

function isDue(card, now = Date.now()) {
  return !reviewForCard(reviews, card).dueAt || reviewForCard(reviews, card).dueAt <= now;
}

function formatNextDue(timestamp) {
  if (!timestamp) return t("notScheduled");
  return new Intl.DateTimeFormat(language === "ja" ? "ja-JP" : "en-US", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(timestamp));
}

function nextDue() {
  return allCards
    .map((card) => reviewForCard(reviews, card).dueAt)
    .filter(Boolean)
    .sort((a, b) => a - b)[0];
}

function plannedInterval(card, label) {
  const next = previewSchedule(reviewForCard(reviews, card), label);
  const delay = Math.max(MINUTE_MS, next.dueAt - Date.now());
  if (delay < DAY_MS) return `${Math.max(1, Math.round(delay / MINUTE_MS))}${t("minutes")}`;
  return `${Math.max(1, Math.round(delay / DAY_MS))}${t("days")}`;
}

function answerHints(card) {
  return [
    `UP ${t("easy")} ${plannedInterval(card, "easy")}  DOWN ${t("again")} ${plannedInterval(card, "again")}`,
    `TAP ${t("good")} ${plannedInterval(card, "good")}  DOUBLE ${t("hard")} ${plannedInterval(card, "hard")}`
  ];
}

function selectedScope() {
  return scopeOptions.find((scope) => scope.id === selectedScopeId) || scopeOptions[0];
}

function scopeOptionsForLibrary() {
  const dueCount = allCards.filter((card) => isDue(card)).length;
  const options = [
    { id: "due:all", label: `${t("todayReview")} (${dueCount})`, cards: allCards, dueOnly: true },
    { id: "all:all", label: `${t("allCards")} (${allCards.length})`, cards: allCards, dueOnly: false }
  ];

  library.forEach((source) => {
    const sourceCards = source.cards || [];
    const sourceDueCount = sourceCards.filter((card) => isDue(card)).length;
    options.push({
      id: `source:${source.sourceId}`,
      label: `${displaySourceName(source)} (${sourceDueCount}/${sourceCards.length})`,
      cards: sourceCards,
      dueOnly: true
    });

    [...new Set(sourceCards.map((card) => card.deck))].forEach((deck) => {
      const deckCards = sourceCards.filter((card) => card.deck === deck);
      const deckDueCount = deckCards.filter((card) => isDue(card)).length;
      options.push({
        id: `deck:${source.sourceId}:${deck}`,
        label: `${displaySourceName(source)} / ${displayDeckName(deck)} (${deckDueCount}/${deckCards.length})`,
        cards: deckCards,
        dueOnly: true
      });
    });
  });

  return options;
}

function startReview(scopeId = selectedScopeId) {
  selectedScopeId = scopeId;
  const scope = selectedScope();
  const candidates = (scope?.cards || [])
    .filter((card) => !scope.dueOnly || isDue(card))
    .map((card) => ({
      card,
      dueAt: reviewForCard(reviews, card).dueAt || 0,
      fuzz: Math.random() * 5 * MINUTE_MS
    }))
    .sort((a, b) => a.dueAt + a.fuzz - (b.dueAt + b.fuzz))
    .map(({ card }) => card);

  mode = "review";
  queue = candidates.map((card) => ({ card, againRepeats: 0 }));
  position = 0;
  sessionTotal = queue.length;
  answerShown = false;
}

function content() {
  const card = currentCard();
  const scope = selectedScope();

  if (!card) {
    const due = nextDue();
    if (due && due > Date.now()) {
      return [
        t("appName"),
        crop(scope?.label || t("scopeTitle"), 36),
        "",
        t("reviewComplete"),
        `${t("next")} ${formatNextDue(due)}`,
        "",
        `TAP: ${t("selectRange")}`,
        t("exit")
      ].join("\n");
    }

    return [
      t("appName"),
      crop(scope?.label || t("scopeTitle"), 36),
      "",
      t("noDueCards"),
      "",
      `TAP: ${t("selectRange")}`,
      t("exit")
    ].join("\n");
  }

  const remaining = Math.max(sessionTotal - position, 1);
  const header = `${t("appName")}  ${Math.min(position + 1, sessionTotal)}/${sessionTotal}`;

  if (!answerShown) {
    return [
      header,
      `${displayDeckName(card.deck)}  ${t("remaining", { count: remaining })}`,
      "",
      `${t("question")}  ` + crop(card.front, 210),
      "",
      t("tapReveal"),
      t("previous"),
      t("exit")
    ].join("\n");
  }

  return [
    header,
    `${displayDeckName(card.deck)}  ${t("remaining", { count: remaining })}`,
    "",
    `${t("question")}  ` + crop(card.front, 130),
    `${t("answer")}  ` + crop(card.back, 175),
    "",
    ...answerHints(card)
  ].join("\n");
}

function menuText() {
  const currentIndex = Math.max(scopeOptions.findIndex((scope) => scope.id === selectedScopeId), 0);
  const currentLabel = crop(scopeOptions[currentIndex]?.label || t("scopeTitle"), 42);
  return [
    t("appName"),
    "",
    `${currentIndex + 1}/${Math.max(scopeOptions.length, 1)}  ${currentLabel}`,
    "",
    t("menuChoose"),
    t("tapStart"),
    t("exit")
  ].join("\n");
}

function menuContainer() {
  return new TextContainerProperty({
    xPosition: 0,
    yPosition: 0,
    width: 576,
    height: 288,
    borderWidth: 0,
    paddingLength: 4,
    zOrderIndex: 1,
    containerID: REVIEW_CONTAINER_ID,
    containerName: CONTAINER_NAME,
    content: menuText(),
    isEventCapture: 1
  });
}

async function renderMenu(initial = false) {
  const page = new (initial ? CreateStartUpPageContainer : RebuildPageContainer)({
    containerTotalNum: 1,
    textObject: [menuContainer()]
  });

  if (initial) {
    const result = await bridge.createStartUpPageContainer(page);
    if (result !== 0) console.error("G2 Recall menu failed", result);
  } else {
    await bridge.rebuildPageContainer(page);
  }
}

async function renderReview(initial = false) {
  if (initial) {
    const result = await bridge.createStartUpPageContainer(
      new CreateStartUpPageContainer({
        containerTotalNum: 1,
        textObject: [new TextContainerProperty({
          xPosition: 0,
          yPosition: 0,
          width: 576,
          height: 288,
          borderWidth: 0,
          paddingLength: 4,
          zOrderIndex: 1,
          containerID: REVIEW_CONTAINER_ID,
          containerName: CONTAINER_NAME,
          content: content(),
          isEventCapture: 1
        })]
      })
    );
    if (result !== 0) console.error("G2 Recall startup failed", result);
    return;
  }

  await bridge.rebuildPageContainer(new RebuildPageContainer({
    containerTotalNum: 1,
    textObject: [new TextContainerProperty({
      xPosition: 0,
      yPosition: 0,
      width: 576,
      height: 288,
      borderWidth: 0,
      paddingLength: 4,
      zOrderIndex: 1,
      containerID: REVIEW_CONTAINER_ID,
      containerName: CONTAINER_NAME,
      content: content(),
      isEventCapture: 1
    })]
  }));
}

async function saveReviews() {
  await bridge.setLocalStorage(REVIEW_KEY, JSON.stringify(reviews));
}

async function saveLibrary() {
  await bridge.setLocalStorage(LIBRARY_KEY, JSON.stringify(library));
}

async function loadState() {
  try {
    const rawLanguage = await bridge.getLocalStorage(LANGUAGE_KEY);
    language = rawLanguage === "en" ? "en" : "ja";
  } catch (error) {
    language = "ja";
  }
  try {
    const rawReviews = await bridge.getLocalStorage(REVIEW_KEY);
    reviews = rawReviews ? JSON.parse(rawReviews) : {};
  } catch (error) {
    reviews = {};
  }
  try {
    const rawLibrary = await bridge.getLocalStorage(LIBRARY_KEY);
    library = normalizeLibrary(rawLibrary ? JSON.parse(rawLibrary) : null, starterCards);
  } catch (error) {
    library = normalizeLibrary(null, starterCards);
  }
  allCards = libraryCards(library);
  scopeOptions = scopeOptionsForLibrary();
  if (!scopeOptions.some((scope) => scope.id === selectedScopeId)) selectedScopeId = scopeOptions[0].id;
}

function applyPhoneLanguage() {
  document.documentElement.lang = language;
  const text = {
    "language-label": "language",
    "file-panel-title": "filePanelTitle",
    "file-panel-description": "filePanelDescription",
    "file-label": "fileLabel",
    "title-label": "titleLabel",
    "save-title": "saveTitle",
    "scope-panel-title": "scopeTitle",
    "start-review": "startReview",
    "scope-hint": "scopeHint"
  };

  Object.entries(text).forEach(([id, key]) => {
    const node = document.getElementById(id);
    if (node) node.textContent = t(key);
  });

  const languageSelect = document.getElementById("language-select");
  const fileInput = document.getElementById("deck-file");
  const scopeSelect = document.getElementById("scope-select");
  const titleInput = document.getElementById("deck-title");
  if (languageSelect) languageSelect.setAttribute("aria-label", t("language"));
  if (fileInput) fileInput.setAttribute("aria-label", t("fileLabel"));
  if (scopeSelect) scopeSelect.setAttribute("aria-label", t("scopeTitle"));
  if (titleInput) titleInput.placeholder = t("titlePlaceholder");
}

function updatePhoneUi(status = t("waiting")) {
  const select = document.getElementById("scope-select");
  const startButton = document.getElementById("start-review");
  const statusNode = document.getElementById("phone-status");
  const titleEditor = document.getElementById("title-editor");
  const titleInput = document.getElementById("deck-title");
  if (!select || !startButton || !statusNode) return;

  select.replaceChildren();
  scopeOptions.forEach((scope) => {
    const option = document.createElement("option");
    option.value = scope.id;
    option.textContent = scope.label;
    option.selected = scope.id === selectedScopeId;
    select.appendChild(option);
  });
  select.disabled = false;
  startButton.disabled = !scopeOptions.length;
  statusNode.textContent = status;

  const source = library.find((item) => item.sourceId === selectedSourceId);
  if (titleEditor && titleInput) {
    titleEditor.hidden = !source;
    titleInput.disabled = !source;
    titleInput.value = source?.title || source?.name || "";
  }
}

function initPhoneUi() {
  const fileInput = document.getElementById("deck-file");
  const scopeSelect = document.getElementById("scope-select");
  const startButton = document.getElementById("start-review");
  const languageSelect = document.getElementById("language-select");
  const titleInput = document.getElementById("deck-title");
  const saveTitleButton = document.getElementById("save-title");
  if (!fileInput || !scopeSelect || !startButton || !languageSelect || !titleInput || !saveTitleButton) return;

  languageSelect.value = language;
  applyPhoneLanguage();

  languageSelect.addEventListener("change", async () => {
    language = languageSelect.value === "en" ? "en" : "ja";
    await bridge.setLocalStorage(LANGUAGE_KEY, language);
    applyPhoneLanguage();
    scopeOptions = scopeOptionsForLibrary();
    updatePhoneUi(t("waiting"));
    if (mode === "menu") await renderMenu();
    else await renderReview();
  });

  fileInput.addEventListener("change", async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    updatePhoneUi(t("loadingFile", { name: file.name }));
    try {
      const imported = await parseDeckFile(file);
      library = [...library.filter((source) => source.sourceId !== imported.sourceId), imported];
      allCards = libraryCards(library);
      scopeOptions = scopeOptionsForLibrary();
      selectedScopeId = `source:${imported.sourceId}`;
      selectedSourceId = imported.sourceId;
      await saveLibrary();
      updatePhoneUi(t("importAdded", {
        name: imported.name,
        cards: imported.stats.cards,
        decks: imported.stats.decks
      }));
    } catch (error) {
      console.warn("G2 Recall import failed", error);
      updatePhoneUi(t("importFailed"));
    } finally {
      fileInput.value = "";
    }
  });

  saveTitleButton.addEventListener("click", async () => {
    const source = library.find((item) => item.sourceId === selectedSourceId);
    const title = titleInput.value.trim();
    if (!source) return;
    if (!title) {
      updatePhoneUi(t("titleRequired"));
      return;
    }
    source.title = title;
    source.name = title;
    scopeOptions = scopeOptionsForLibrary();
    await saveLibrary();
    updatePhoneUi(t("titleSaved", { name: title }));
  });

  scopeSelect.addEventListener("change", () => {
    selectedScopeId = scopeSelect.value;
    if (selectedScopeId.startsWith("source:") || selectedScopeId.startsWith("deck:")) {
      selectedSourceId = selectedScopeId.split(":")[1];
    } else {
      selectedSourceId = null;
    }
    updatePhoneUi(t("waiting"));
  });

  startButton.addEventListener("click", async () => {
    selectedScopeId = scopeSelect.value;
    startReview(selectedScopeId);
    await renderReview();
  });

  updatePhoneUi(t("waiting"));
}

async function grade(label) {
  const item = currentItem();
  if (!item) return;

  const reviewedAt = Date.now();
  reviews[item.card.id] = {
    ...scheduleCard(reviewForCard(reviews, item.card), label, reviewedAt),
    grade: label,
    reviewedAt
  };
  await saveReviews();

  if (label === "again" && item.againRepeats < MAX_AGAIN_REPEATS) {
    queue.push({ card: item.card, againRepeats: item.againRepeats + 1 });
    sessionTotal += 1;
  }

  position += 1;
  answerShown = false;
  await renderReview();
}

async function goPrevious() {
  if (position <= 0) return;
  position -= 1;
  answerShown = false;
  await renderReview();
}

async function exitApp() {
  // 0 exits immediately; 1 opens the host confirmation layer instead.
  const result = await bridge.shutDownPageContainer(1);
  if (result === false) console.warn("G2 Recall could not exit", result);
}

function eventTypeOf(envelope) {
  if (!envelope) return null;
  return OsEventTypeList.fromJson(envelope.eventType) ?? OsEventTypeList.CLICK_EVENT;
}

async function handleMenuEvent(event) {
  const sysType = eventTypeOf(event?.sysEvent);
  const textType = eventTypeOf(event?.textEvent);

  if (sysType === OsEventTypeList.DOUBLE_CLICK_EVENT || textType === OsEventTypeList.DOUBLE_CLICK_EVENT) {
    await exitApp();
    return;
  }

  if (textType === OsEventTypeList.SCROLL_TOP_EVENT || textType === OsEventTypeList.SCROLL_BOTTOM_EVENT) {
    const currentIndex = Math.max(scopeOptions.findIndex((scope) => scope.id === selectedScopeId), 0);
    const direction = textType === OsEventTypeList.SCROLL_TOP_EVENT ? -1 : 1;
    const nextIndex = (currentIndex + direction + scopeOptions.length) % scopeOptions.length;
    selectedScopeId = scopeOptions[nextIndex]?.id || selectedScopeId;
    await renderMenu();
    return;
  }

  if (sysType === OsEventTypeList.CLICK_EVENT || textType === OsEventTypeList.CLICK_EVENT) {
    startReview(selectedScopeId);
    await renderReview();
  }
}

async function handleReviewEvent(event) {
  const sysType = eventTypeOf(event?.sysEvent);
  const textType = eventTypeOf(event?.textEvent);

  if (sysType === OsEventTypeList.DOUBLE_CLICK_EVENT || textType === OsEventTypeList.DOUBLE_CLICK_EVENT) {
    if (answerShown) await grade("hard");
    else await exitApp();
    return;
  }

  if (sysType === OsEventTypeList.CLICK_EVENT || textType === OsEventTypeList.CLICK_EVENT) {
    if (!currentCard()) {
      mode = "menu";
      scopeOptions = scopeOptionsForLibrary();
      await renderMenu();
    } else if (!answerShown) {
      answerShown = true;
      await renderReview();
    } else {
      await grade("good");
    }
    return;
  }

  if (textType === OsEventTypeList.SCROLL_TOP_EVENT) {
    if (answerShown) await grade("easy");
    else await goPrevious();
    return;
  }

  if (textType === OsEventTypeList.SCROLL_BOTTOM_EVENT) {
    if (answerShown) await grade("again");
    return;
  }
}

async function main() {
  bridge = await waitForEvenAppBridge();
  await loadState();
  initPhoneUi();
  await renderMenu(true);

  bridge.onEvenHubEvent(async (event) => {
    try {
      if (mode === "menu") await handleMenuEvent(event);
      else await handleReviewEvent(event);
    } catch (error) {
      console.error("G2 Recall event failed", error);
    }
  });
}

main().catch((error) => {
  console.error("G2 Recall failed to start", error);
});

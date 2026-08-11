import {
  CreateStartUpPageContainer,
  OsEventTypeList,
  TextContainerProperty,
  TextContainerUpgrade,
  waitForEvenAppBridge
} from "@evenrealities/even_hub_sdk";
import { cards } from "./cards.js";

const CONTAINER_ID = 1;
const CONTAINER_NAME = "main";
const REVIEW_KEY = "g2-recall-even-reviews-v1";

let bridge;
let index = 0;
let answerShown = false;
let reviews = {};

function crop(value, max) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function currentCard() {
  return cards[index] || null;
}

function content() {
  const card = currentCard();
  if (!card) {
    return "G2 Recall\n\n全問完了\n\nTAP: 最初から\nDOUBLE: 終了";
  }

  const position = `${index + 1}/${cards.length}`;
  if (!answerShown) {
    return [
      `G2 Recall  ${position}`,
      card.deck,
      "",
      "Q  " + crop(card.front, 230),
      "",
      "TAP: 答え",
      "UP: Again  DOWN: Easy",
      "DOUBLE: 終了"
    ].join("\n");
  }

  return [
    `G2 Recall  ${position}`,
    card.deck,
    "",
    "Q  " + crop(card.front, 150),
    "A  " + crop(card.back, 190),
    "",
    "TAP: Good",
    "UP: Again  DOWN: Easy",
    "DOUBLE: Hard"
  ].join("\n");
}

async function saveReviews() {
  await bridge.setLocalStorage(REVIEW_KEY, JSON.stringify(reviews));
}

async function loadReviews() {
  try {
    const raw = await bridge.getLocalStorage(REVIEW_KEY);
    reviews = raw ? JSON.parse(raw) : {};
  } catch (error) {
    reviews = {};
  }
}

async function render(initial = false) {
  if (initial) {
    const result = await bridge.createStartUpPageContainer(
      new CreateStartUpPageContainer({
        containerTotalNum: 1,
        textObject: [
          new TextContainerProperty({
            xPosition: 0,
            yPosition: 0,
            width: 576,
            height: 288,
            borderWidth: 0,
            borderColor: 5,
            paddingLength: 4,
            containerID: CONTAINER_ID,
            containerName: CONTAINER_NAME,
            content: content(),
            isEventCapture: 1
          })
        ]
      })
    );
    if (result !== 0) console.error("G2 Recall startup failed", result);
    return;
  }

  await bridge.textContainerUpgrade(
    new TextContainerUpgrade({
      containerID: CONTAINER_ID,
      containerName: CONTAINER_NAME,
      content: content()
    })
  );
}

async function grade(label) {
  const card = currentCard();
  if (!card) {
    index = 0;
    answerShown = false;
    await render();
    return;
  }

  reviews[card.id] = {
    grade: label,
    reviewedAt: Date.now(),
    count: (reviews[card.id]?.count || 0) + 1
  };
  await saveReviews();
  index += 1;
  answerShown = false;
  await render();
}

function isEvent(event, type) {
  return event?.textEvent?.eventType === type;
}

async function main() {
  bridge = await waitForEvenAppBridge();
  await loadReviews();
  await render(true);

  bridge.onEvenHubEvent(async (event) => {
    const type = event?.textEvent?.eventType;
    const click = type === OsEventTypeList.CLICK_EVENT || type === undefined;

    if (click) {
      if (!currentCard()) {
        index = 0;
        answerShown = false;
        await render();
      } else if (!answerShown) {
        answerShown = true;
        await render();
      } else {
        await grade("good");
      }
      return;
    }

    if (isEvent(event, OsEventTypeList.SCROLL_TOP_EVENT)) {
      if (answerShown) await grade("again");
      return;
    }

    if (isEvent(event, OsEventTypeList.SCROLL_BOTTOM_EVENT)) {
      if (answerShown) await grade("easy");
      return;
    }

    if (isEvent(event, OsEventTypeList.DOUBLE_CLICK_EVENT)) {
      if (answerShown) {
        await grade("hard");
      } else {
        bridge.shutDownPageContainer(1);
      }
    }
  });
}

main().catch((error) => {
  console.error(error);
});

export const MINUTE_MS = 60 * 1000;
export const HOUR_MS = 60 * MINUTE_MS;
export const DAY_MS = 24 * HOUR_MS;

const LEARNING_STEPS_MS = [1 * MINUTE_MS, 10 * MINUTE_MS];
const RELEARNING_STEP_MS = 10 * MINUTE_MS;
const INITIAL_INTERVAL_DAYS = 1;
const EASY_INTERVAL_DAYS = 4;
const DEFAULT_EASE = 2.5;
const MIN_EASE = 1.3;
const MAX_EASE = 3.0;

function numberOr(value, fallback) {
  return Number.isFinite(Number(value)) ? Number(value) : fallback;
}

function clampEase(value) {
  return Math.min(MAX_EASE, Math.max(MIN_EASE, numberOr(value, DEFAULT_EASE)));
}

function inferState(review) {
  if (review?.state) return String(review.state);
  if (numberOr(review?.intervalDays, 0) > 0) return "review";
  if (review?.grade === "again") return "relearning";
  return "new";
}

export function normalizeReviewState(review = {}) {
  const state = inferState(review);
  const intervalDays = Math.max(0, Math.round(numberOr(review.intervalDays, numberOr(review.interval, 0))));
  const learningStep = Math.max(0, Math.round(numberOr(review.learningStep, 0)));

  return {
    ...review,
    state,
    learningStep,
    dueAt: Math.max(0, numberOr(review.dueAt, 0)),
    intervalDays,
    ease: clampEase(review.ease),
    reps: Math.max(0, Math.round(numberOr(review.reps, 0))),
    lapses: Math.max(0, Math.round(numberOr(review.lapses, 0)))
  };
}

export function reviewForCard(reviews, card) {
  return normalizeReviewState(reviews?.[card.id] || card?.schedule || {});
}

function dueIn(state, delayMs, now, values = {}) {
  return {
    ...state,
    ...values,
    dueAt: now + Math.max(MINUTE_MS, Math.round(delayMs))
  };
}

function learningSchedule(previous, label, now) {
  const step = Math.min(previous.learningStep, LEARNING_STEPS_MS.length - 1);

  if (label === "again") {
    return dueIn(previous, LEARNING_STEPS_MS[0], now, {
      state: "learning",
      learningStep: 0,
      intervalDays: 0,
      ease: Math.max(MIN_EASE, previous.ease - 0.15)
    });
  }

  if (label === "easy") {
    return dueIn(previous, EASY_INTERVAL_DAYS * DAY_MS, now, {
      state: "review",
      learningStep: 0,
      intervalDays: EASY_INTERVAL_DAYS,
      ease: Math.min(MAX_EASE, previous.ease + 0.15)
    });
  }

  if (label === "hard") {
    const hardDelay = step === 0 ? 6 * MINUTE_MS : LEARNING_STEPS_MS[step];
    return dueIn(previous, hardDelay, now, {
      state: "learning",
      learningStep: step,
      intervalDays: 0
    });
  }

  if (step < LEARNING_STEPS_MS.length - 1) {
    return dueIn(previous, LEARNING_STEPS_MS[step + 1], now, {
      state: "learning",
      learningStep: step + 1,
      intervalDays: 0
    });
  }

  return dueIn(previous, INITIAL_INTERVAL_DAYS * DAY_MS, now, {
    state: "review",
    learningStep: 0,
    intervalDays: INITIAL_INTERVAL_DAYS
  });
}

function relearningSchedule(previous, label, now) {
  if (label === "again") {
    return dueIn(previous, RELEARNING_STEP_MS, now, {
      state: "relearning",
      learningStep: 0
    });
  }

  if (label === "hard") {
    return dueIn(previous, RELEARNING_STEP_MS, now, {
      state: "relearning",
      learningStep: 0
    });
  }

  const recoveredInterval = Math.max(INITIAL_INTERVAL_DAYS, previous.intervalDays || INITIAL_INTERVAL_DAYS);
  if (label === "easy") {
    const easyInterval = Math.max(EASY_INTERVAL_DAYS, Math.round(recoveredInterval * previous.ease * 1.3));
    return dueIn(previous, easyInterval * DAY_MS, now, {
      state: "review",
      learningStep: 0,
      intervalDays: easyInterval,
      ease: Math.min(MAX_EASE, previous.ease + 0.15)
    });
  }

  return dueIn(previous, recoveredInterval * DAY_MS, now, {
    state: "review",
    learningStep: 0,
    intervalDays: recoveredInterval
  });
}

export function scheduleCard(previousInput = {}, label, now = Date.now()) {
  const previous = normalizeReviewState(previousInput);
  const reps = previous.reps + 1;

  if (previous.state === "new" || previous.state === "learning") {
    const next = learningSchedule(previous, label, now);
    return { ...next, reps, lapses: previous.lapses };
  }

  if (previous.state === "relearning") {
    const next = relearningSchedule(previous, label, now);
    return { ...next, reps, lapses: previous.lapses };
  }

  if (label === "again") {
    const lapseInterval = Math.max(INITIAL_INTERVAL_DAYS, Math.floor((previous.intervalDays || INITIAL_INTERVAL_DAYS) * 0.25));
    return dueIn(previous, RELEARNING_STEP_MS, now, {
      state: "relearning",
      learningStep: 0,
      intervalDays: lapseInterval,
      ease: Math.max(MIN_EASE, previous.ease - 0.2),
      lapses: previous.lapses + 1,
      reps
    });
  }

  if (label === "hard") {
    const intervalDays = Math.max(INITIAL_INTERVAL_DAYS, Math.round((previous.intervalDays || INITIAL_INTERVAL_DAYS) * 1.2));
    return dueIn(previous, intervalDays * DAY_MS, now, {
      state: "review",
      intervalDays,
      ease: Math.max(MIN_EASE, previous.ease - 0.15),
      reps
    });
  }

  if (label === "easy") {
    const intervalDays = Math.max(EASY_INTERVAL_DAYS, Math.round((previous.intervalDays || INITIAL_INTERVAL_DAYS) * previous.ease * 1.3));
    return dueIn(previous, intervalDays * DAY_MS, now, {
      state: "review",
      intervalDays,
      ease: Math.min(MAX_EASE, previous.ease + 0.15),
      reps
    });
  }

  const intervalDays = Math.max(INITIAL_INTERVAL_DAYS, Math.round((previous.intervalDays || INITIAL_INTERVAL_DAYS) * previous.ease));
  return dueIn(previous, intervalDays * DAY_MS, now, {
    state: "review",
    intervalDays,
    reps
  });
}

export function previewSchedule(previous, label, now = Date.now()) {
  return scheduleCard(previous, label, now);
}


(function () {
  "use strict";

  var STORAGE_KEY = "g2-recall-db-v1";
  var LEGACY_STORAGE_KEYS = ["anki-g2-db-v1"];
  var DAY = 24 * 60 * 60 * 1000;
  var MINUTE = 60 * 1000;
  var FLAG_ORDER = ["", "red", "amber", "green", "blue"];
  var VIEW_TITLES = {
    review: "復習",
    add: "カード追加",
    browse: "検索",
    stats: "統計",
    io: "入出力",
    settings: "設定"
  };

  var DEFAULT_SETTINGS = {
    newPerDay: 20,
    reviewPerDay: 200,
    rolloverHour: 4,
    burySiblings: true,
    againMinutes: 1,
    hardMinutes: 6,
    graduateDays: 1,
    easyDays: 4,
    maxIntervalDays: 36500
  };

  var state = {
    db: null,
    selectedDeckId: "all",
    view: "review",
    currentCardId: null,
    answerShown: false,
    reviewStartAt: 0,
    editNoteId: null,
    addModel: "basic",
    browserQuery: "",
    customMode: null,
    lastUndo: null,
    toastTimer: null,
    lastFocusField: null
  };

  var $ = function (selector, root) {
    return (root || document).querySelector(selector);
  };

  var $$ = function (selector, root) {
    return Array.prototype.slice.call((root || document).querySelectorAll(selector));
  };

  function uid(prefix) {
    return prefix + "-" + Math.random().toString(36).slice(2, 9) + "-" + Date.now().toString(36);
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function now() {
    return Date.now();
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (char) {
      return {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
      }[char];
    });
  }

  function normalizeText(value) {
    return String(value == null ? "" : value).trim();
  }

  function sanitizeFileName(name) {
    var base = String(name || "media").replace(/[^\w.-]+/g, "_");
    if (base.length > 96) {
      var dot = base.lastIndexOf(".");
      var ext = dot > -1 ? base.slice(dot) : "";
      base = base.slice(0, 80) + ext;
    }
    return base || uid("media");
  }

  function uniqueMediaName(name) {
    var clean = sanitizeFileName(name);
    if (!state.db.media[clean]) return clean;
    var dot = clean.lastIndexOf(".");
    var stem = dot > -1 ? clean.slice(0, dot) : clean;
    var ext = dot > -1 ? clean.slice(dot) : "";
    var i = 2;
    var candidate = stem + "-" + i + ext;
    while (state.db.media[candidate]) {
      i += 1;
      candidate = stem + "-" + i + ext;
    }
    return candidate;
  }

  function createDb() {
    var deckId = uid("deck");
    var createdAt = now();
    return {
      version: 1,
      createdAt: createdAt,
      updatedAt: createdAt,
      settings: clone(DEFAULT_SETTINGS),
      decks: [
        {
          id: deckId,
          name: "デフォルト",
          description: "",
          newPerDay: null,
          reviewPerDay: null,
          createdAt: createdAt
        }
      ],
      notes: [],
      cards: [],
      reviews: [],
      media: {}
    };
  }

  function loadDb() {
    var raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      for (var i = 0; i < LEGACY_STORAGE_KEYS.length; i += 1) {
        raw = localStorage.getItem(LEGACY_STORAGE_KEYS[i]);
        if (raw) break;
      }
    }
    if (!raw) return migrateDb(createDb());

    try {
      return migrateDb(JSON.parse(raw));
    } catch (error) {
      console.error(error);
      toast("保存データを読めなかったため、新しいデータで開始しました");
      return migrateDb(createDb());
    }
  }

  function migrateDb(db) {
    var fallback = createDb();
    db = db && typeof db === "object" ? db : fallback;
    db.version = 1;
    db.createdAt = db.createdAt || now();
    db.updatedAt = db.updatedAt || now();
    db.settings = Object.assign({}, DEFAULT_SETTINGS, db.settings || {});
    db.decks = Array.isArray(db.decks) ? db.decks : fallback.decks;
    db.notes = Array.isArray(db.notes) ? db.notes : [];
    db.cards = Array.isArray(db.cards) ? db.cards : [];
    db.reviews = Array.isArray(db.reviews) ? db.reviews : [];
    db.media = db.media && typeof db.media === "object" ? db.media : {};

    if (!db.decks.length) {
      db.decks.push(fallback.decks[0]);
    }

    db.decks.forEach(function (deck) {
      deck.id = deck.id || uid("deck");
      deck.name = normalizeText(deck.name) || "デフォルト";
      deck.description = deck.description || "";
      deck.createdAt = deck.createdAt || now();
      if (deck.newPerDay === undefined) deck.newPerDay = null;
      if (deck.reviewPerDay === undefined) deck.reviewPerDay = null;
    });

    var defaultDeckId = db.decks[0].id;
    db.notes.forEach(function (note) {
      note.id = note.id || uid("note");
      note.deckId = deckById(note.deckId, db) ? note.deckId : defaultDeckId;
      note.model = ["basic", "reverse", "cloze"].indexOf(note.model) > -1 ? note.model : "basic";
      note.fields = note.fields && typeof note.fields === "object" ? note.fields : {};
      note.tags = Array.isArray(note.tags) ? note.tags : splitTags(note.tags || "");
      note.createdAt = note.createdAt || now();
      note.updatedAt = note.updatedAt || note.createdAt;
    });

    db.cards.forEach(function (card) {
      card.id = card.id || uid("card");
      card.noteId = card.noteId || "";
      card.deckId = deckById(card.deckId, db) ? card.deckId : defaultDeckId;
      card.ordinal = Number(card.ordinal || 0);
      card.templateName = card.templateName || "Card";
      card.state = ["new", "learning", "review", "relearning"].indexOf(card.state) > -1 ? card.state : "new";
      card.due = Number(card.due || card.createdAt || now());
      card.interval = Number(card.interval || 0);
      card.ease = Number(card.ease || 250);
      card.reps = Number(card.reps || 0);
      card.lapses = Number(card.lapses || 0);
      card.suspended = Boolean(card.suspended);
      card.buriedUntil = Number(card.buriedUntil || 0);
      card.flag = card.flag || "";
      card.createdAt = card.createdAt || now();
    });

    syncAllCards(db);
    return db;
  }

  function saveDb() {
    state.db.updatedAt = now();
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state.db));
      updateStorageStatus();
      return true;
    } catch (error) {
      console.error(error);
      toast("保存容量が足りません。JSONでバックアップしてメディアを減らしてください");
      return false;
    }
  }

  function deckById(id, db) {
    var source = db || state.db;
    return source.decks.find(function (deck) {
      return deck.id === id;
    });
  }

  function noteById(id) {
    return state.db.notes.find(function (note) {
      return note.id === id;
    });
  }

  function cardById(id) {
    return state.db.cards.find(function (card) {
      return card.id === id;
    });
  }

  function selectedDeck() {
    return state.selectedDeckId === "all" ? null : deckById(state.selectedDeckId);
  }

  function selectedDeckName() {
    var deck = selectedDeck();
    return deck ? deck.name : "全デッキ";
  }

  function splitTags(value) {
    if (Array.isArray(value)) {
      return value.map(normalizeText).filter(Boolean);
    }
    return normalizeText(value)
      .split(/[,\s]+/)
      .map(normalizeText)
      .filter(Boolean)
      .filter(function (tag, index, list) {
        return list.indexOf(tag) === index;
      });
  }

  function tagsToText(tags) {
    return (tags || []).join(" ");
  }

  function parseClozeNumbers(text) {
    var found = {};
    var regex = /\{\{c(\d+)::([\s\S]*?)(?:::([\s\S]*?))?\}\}/g;
    var match;
    while ((match = regex.exec(text || ""))) {
      found[Number(match[1])] = true;
    }
    return Object.keys(found)
      .map(Number)
      .sort(function (a, b) {
        return a - b;
      });
  }

  function desiredCardsForNote(note) {
    if (note.model === "reverse") {
      return [
        { ordinal: 0, templateName: "表 -> 裏" },
        { ordinal: 1, templateName: "裏 -> 表" }
      ];
    }

    if (note.model === "cloze") {
      return parseClozeNumbers(note.fields.text).map(function (number) {
        return { ordinal: number, templateName: "穴埋め c" + number };
      });
    }

    return [{ ordinal: 0, templateName: "表 -> 裏" }];
  }

  function syncAllCards(db) {
    db.notes.forEach(function (note) {
      syncCardsForNote(note, db);
    });

    var noteIds = {};
    db.notes.forEach(function (note) {
      noteIds[note.id] = true;
    });
    db.cards = db.cards.filter(function (card) {
      return noteIds[card.noteId];
    });
  }

  function syncCardsForNote(note, db) {
    var source = db || state.db;
    var desired = desiredCardsForNote(note);
    var existing = source.cards.filter(function (card) {
      return card.noteId === note.id;
    });

    desired.forEach(function (item) {
      var card = existing.find(function (candidate) {
        return candidate.ordinal === item.ordinal;
      });
      if (!card) {
        source.cards.push({
          id: uid("card"),
          noteId: note.id,
          deckId: note.deckId,
          ordinal: item.ordinal,
          templateName: item.templateName,
          state: "new",
          due: note.createdAt || now(),
          interval: 0,
          ease: 250,
          reps: 0,
          lapses: 0,
          suspended: false,
          buriedUntil: 0,
          flag: "",
          createdAt: now()
        });
      } else {
        card.deckId = note.deckId;
        card.templateName = item.templateName;
      }
    });

    var desiredOrdinals = desired.map(function (item) {
      return item.ordinal;
    });
    source.cards = source.cards.filter(function (card) {
      return card.noteId !== note.id || desiredOrdinals.indexOf(card.ordinal) > -1;
    });
  }

  function notePreview(note) {
    if (!note) return "";
    if (note.model === "cloze") {
      return plainText(note.fields.text || "");
    }
    return plainText((note.fields.front || "") + " " + (note.fields.back || ""));
  }

  function plainText(value) {
    return String(value || "")
      .replace(/\{\{c\d+::(.*?)(?:::.*?)?\}\}/g, "$1")
      .replace(/!\[[^\]]*]\([^)]+\)/g, "[media]")
      .replace(/\[sound:[^\]]+]/g, "[sound]")
      .replace(/[*_`>#-]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function formatContent(value) {
    return applyRichMarkup(escapeHtml(value || ""));
  }

  function applyRichMarkup(html) {
    var output = html;

    output = output.replace(/!\[([^\]]*)]\((media:([^)]+)|https?:\/\/[^)]+|data:image\/[^)]+)\)/g, function (all, alt, src, mediaName) {
      var actualSrc = src;
      if (mediaName) {
        var media = state.db.media[mediaName];
        if (!media) return '<span class="pill red">missing media</span>';
        actualSrc = media.data;
      }
      return '<img alt="' + escapeHtml(alt || "media") + '" src="' + actualSrc + '">';
    });

    output = output.replace(/\[sound:([^\]]+)]/g, function (all, mediaName) {
      var media = state.db.media[mediaName];
      if (!media) return '<span class="pill red">missing sound</span>';
      return '<audio controls preload="none" src="' + media.data + '"></audio>';
    });

    output = output.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    output = output.replace(/`([^`]+)`/g, "<code>$1</code>");
    output = output.replace(/\n/g, "<br>");
    return output;
  }

  function renderCloze(text, targetNumber, showAnswer) {
    var regex = /\{\{c(\d+)::([\s\S]*?)(?:::([\s\S]*?))?\}\}/g;
    var output = "";
    var lastIndex = 0;
    var match;

    while ((match = regex.exec(text || ""))) {
      output += escapeHtml(text.slice(lastIndex, match.index));
      var number = Number(match[1]);
      var answer = match[2] || "";
      var hint = match[3] || "";
      if (number === targetNumber) {
        if (showAnswer) {
          output += '<mark class="cloze-answer">' + escapeHtml(answer) + "</mark>";
        } else {
          output += '<span class="cloze-blank">' + escapeHtml(hint || "...") + "</span>";
        }
      } else {
        output += escapeHtml(answer);
      }
      lastIndex = regex.lastIndex;
    }

    output += escapeHtml((text || "").slice(lastIndex));
    return applyRichMarkup(output);
  }

  function cardSides(card) {
    var note = noteById(card.noteId);
    if (!note) {
      return { question: "ノートが見つかりません", answer: "" };
    }

    if (note.model === "cloze") {
      return {
        question: renderCloze(note.fields.text || "", card.ordinal, false),
        answer: renderCloze(note.fields.text || "", card.ordinal, true) + extraBlock(note.fields.extra)
      };
    }

    var front = note.fields.front || "";
    var back = note.fields.back || "";
    if (note.model === "reverse" && card.ordinal === 1) {
      return {
        question: formatContent(back),
        answer: formatContent(front) + extraBlock(note.fields.extra)
      };
    }

    return {
      question: formatContent(front),
      answer: formatContent(back) + extraBlock(note.fields.extra)
    };
  }

  function extraBlock(extra) {
    if (!normalizeText(extra)) return "";
    return '<div class="extra-block">' + formatContent(extra) + "</div>";
  }

  function startOfToday() {
    var date = new Date();
    var rollover = Number(state.db.settings.rolloverHour || 0);
    date.setHours(rollover, 0, 0, 0);
    if (now() < date.getTime()) {
      date.setDate(date.getDate() - 1);
    }
    return date.getTime();
  }

  function startOfTomorrow() {
    return startOfToday() + DAY;
  }

  function inSelectedDeck(card, deckId) {
    return deckId === "all" || card.deckId === deckId;
  }

  function isBuried(card) {
    return Number(card.buriedUntil || 0) > now();
  }

  function isAvailable(card) {
    return !card.suspended && !isBuried(card);
  }

  function reviewsToday(deckId) {
    var start = startOfToday();
    return state.db.reviews.filter(function (review) {
      return review.reviewedAt >= start && inDeckId(review.deckId, deckId);
    });
  }

  function inDeckId(actualDeckId, filterDeckId) {
    return filterDeckId === "all" || actualDeckId === filterDeckId;
  }

  function dailyLimit(deckId, type) {
    var settingsKey = type === "new" ? "newPerDay" : "reviewPerDay";
    var deck = deckId === "all" ? null : deckById(deckId);
    var deckValue = deck ? deck[settingsKey] : null;
    var value = deckValue == null || deckValue === "" ? state.db.settings[settingsKey] : deckValue;
    return Math.max(0, Number(value || 0));
  }

  function todayCount(deckId, type) {
    return reviewsToday(deckId).filter(function (review) {
      if (type === "new") return review.fromState === "new";
      return review.fromState !== "new";
    }).length;
  }

  function deckCounts(deckId) {
    var current = now();
    var cards = state.db.cards.filter(function (card) {
      return inSelectedDeck(card, deckId) && !card.suspended;
    });
    return {
      new: cards.filter(function (card) {
        return card.state === "new" && !isBuried(card);
      }).length,
      due: cards.filter(function (card) {
        return card.state === "review" && card.due <= current && !isBuried(card);
      }).length,
      learn: cards.filter(function (card) {
        return (card.state === "learning" || card.state === "relearning") && card.due <= current && !isBuried(card);
      }).length,
      suspended: cards.filter(function (card) {
        return card.suspended;
      }).length
    };
  }

  function eligibleCards(deckId) {
    var current = now();
    var baseCards = state.db.cards.filter(function (card) {
      return inSelectedDeck(card, deckId) && isAvailable(card);
    });

    if (state.customMode) {
      var idSet = {};
      state.customMode.ids.forEach(function (id) {
        idSet[id] = true;
      });
      return baseCards
        .filter(function (card) {
          return idSet[card.id];
        })
        .sort(cardSort);
    }

    var learning = baseCards
      .filter(function (card) {
        return (card.state === "learning" || card.state === "relearning") && card.due <= current;
      })
      .sort(cardSort);

    var reviewRemaining = Math.max(0, dailyLimit(deckId, "review") - todayCount(deckId, "review"));
    var review = baseCards
      .filter(function (card) {
        return card.state === "review" && card.due <= current;
      })
      .sort(cardSort)
      .slice(0, reviewRemaining);

    var newRemaining = Math.max(0, dailyLimit(deckId, "new") - todayCount(deckId, "new"));
    var fresh = baseCards
      .filter(function (card) {
        return card.state === "new";
      })
      .sort(cardSort)
      .slice(0, newRemaining);

    return learning.concat(review, fresh);
  }

  function cardSort(a, b) {
    if (a.due !== b.due) return a.due - b.due;
    return a.createdAt - b.createdAt;
  }

  function nextCard(deckId) {
    var queue = eligibleCards(deckId);
    if (!queue.length) return null;
    if (state.currentCardId) {
      var current = queue.find(function (card) {
        return card.id === state.currentCardId;
      });
      if (current) return current;
    }
    return queue[0];
  }

  function setCurrentCard(card) {
    if (!card) {
      state.currentCardId = null;
      state.reviewStartAt = 0;
      return;
    }
    if (state.currentCardId !== card.id) {
      state.currentCardId = card.id;
      state.answerShown = false;
      state.reviewStartAt = now();
    }
  }

  function schedulePreview(card, grade) {
    var copy = clone(card);
    applySchedule(copy, grade);
    return dueLabel(copy.due);
  }

  function applySchedule(card, grade) {
    var settings = state.db.settings;
    var current = now();
    var ease = Number(card.ease || 250);
    var interval = Math.max(0, Number(card.interval || 0));
    var nextInterval = interval;

    if (card.state === "new") {
      if (grade === 1) {
        card.state = "learning";
        card.due = current + Number(settings.againMinutes || 1) * MINUTE;
        nextInterval = 0;
      } else if (grade === 2) {
        card.state = "learning";
        card.due = current + Number(settings.hardMinutes || 6) * MINUTE;
        nextInterval = 0;
        ease = Math.max(130, ease - 15);
      } else if (grade === 3) {
        card.state = "review";
        nextInterval = Number(settings.graduateDays || 1);
        card.due = current + nextInterval * DAY;
      } else {
        card.state = "review";
        nextInterval = Number(settings.easyDays || 4);
        ease = Math.min(400, ease + 15);
        card.due = current + nextInterval * DAY;
      }
    } else if (card.state === "learning" || card.state === "relearning") {
      if (grade === 1) {
        card.due = current + Number(settings.againMinutes || 1) * MINUTE;
        nextInterval = 0;
      } else if (grade === 2) {
        card.due = current + Number(settings.hardMinutes || 6) * MINUTE;
        nextInterval = 0;
      } else if (grade === 3) {
        card.state = "review";
        nextInterval = Math.max(1, interval || Number(settings.graduateDays || 1));
        card.due = current + nextInterval * DAY;
      } else {
        card.state = "review";
        nextInterval = Math.max(Number(settings.easyDays || 4), interval + 1);
        ease = Math.min(400, ease + 15);
        card.due = current + nextInterval * DAY;
      }
    } else {
      if (grade === 1) {
        card.state = "relearning";
        card.lapses = Number(card.lapses || 0) + 1;
        ease = Math.max(130, ease - 20);
        nextInterval = 0;
        card.due = current + Number(settings.againMinutes || 1) * MINUTE;
      } else if (grade === 2) {
        card.state = "review";
        ease = Math.max(130, ease - 15);
        nextInterval = Math.max(1, Math.round(Math.max(1, interval) * 1.2));
        card.due = current + nextInterval * DAY;
      } else if (grade === 3) {
        card.state = "review";
        nextInterval = Math.max(1, Math.round(Math.max(1, interval) * (ease / 100)));
        card.due = current + nextInterval * DAY;
      } else {
        card.state = "review";
        ease = Math.min(400, ease + 15);
        nextInterval = Math.max(4, Math.round(Math.max(1, interval) * (ease / 100) * 1.3));
        card.due = current + nextInterval * DAY;
      }
    }

    card.ease = ease;
    card.interval = Math.min(Number(settings.maxIntervalDays || 36500), Math.max(0, nextInterval));
    card.reps = Number(card.reps || 0) + 1;
    card.lastReviewedAt = current;
  }

  function dueLabel(timestamp) {
    var delta = Number(timestamp || 0) - now();
    if (delta <= 0) return "今";
    if (delta < 60 * MINUTE) return Math.max(1, Math.round(delta / MINUTE)) + "分";
    if (delta < DAY) return Math.round(delta / (60 * MINUTE)) + "時間";
    if (delta < DAY * 60) return Math.round(delta / DAY) + "日";
    return new Date(timestamp).toLocaleDateString("ja-JP");
  }

  function stateLabel(card) {
    if (card.suspended) return "保留";
    if (isBuried(card)) return "埋め";
    return {
      new: "新規",
      learning: "学習",
      review: "復習",
      relearning: "再学習"
    }[card.state] || card.state;
  }

  function gradeLabel(grade) {
    return {
      1: "Again",
      2: "Hard",
      3: "Good",
      4: "Easy"
    }[grade];
  }

  function render() {
    renderShell();
    renderDecks();
    renderView();
    updateStorageStatus();
  }

  function renderShell() {
    $("#activeDeckLabel").textContent = selectedDeckName();
    $("#viewTitle").textContent = VIEW_TITLES[state.view] || "復習";

    $$("#tabs button").forEach(function (button) {
      button.classList.toggle("active", button.dataset.view === state.view);
    });
  }

  function renderDecks() {
    var total = deckCounts("all");
    $("#todayStrip").innerHTML =
      '<div class="mini-stat"><strong>' +
      total.learn +
      '</strong><span>学習</span></div><div class="mini-stat"><strong>' +
      total.due +
      '</strong><span>期限</span></div><div class="mini-stat"><strong>' +
      total.new +
      '</strong><span>新規</span></div>';

    var allActive = state.selectedDeckId === "all" ? " active" : "";
    var html =
      '<button class="deck-button' +
      allActive +
      '" data-deck-id="all"><span class="deck-name">全デッキ</span>' +
      countPills(total) +
      "</button>";

    state.db.decks
      .slice()
      .sort(function (a, b) {
        return a.name.localeCompare(b.name, "ja");
      })
      .forEach(function (deck) {
        var counts = deckCounts(deck.id);
        html +=
          '<button class="deck-button' +
          (state.selectedDeckId === deck.id ? " active" : "") +
          '" data-deck-id="' +
          deck.id +
          '"><span class="deck-name">' +
          escapeHtml(deck.name) +
          "</span>" +
          countPills(counts) +
          "</button>";
      });

    $("#deckList").innerHTML = html;
  }

  function countPills(counts) {
    return (
      '<span class="deck-counts">' +
      (counts.learn ? '<span class="pill learn">' + counts.learn + "</span>" : "") +
      (counts.due ? '<span class="pill due">' + counts.due + "</span>" : "") +
      (counts.new ? '<span class="pill new">' + counts.new + "</span>" : "") +
      (counts.suspended ? '<span class="pill red">' + counts.suspended + "</span>" : "") +
      "</span>"
    );
  }

  function renderView() {
    var content = $("#content");
    if (state.view === "add") {
      content.innerHTML = renderAddView();
    } else if (state.view === "browse") {
      content.innerHTML = renderBrowseView();
    } else if (state.view === "stats") {
      content.innerHTML = renderStatsView();
    } else if (state.view === "io") {
      content.innerHTML = renderIoView();
    } else if (state.view === "settings") {
      content.innerHTML = renderSettingsView();
    } else {
      content.innerHTML = renderReviewView();
    }
  }

  function renderReviewView() {
    var deckId = state.selectedDeckId;
    var queue = eligibleCards(deckId);
    var card = nextCard(deckId);
    setCurrentCard(card);
    var counts = deckCounts(deckId);
    var custom = state.customMode
      ? '<span class="pill due">カスタム: ' + escapeHtml(state.customMode.label) + "</span>"
      : "";

    if (!card) {
      return (
        '<div class="workspace">' +
        '<section class="panel pad stack">' +
        '<div class="row between"><div><h3>今日のカードはありません</h3><p class="muted">学習 ' +
        counts.learn +
        " / 期限 " +
        counts.due +
        " / 新規 " +
        counts.new +
        "</p></div>" +
        (state.customMode ? '<button data-action="clear-custom">通常に戻す</button>' : "") +
        "</div>" +
        '<div class="toolbar">' +
        '<button data-custom="due">期限だけ</button>' +
        '<button data-custom="all">全カード</button>' +
        '<button data-custom="flagged">フラグ</button>' +
        '<button data-custom="mistakes">苦手</button>' +
        '<button data-view-jump="add" class="primary">追加</button>' +
        "</div></section></div>"
      );
    }

    var sides = cardSides(card);
    var flagClass = card.flag ? " flag-" + card.flag : "";
    var previews = [1, 2, 3, 4]
      .map(function (grade) {
        return (
          '<button class="grade-button grade-' +
          ["", "again", "hard", "good", "easy"][grade] +
          '" data-grade="' +
          grade +
          '"><strong>' +
          gradeLabel(grade) +
          '</strong><span>' +
          schedulePreview(card, grade) +
          "</span></button>"
        );
      })
      .join("");

    return (
      '<div class="workspace">' +
      '<section class="panel card-stage">' +
      '<div class="review-meta">' +
      '<div class="row"><span class="pill learn">学習 ' +
      counts.learn +
      '</span><span class="pill due">期限 ' +
      counts.due +
      '</span><span class="pill new">新規 ' +
      counts.new +
      "</span>" +
      custom +
      "</div>" +
      '<div class="row"><span class="flag-dot' +
      flagClass +
      '"></span><span>' +
      escapeHtml(stateLabel(card)) +
      " / " +
      escapeHtml(card.templateName) +
      " / " +
      queue.length +
      "枚</span></div>" +
      "</div>" +
      '<div class="card-face"><div class="card-content">' +
      sides.question +
      "</div>" +
      (state.answerShown ? '<div class="card-content answer">' + sides.answer + "</div>" : "") +
      "</div>" +
      '<div class="card-actions">' +
      (state.answerShown
        ? previews
        : '<button class="primary" data-action="show-answer">答え</button>') +
      '<button data-action="bury-card" title="今日だけ隠す">埋める</button>' +
      '<button data-action="toggle-suspend" title="復習対象から外す">保留</button>' +
      '<button data-action="cycle-flag" title="フラグを切り替え">旗</button>' +
      '<button data-action="edit-current" title="ノートを編集">編集</button>' +
      (state.lastUndo ? '<button data-action="undo">戻す</button>' : "") +
      (state.customMode ? '<button data-action="clear-custom">通常</button>' : "") +
      "</div>" +
      "</section>" +
      renderCustomStudyPanel() +
      "</div>"
    );
  }

  function renderCustomStudyPanel() {
    return (
      '<section class="panel pad row between">' +
      '<div><strong>カスタム学習</strong><p class="help-line">通常キューに加えて一時的な範囲で復習できます。</p></div>' +
      '<div class="toolbar">' +
      '<button data-custom="due">期限</button>' +
      '<button data-custom="new">新規</button>' +
      '<button data-custom="flagged">フラグ</button>' +
      '<button data-custom="mistakes">苦手</button>' +
      '<button data-custom="all">全カード</button>' +
      "</div></section>"
    );
  }

  function renderAddView() {
    var editNote = state.editNoteId ? noteById(state.editNoteId) : null;
    var model = editNote ? editNote.model : state.addModel;
    var deckId = editNote ? editNote.deckId : state.selectedDeckId === "all" ? state.db.decks[0].id : state.selectedDeckId;
    var fields = editNote ? editNote.fields : {};
    var title = editNote ? "ノート編集" : "ノート追加";

    return (
      '<div class="workspace"><form class="panel pad form-section" id="noteForm">' +
      '<div class="row between"><h3>' +
      title +
      '</h3><div class="toolbar">' +
      (editNote ? '<button type="button" data-action="cancel-edit">キャンセル</button>' : "") +
      '<button class="primary" type="submit">保存</button></div></div>' +
      '<div class="grid-3">' +
      '<label>デッキ<select name="deckId">' +
      deckOptions(deckId) +
      "</select></label>" +
      '<label>ノート種別<select name="model" id="noteModel">' +
      option("basic", "基本", model) +
      option("reverse", "表裏反転", model) +
      option("cloze", "穴埋め", model) +
      "</select></label>" +
      '<label>タグ<input name="tags" value="' +
      escapeHtml(tagsToText(editNote ? editNote.tags : [])) +
      '" placeholder="英語 exam chapter1"></label>' +
      "</div>" +
      '<div class="note-fields">' +
      noteFieldsHtml(model, fields) +
      "</div>" +
      '<div class="row between">' +
      '<label class="media-label">メディア<input id="mediaFiles" type="file" multiple></label>' +
      '<p class="help-line">穴埋めは {{c1::答え::ヒント}} の形で書けます。</p>' +
      "</div>" +
      "</form></div>"
    );
  }

  function deckOptions(selectedId) {
    return state.db.decks
      .slice()
      .sort(function (a, b) {
        return a.name.localeCompare(b.name, "ja");
      })
      .map(function (deck) {
        return option(deck.id, deck.name, selectedId);
      })
      .join("");
  }

  function option(value, label, selected) {
    return (
      '<option value="' +
      escapeHtml(value) +
      '"' +
      (value === selected ? " selected" : "") +
      ">" +
      escapeHtml(label) +
      "</option>"
    );
  }

  function noteFieldsHtml(model, fields) {
    if (model === "cloze") {
      return (
        '<label>本文<textarea name="text" data-note-field="text">' +
        escapeHtml(fields.text || "") +
        "</textarea></label>" +
        '<label>補足<textarea name="extra" data-note-field="extra">' +
        escapeHtml(fields.extra || "") +
        "</textarea></label>"
      );
    }

    return (
      '<label>表<textarea name="front" data-note-field="front">' +
      escapeHtml(fields.front || "") +
      "</textarea></label>" +
      '<label>裏<textarea name="back" data-note-field="back">' +
      escapeHtml(fields.back || "") +
      "</textarea></label>" +
      '<label>補足<textarea name="extra" data-note-field="extra">' +
      escapeHtml(fields.extra || "") +
      "</textarea></label>"
    );
  }

  function renderBrowseView() {
    var rows = searchRows(state.browserQuery);
    var shown = rows.slice(0, 500);
    var tableRows = shown
      .map(function (row) {
        var note = row.note;
        var card = row.card;
        var deck = deckById(card.deckId);
        return (
          "<tr>" +
          '<td><span class="flag-dot' +
          (card.flag ? " flag-" + card.flag : "") +
          '"></span></td>' +
          "<td>" +
          escapeHtml(deck ? deck.name : "") +
          "</td>" +
          "<td>" +
          escapeHtml(note.model) +
          "</td>" +
          "<td>" +
          escapeHtml(stateLabel(card)) +
          "</td>" +
          "<td>" +
          escapeHtml(dueLabel(card.due)) +
          "</td>" +
          '<td class="preview" title="' +
          escapeHtml(notePreview(note)) +
          '">' +
          escapeHtml(notePreview(note)) +
          "</td>" +
          "<td>" +
          escapeHtml(tagsToText(note.tags)) +
          "</td>" +
          '<td><div class="toolbar">' +
          '<button data-edit-note="' +
          note.id +
          '">編集</button>' +
          '<button data-card-action="toggle-suspend" data-card-id="' +
          card.id +
          '">' +
          (card.suspended ? "解除" : "保留") +
          "</button>" +
          '<button data-card-action="cycle-flag" data-card-id="' +
          card.id +
          '">旗</button>' +
          '<button class="danger" data-delete-note="' +
          note.id +
          '">削除</button>' +
          "</div></td>" +
          "</tr>"
        );
      })
      .join("");

    return (
      '<div class="workspace">' +
      '<section class="panel pad stack">' +
      '<div class="searchbar"><input id="browserQuery" value="' +
      escapeHtml(state.browserQuery) +
      '" placeholder="tag:英語 deck:デフォルト is:due flag:red"><button data-action="clear-search">消去</button></div>' +
      '<div class="row between"><p class="muted">' +
      rows.length +
      "件" +
      (rows.length > 500 ? " / 500件表示" : "") +
      '</p><div class="toolbar"><button data-bulk="unsuspend">保留解除</button><button data-bulk="bury">今日埋める</button></div></div>' +
      '<div class="table-wrap"><table><thead><tr><th>旗</th><th>デッキ</th><th>種別</th><th>状態</th><th>次回</th><th>内容</th><th>タグ</th><th>操作</th></tr></thead><tbody>' +
      (tableRows || '<tr><td colspan="8">該当なし</td></tr>') +
      "</tbody></table></div>" +
      "</section></div>"
    );
  }

  function searchRows(query) {
    var tokens = parseSearch(query);
    return state.db.cards
      .map(function (card) {
        return { card: card, note: noteById(card.noteId) };
      })
      .filter(function (row) {
        return row.note && inSelectedDeck(row.card, state.selectedDeckId) && rowMatches(row, tokens);
      })
      .sort(function (a, b) {
        return cardSort(a.card, b.card);
      });
  }

  function parseSearch(query) {
    var parts = normalizeText(query).match(/"[^"]+"|\S+/g) || [];
    return parts.map(function (part) {
      return part.replace(/^"|"$/g, "").toLowerCase();
    });
  }

  function rowMatches(row, tokens) {
    return tokens.every(function (token) {
      var note = row.note;
      var card = row.card;
      var deck = deckById(card.deckId);
      if (token.indexOf("tag:") === 0) {
        var tag = token.slice(4);
        return note.tags.some(function (item) {
          return item.toLowerCase() === tag;
        });
      }
      if (token.indexOf("deck:") === 0) {
        var deckNeedle = token.slice(5);
        return deck && deck.name.toLowerCase().indexOf(deckNeedle) > -1;
      }
      if (token.indexOf("flag:") === 0) {
        return String(card.flag || "").toLowerCase() === token.slice(5);
      }
      if (token.indexOf("model:") === 0) {
        return note.model.toLowerCase() === token.slice(6);
      }
      if (token.indexOf("is:") === 0) {
        return isQuery(card, token.slice(3));
      }
      var haystack = [
        deck ? deck.name : "",
        note.model,
        notePreview(note),
        tagsToText(note.tags),
        card.templateName,
        stateLabel(card)
      ]
        .join(" ")
        .toLowerCase();
      return haystack.indexOf(token) > -1;
    });
  }

  function isQuery(card, value) {
    if (value === "new") return card.state === "new";
    if (value === "due") return card.due <= now() && card.state !== "new";
    if (value === "review") return card.state === "review";
    if (value === "learn" || value === "learning") return card.state === "learning" || card.state === "relearning";
    if (value === "suspended") return card.suspended;
    if (value === "buried") return isBuried(card);
    if (value === "flagged") return Boolean(card.flag);
    return false;
  }

  function renderStatsView() {
    var deckId = state.selectedDeckId;
    var cards = state.db.cards.filter(function (card) {
      return inSelectedDeck(card, deckId);
    });
    var reviews = state.db.reviews.filter(function (review) {
      return inDeckId(review.deckId, deckId);
    });
    var recentReviews = reviews.filter(function (review) {
      return review.reviewedAt >= now() - 30 * DAY;
    });
    var correct = recentReviews.filter(function (review) {
      return review.grade > 1;
    }).length;
    var retention = recentReviews.length ? Math.round((correct / recentReviews.length) * 100) : 0;
    var mature = cards.filter(function (card) {
      return card.interval >= 21 && card.state === "review";
    }).length;
    var due = deckCounts(deckId);

    return (
      '<div class="workspace">' +
      '<section class="stat-grid">' +
      statBox("カード", cards.length) +
      statBox("期限", due.learn + due.due) +
      statBox("定着率", retention + "%") +
      statBox("成熟", mature) +
      "</section>" +
      '<section class="split">' +
      '<div class="panel pad stack"><h3>今後の期限</h3>' +
      renderDueBars(cards) +
      "</div>" +
      '<div class="panel pad stack"><h3>状態</h3>' +
      renderStateBars(cards) +
      "</div></section>" +
      '<section class="panel pad stack"><h3>復習ヒートマップ</h3><div class="heatmap">' +
      renderHeatmap(reviews) +
      "</div></section>" +
      "</div>"
    );
  }

  function statBox(label, value) {
    return '<div class="stat-box"><strong>' + escapeHtml(value) + "</strong><span>" + escapeHtml(label) + "</span></div>";
  }

  function renderDueBars(cards) {
    var current = now();
    var buckets = [
      ["今日", cards.filter(function (card) { return card.due <= current && card.state !== "new" && !card.suspended; }).length],
      ["明日", cards.filter(function (card) { return card.due > current && card.due <= current + DAY && card.state !== "new" && !card.suspended; }).length],
      ["7日", cards.filter(function (card) { return card.due > current + DAY && card.due <= current + 7 * DAY && card.state !== "new" && !card.suspended; }).length],
      ["30日", cards.filter(function (card) { return card.due > current + 7 * DAY && card.due <= current + 30 * DAY && card.state !== "new" && !card.suspended; }).length],
      ["以降", cards.filter(function (card) { return card.due > current + 30 * DAY && card.state !== "new" && !card.suspended; }).length]
    ];
    return renderBars(buckets);
  }

  function renderStateBars(cards) {
    var buckets = [
      ["新規", cards.filter(function (card) { return card.state === "new"; }).length],
      ["学習", cards.filter(function (card) { return card.state === "learning" || card.state === "relearning"; }).length],
      ["復習", cards.filter(function (card) { return card.state === "review"; }).length],
      ["保留", cards.filter(function (card) { return card.suspended; }).length]
    ];
    return renderBars(buckets);
  }

  function renderBars(buckets) {
    var max = Math.max.apply(
      null,
      buckets.map(function (bucket) {
        return bucket[1];
      }).concat([1])
    );
    return (
      '<div class="bar-chart">' +
      buckets
        .map(function (bucket) {
          var width = Math.round((bucket[1] / max) * 100);
          return (
            '<div class="bar-row"><span>' +
            escapeHtml(bucket[0]) +
            '</span><div class="bar-track"><div class="bar-fill" style="width:' +
            width +
            '%"></div></div><strong>' +
            bucket[1] +
            "</strong></div>"
          );
        })
        .join("") +
      "</div>"
    );
  }

  function renderHeatmap(reviews) {
    var start = startOfToday() - 370 * DAY;
    var counts = {};
    reviews.forEach(function (review) {
      var day = Math.floor((review.reviewedAt - startOfToday()) / DAY);
      counts[day] = (counts[day] || 0) + 1;
    });

    var html = "";
    for (var i = 0; i < 371; i += 1) {
      var time = start + i * DAY;
      var dayKey = Math.floor((time - startOfToday()) / DAY);
      var count = counts[dayKey] || 0;
      var level = count === 0 ? 0 : count < 5 ? 1 : count < 15 ? 2 : count < 35 ? 3 : 4;
      html +=
        '<span class="heat-cell l' +
        level +
        '" title="' +
        new Date(time).toLocaleDateString("ja-JP") +
        " / " +
        count +
        '回"></span>';
    }
    return html;
  }

  function renderIoView() {
    return (
      '<div class="workspace split">' +
      '<section class="panel pad stack">' +
      "<h3>Ankiパッケージ</h3>" +
      '<div class="toolbar"><button data-action="export-apkg" class="primary">.apkgを書き出す</button><label>.apkgを読み込む<input id="apkgImport" type="file" accept=".apkg,.colpkg,application/zip"></label></div>' +
      '<label>読み込み方式<select id="apkgImportMode"><option value="merge">追加</option><option value="replace">置換</option></select></label>' +
      '<p class="help-line">Basic、Basic (and reversed card)、Clozeを変換します。独自テンプレートは表・裏・補足へ簡略化されます。</p>' +
      "</section>" +
      '<section class="panel pad stack">' +
      "<h3>バックアップ</h3>" +
      '<div class="toolbar"><button data-action="export-json" class="primary">JSONを書き出す</button><label>JSONを読み込む<input id="jsonImport" type="file" accept="application/json,.json"></label></div>' +
      '<label>読み込み方式<select id="jsonImportMode"><option value="merge">追加</option><option value="replace">置換</option></select></label>' +
      '<p class="help-line">メディアを含むため、定期的にJSONで保存してください。</p>' +
      "</section>" +
      '<section class="panel pad stack">' +
      "<h3>TSV</h3>" +
      '<textarea id="tsvText" class="import-area" placeholder="deck\tmodel\tfront\tback\textra\ttags"></textarea>' +
      '<div class="toolbar"><button data-action="import-tsv">取り込む</button><button data-action="export-tsv">TSVを書き出す</button></div>' +
      "</section>" +
      "</div>"
    );
  }

  function renderSettingsView() {
    var settings = state.db.settings;
    var deck = selectedDeck();
    return (
      '<div class="workspace split">' +
      '<form class="panel pad form-section" id="settingsForm">' +
      "<h3>全体設定</h3>" +
      '<div class="grid-2">' +
      numberInput("newPerDay", "新規/日", settings.newPerDay, 0) +
      numberInput("reviewPerDay", "復習/日", settings.reviewPerDay, 0) +
      numberInput("rolloverHour", "日付更新時刻", settings.rolloverHour, 0, 23) +
      numberInput("maxIntervalDays", "最大間隔日数", settings.maxIntervalDays, 1) +
      numberInput("againMinutes", "Again分", settings.againMinutes, 1) +
      numberInput("hardMinutes", "Hard分", settings.hardMinutes, 1) +
      numberInput("graduateDays", "Good日", settings.graduateDays, 1) +
      numberInput("easyDays", "Easy日", settings.easyDays, 1) +
      "</div>" +
      '<label class="row"><input name="burySiblings" type="checkbox" style="width:auto" ' +
      (settings.burySiblings ? "checked" : "") +
      "> 兄弟カードを同日中は埋める</label>" +
      '<div class="toolbar"><button class="primary" type="submit">保存</button><button type="button" data-action="rebuild-cards">カード再生成</button></div>' +
      "</form>" +
      '<section class="panel pad stack">' +
      "<h3>選択デッキ</h3>" +
      (deck
        ? '<form id="deckSettingsForm" class="form-section">' +
          '<label>名前<input name="name" value="' +
          escapeHtml(deck.name) +
          '"></label>' +
          '<label>説明<textarea name="description">' +
          escapeHtml(deck.description || "") +
          "</textarea></label>" +
          '<div class="grid-2">' +
          numberInput("newPerDay", "新規/日", deck.newPerDay == null ? "" : deck.newPerDay, 0, null, true) +
          numberInput("reviewPerDay", "復習/日", deck.reviewPerDay == null ? "" : deck.reviewPerDay, 0, null, true) +
          "</div>" +
          '<div class="toolbar"><button class="primary" type="submit">保存</button><button type="button" class="danger" data-action="delete-deck">削除</button></div>' +
          "</form>"
        : '<p class="muted">左からデッキを選ぶと個別設定を編集できます。</p>') +
      '<hr><button class="danger" data-action="reset-data">全データ初期化</button>' +
      "</section></div>"
    );
  }

  function numberInput(name, label, value, min, max, allowEmpty) {
    return (
      '<label>' +
      escapeHtml(label) +
      '<input name="' +
      escapeHtml(name) +
      '" type="number" step="1" ' +
      (min == null ? "" : 'min="' + min + '" ') +
      (max == null ? "" : 'max="' + max + '" ') +
      (allowEmpty ? "" : "required ") +
      'value="' +
      escapeHtml(value) +
      '"></label>'
    );
  }

  function addDeck(name) {
    var clean = normalizeText(name);
    if (!clean) return;
    var existing = state.db.decks.find(function (deck) {
      return deck.name.toLowerCase() === clean.toLowerCase();
    });
    if (existing) {
      state.selectedDeckId = existing.id;
      toast("既存デッキを選択しました");
      render();
      return;
    }
    var deck = {
      id: uid("deck"),
      name: clean,
      description: "",
      newPerDay: null,
      reviewPerDay: null,
      createdAt: now()
    };
    state.db.decks.push(deck);
    state.selectedDeckId = deck.id;
    saveDb();
    render();
  }

  function saveNoteFromForm(form) {
    var data = new FormData(form);
    var editNote = state.editNoteId ? noteById(state.editNoteId) : null;
    var model = data.get("model");
    var note = editNote || {
      id: uid("note"),
      createdAt: now()
    };

    note.deckId = data.get("deckId");
    note.model = model;
    note.tags = splitTags(data.get("tags"));
    note.updatedAt = now();

    if (model === "cloze") {
      note.fields = {
        text: String(data.get("text") || ""),
        extra: String(data.get("extra") || "")
      };
    } else {
      note.fields = {
        front: String(data.get("front") || ""),
        back: String(data.get("back") || ""),
        extra: String(data.get("extra") || "")
      };
    }

    if (model === "cloze" && !parseClozeNumbers(note.fields.text).length) {
      toast("穴埋めは {{c1::答え}} を少なくとも1つ含めてください");
      return;
    }

    if (!editNote) {
      state.db.notes.push(note);
    }
    syncCardsForNote(note);
    saveDb();
    state.editNoteId = null;
    state.addModel = model;
    state.selectedDeckId = note.deckId;
    state.view = "review";
    state.currentCardId = null;
    toast("保存しました");
    render();
  }

  function gradeCurrentCard(grade) {
    var card = cardById(state.currentCardId);
    if (!card) return;
    var before = clone(card);
    var buriedBefore = [];
    var fromState = card.state;
    var fromInterval = card.interval;
    var fromEase = card.ease;
    var elapsedMs = Math.max(0, now() - (state.reviewStartAt || now()));

    applySchedule(card, grade);

    if (state.db.settings.burySiblings) {
      buriedBefore = burySiblings(card.noteId, card.id);
    }

    var review = {
      id: uid("review"),
      cardId: card.id,
      noteId: card.noteId,
      deckId: card.deckId,
      grade: grade,
      fromState: fromState,
      toState: card.state,
      fromInterval: fromInterval,
      toInterval: card.interval,
      fromEase: fromEase,
      toEase: card.ease,
      elapsedMs: elapsedMs,
      reviewedAt: now()
    };
    state.db.reviews.push(review);
    state.lastUndo = { cardBefore: before, reviewId: review.id, buriedBefore: buriedBefore };

    saveDb();
    state.currentCardId = null;
    state.answerShown = false;
    toast(gradeLabel(grade) + " / 次回 " + dueLabel(card.due));
    render();
  }

  function burySiblings(noteId, exceptCardId) {
    var until = startOfTomorrow();
    var changed = [];
    state.db.cards.forEach(function (card) {
      if (card.noteId === noteId && card.id !== exceptCardId && !card.suspended && !isBuried(card)) {
        changed.push({ id: card.id, buriedUntil: card.buriedUntil || 0 });
        card.buriedUntil = until;
      }
    });
    return changed;
  }

  function buryCard(cardId) {
    var card = cardById(cardId || state.currentCardId);
    if (!card) return;
    card.buriedUntil = startOfTomorrow();
    saveDb();
    state.currentCardId = null;
    state.answerShown = false;
    toast("今日のキューから外しました");
    render();
  }

  function toggleSuspend(cardId) {
    var card = cardById(cardId || state.currentCardId);
    if (!card) return;
    card.suspended = !card.suspended;
    saveDb();
    state.currentCardId = null;
    state.answerShown = false;
    toast(card.suspended ? "保留しました" : "保留を解除しました");
    render();
  }

  function cycleFlag(cardId) {
    var card = cardById(cardId || state.currentCardId);
    if (!card) return;
    var index = FLAG_ORDER.indexOf(card.flag || "");
    card.flag = FLAG_ORDER[(index + 1) % FLAG_ORDER.length];
    saveDb();
    toast(card.flag ? "フラグ: " + card.flag : "フラグなし");
    render();
  }

  function undoLastReview() {
    if (!state.lastUndo) return;
    var card = cardById(state.lastUndo.cardBefore.id);
    if (card) {
      Object.assign(card, state.lastUndo.cardBefore);
    }
    state.db.reviews = state.db.reviews.filter(function (review) {
      return review.id !== state.lastUndo.reviewId;
    });
    (state.lastUndo.buriedBefore || []).forEach(function (entry) {
      var buriedCard = cardById(entry.id);
      if (buriedCard) buriedCard.buriedUntil = entry.buriedUntil;
    });
    state.currentCardId = card ? card.id : null;
    state.answerShown = false;
    state.lastUndo = null;
    saveDb();
    toast("直前の復習を戻しました");
    render();
  }

  function editNote(noteId) {
    state.editNoteId = noteId;
    var note = noteById(noteId);
    state.addModel = note ? note.model : "basic";
    state.view = "add";
    render();
  }

  function deleteNote(noteId) {
    var note = noteById(noteId);
    if (!note) return;
    if (!window.confirm("このノートとカードを削除しますか？")) return;
    state.db.notes = state.db.notes.filter(function (item) {
      return item.id !== noteId;
    });
    state.db.cards = state.db.cards.filter(function (card) {
      return card.noteId !== noteId;
    });
    state.db.reviews = state.db.reviews.filter(function (review) {
      return review.noteId !== noteId;
    });
    saveDb();
    toast("削除しました");
    render();
  }

  function startCustomStudy(mode) {
    var cards = state.db.cards.filter(function (card) {
      return inSelectedDeck(card, state.selectedDeckId) && isAvailable(card);
    });
    var current = now();
    var labels = {
      due: "期限",
      new: "新規",
      flagged: "フラグ",
      mistakes: "苦手",
      all: "全カード"
    };

    if (mode === "due") {
      cards = cards.filter(function (card) {
        return card.state !== "new" && card.due <= current;
      });
    } else if (mode === "new") {
      cards = cards.filter(function (card) {
        return card.state === "new";
      });
    } else if (mode === "flagged") {
      cards = cards.filter(function (card) {
        return Boolean(card.flag);
      });
    } else if (mode === "mistakes") {
      cards = cards.filter(function (card) {
        return card.lapses > 0 || card.ease < 220;
      });
    }

    state.customMode = {
      mode: mode,
      label: labels[mode] || mode,
      ids: cards.sort(cardSort).map(function (card) {
        return card.id;
      })
    };
    state.currentCardId = null;
    state.answerShown = false;
    toast(state.customMode.ids.length + "枚を選択しました");
    render();
  }

  function clearCustomStudy() {
    state.customMode = null;
    state.currentCardId = null;
    state.answerShown = false;
    render();
  }

  function importJsonFile(file, mode) {
    readFileAsText(file).then(function (text) {
      var incoming = migrateDb(JSON.parse(text));
      if (mode === "replace") {
        state.db = incoming;
      } else {
        mergeDb(incoming);
      }
      syncAllCards(state.db);
      saveDb();
      state.currentCardId = null;
      toast("JSONを読み込みました");
      render();
    }).catch(function (error) {
      console.error(error);
      toast("JSONを読み込めませんでした");
    });
  }

  function mergeDb(incoming) {
    mergeArray("decks", incoming.decks);
    mergeArray("notes", incoming.notes);
    mergeArray("cards", incoming.cards);
    mergeArray("reviews", incoming.reviews);
    Object.keys(incoming.media || {}).forEach(function (name) {
      var target = name;
      if (state.db.media[target]) target = uniqueMediaName(target);
      state.db.media[target] = incoming.media[name];
    });
  }

  function mergeArray(key, items) {
    var existing = {};
    state.db[key].forEach(function (item) {
      existing[item.id] = true;
    });
    items.forEach(function (item) {
      if (!existing[item.id]) state.db[key].push(item);
    });
  }

  function exportJson() {
    download("g2-recall-backup-" + dateStamp() + ".json", JSON.stringify(state.db, null, 2), "application/json");
  }

  function importApkgFile(file, mode) {
    if (!window.G2Apkg) {
      toast("Ankiパッケージ機能を読み込めませんでした");
      return;
    }
    toast(".apkgを解析しています…");
    window.G2Apkg.importFile(file).then(function (incoming) {
      mergeApkg(incoming, mode);
      saveDb();
      state.currentCardId = null;
      state.answerShown = false;
      var stats = incoming.stats;
      var message = stats.notes + "ノート / " + stats.cards + "カードを読み込みました";
      if (incoming.warnings.length) message += "（" + incoming.warnings.length + "件の簡略化あり）";
      toast(message);
      render();
      if (incoming.warnings.length) {
        window.setTimeout(function () {
          window.alert("Ankiパッケージの読み込み時に簡略化した項目:\n\n" + incoming.warnings.join("\n"));
        }, 150);
      }
    }).catch(function (error) {
      console.error(error);
      toast(".apkgを読み込めませんでした: " + (error.message || "ファイル形式を確認してください"));
    });
  }

  function mediaNameForDb(db, name) {
    var clean = String(name || "media");
    if (!db.media[clean]) return clean;
    var dot = clean.lastIndexOf(".");
    var stem = dot > -1 ? clean.slice(0, dot) : clean;
    var ext = dot > -1 ? clean.slice(dot) : "";
    var index = 2;
    var candidate = stem + "-" + index + ext;
    while (db.media[candidate]) {
      index += 1;
      candidate = stem + "-" + index + ext;
    }
    return candidate;
  }

  function replaceImportedMediaReferences(value, names) {
    var output = String(value || "");
    output = output.replace(/\[sound:([^\]]+)\]/g, function (all, name) {
      return "[sound:" + (names[name] || name) + "]";
    });
    return output.replace(/\(media:([^)]+)\)/g, function (all, name) {
      return "(media:" + (names[name] || name) + ")";
    });
  }

  function mergeApkg(incoming, mode) {
    if (mode === "replace") {
      state.db = createDb();
      state.selectedDeckId = "all";
    }

    var deckIds = {};
    incoming.decks.forEach(function (sourceDeck) {
      var deck = state.db.decks.find(function (candidate) {
        return candidate.name.toLowerCase() === String(sourceDeck.name || "").toLowerCase();
      });
      if (!deck) {
        deck = {
          id: uid("deck"),
          name: normalizeText(sourceDeck.name) || "インポート",
          description: sourceDeck.description || "",
          newPerDay: null,
          reviewPerDay: null,
          createdAt: now()
        };
        state.db.decks.push(deck);
      }
      deckIds[sourceDeck.id] = deck.id;
    });

    var mediaNames = {};
    Object.keys(incoming.media || {}).forEach(function (name) {
      var sameMedia = state.db.media[name] && state.db.media[name].data === incoming.media[name].data;
      var targetName = sameMedia ? name : mediaNameForDb(state.db, name);
      mediaNames[name] = targetName;
      state.db.media[targetName] = incoming.media[name];
    });

    var noteIds = {};
    incoming.notes.forEach(function (sourceNote) {
      var note = clone(sourceNote);
      note.deckId = deckIds[sourceNote.deckId] || state.db.decks[0].id;
      Object.keys(note.fields || {}).forEach(function (key) {
        note.fields[key] = replaceImportedMediaReferences(note.fields[key], mediaNames);
      });
      noteIds[sourceNote.id] = note.id;
      var existing = state.db.notes.find(function (candidate) {
        return candidate.id === note.id;
      });
      if (existing) {
        Object.assign(existing, note);
      } else {
        state.db.notes.push(note);
      }
    });

    incoming.cards.forEach(function (sourceCard) {
      var card = clone(sourceCard);
      card.noteId = noteIds[sourceCard.noteId] || sourceCard.noteId;
      card.deckId = deckIds[sourceCard.deckId] || state.db.decks[0].id;
      var existing = state.db.cards.find(function (candidate) {
        return candidate.id === card.id;
      });
      if (existing) {
        Object.assign(existing, card);
      } else {
        state.db.cards.push(card);
      }
    });

    incoming.reviews.forEach(function (sourceReview) {
      var review = clone(sourceReview);
      review.cardId = review.cardId;
      review.noteId = noteIds[sourceReview.noteId] || sourceReview.noteId;
      review.deckId = deckIds[sourceReview.deckId] || state.db.decks[0].id;
      if (!state.db.reviews.some(function (candidate) {
        return candidate.id === review.id;
      })) {
        state.db.reviews.push(review);
      }
    });
    syncAllCards(state.db);
  }

  function exportApkg() {
    if (!window.G2Apkg) {
      toast("Ankiパッケージ機能を読み込めませんでした");
      return;
    }
    toast(".apkgを書き出しています…");
    window.G2Apkg.exportCollection(state.db).then(function (result) {
      downloadBytes("g2-recall-" + dateStamp() + ".apkg", result.bytes, "application/apkg");
      toast(result.stats.notes + "ノート / " + result.stats.cards + "カードを書き出しました");
    }).catch(function (error) {
      console.error(error);
      toast(".apkgを書き出せませんでした");
    });
  }

  function importTsv(text) {
    var rows = parseDelimited(text);
    if (!rows.length) {
      toast("取り込む行がありません");
      return;
    }
    var header = rows[0].map(function (cell) {
      return cell.toLowerCase();
    });
    var hasHeader = ["deck", "model", "front", "back", "text", "tags"].some(function (key) {
      return header.indexOf(key) > -1;
    });
    var body = hasHeader ? rows.slice(1) : rows;
    var count = 0;

    body.forEach(function (row) {
      if (!row.join("").trim()) return;
      var data = hasHeader ? rowToObject(header, row) : {
        deck: row[0],
        model: row[1],
        front: row[2],
        back: row[3],
        extra: row[4],
        tags: row[5]
      };
      var deck = getOrCreateDeck(data.deck || selectedDeckName());
      var model = ["basic", "reverse", "cloze"].indexOf(String(data.model || "").toLowerCase()) > -1
        ? String(data.model).toLowerCase()
        : "basic";
      var note = {
        id: uid("note"),
        deckId: deck.id,
        model: model,
        fields: {},
        tags: splitTags(data.tags || ""),
        createdAt: now(),
        updatedAt: now()
      };
      if (model === "cloze") {
        note.fields = {
          text: data.text || data.front || "",
          extra: data.extra || ""
        };
        if (!parseClozeNumbers(note.fields.text).length) return;
      } else {
        note.fields = {
          front: data.front || data.text || "",
          back: data.back || "",
          extra: data.extra || ""
        };
      }
      state.db.notes.push(note);
      syncCardsForNote(note);
      count += 1;
    });

    saveDb();
    toast(count + "件を取り込みました");
    render();
  }

  function exportTsv() {
    var rows = [["deck", "model", "front", "back", "text", "extra", "tags"]];
    state.db.notes.forEach(function (note) {
      var deck = deckById(note.deckId);
      rows.push([
        deck ? deck.name : "",
        note.model,
        note.fields.front || "",
        note.fields.back || "",
        note.fields.text || "",
        note.fields.extra || "",
        tagsToText(note.tags)
      ]);
    });
    var text = rows.map(function (row) {
      return row.map(tsvCell).join("\t");
    }).join("\n");
    download("g2-recall-notes-" + dateStamp() + ".tsv", text, "text/tab-separated-values");
  }

  function parseDelimited(text) {
    var delimiter = text.indexOf("\t") > -1 ? "\t" : ",";
    var rows = [];
    var row = [];
    var cell = "";
    var quoted = false;

    for (var i = 0; i < text.length; i += 1) {
      var char = text[i];
      var next = text[i + 1];
      if (quoted) {
        if (char === '"' && next === '"') {
          cell += '"';
          i += 1;
        } else if (char === '"') {
          quoted = false;
        } else {
          cell += char;
        }
      } else if (char === '"') {
        quoted = true;
      } else if (char === delimiter) {
        row.push(cell);
        cell = "";
      } else if (char === "\n") {
        row.push(cell);
        rows.push(row);
        row = [];
        cell = "";
      } else if (char !== "\r") {
        cell += char;
      }
    }
    row.push(cell);
    rows.push(row);
    return rows.filter(function (item) {
      return item.some(function (cellValue) {
        return String(cellValue).trim();
      });
    });
  }

  function rowToObject(header, row) {
    var object = {};
    header.forEach(function (key, index) {
      object[key] = row[index] || "";
    });
    return object;
  }

  function tsvCell(value) {
    var text = String(value == null ? "" : value);
    if (/["\t\n\r]/.test(text)) {
      return '"' + text.replace(/"/g, '""') + '"';
    }
    return text;
  }

  function getOrCreateDeck(name) {
    var clean = normalizeText(name) || "デフォルト";
    var deck = state.db.decks.find(function (item) {
      return item.name.toLowerCase() === clean.toLowerCase();
    });
    if (deck) return deck;
    deck = {
      id: uid("deck"),
      name: clean,
      description: "",
      newPerDay: null,
      reviewPerDay: null,
      createdAt: now()
    };
    state.db.decks.push(deck);
    return deck;
  }

  function saveSettings(form) {
    var data = new FormData(form);
    Object.keys(DEFAULT_SETTINGS).forEach(function (key) {
      if (key === "burySiblings") return;
      state.db.settings[key] = Number(data.get(key));
    });
    state.db.settings.burySiblings = data.get("burySiblings") === "on";
    saveDb();
    toast("設定を保存しました");
    render();
  }

  function saveDeckSettings(form) {
    var deck = selectedDeck();
    if (!deck) return;
    var data = new FormData(form);
    deck.name = normalizeText(data.get("name")) || deck.name;
    deck.description = String(data.get("description") || "");
    deck.newPerDay = data.get("newPerDay") === "" ? null : Number(data.get("newPerDay"));
    deck.reviewPerDay = data.get("reviewPerDay") === "" ? null : Number(data.get("reviewPerDay"));
    saveDb();
    toast("デッキ設定を保存しました");
    render();
  }

  function deleteSelectedDeck() {
    var deck = selectedDeck();
    if (!deck) return;
    var cardCount = state.db.cards.filter(function (card) {
      return card.deckId === deck.id;
    }).length;
    if (!window.confirm(deck.name + " と " + cardCount + "枚のカードを削除しますか？")) return;
    var noteIds = {};
    state.db.notes.forEach(function (note) {
      if (note.deckId === deck.id) noteIds[note.id] = true;
    });
    state.db.decks = state.db.decks.filter(function (item) {
      return item.id !== deck.id;
    });
    state.db.notes = state.db.notes.filter(function (note) {
      return !noteIds[note.id];
    });
    state.db.cards = state.db.cards.filter(function (card) {
      return !noteIds[card.noteId];
    });
    state.db.reviews = state.db.reviews.filter(function (review) {
      return !noteIds[review.noteId];
    });
    if (!state.db.decks.length) {
      state.db.decks.push(createDb().decks[0]);
    }
    state.selectedDeckId = "all";
    saveDb();
    render();
  }

  function resetData() {
    if (!window.confirm("全データを初期化しますか？ JSONバックアップを先に保存してください。")) return;
    if (!window.confirm("本当に初期化しますか？")) return;
    state.db = createDb();
    state.selectedDeckId = "all";
    state.currentCardId = null;
    state.answerShown = false;
    state.lastUndo = null;
    saveDb();
    render();
  }

  function rebuildCards() {
    syncAllCards(state.db);
    saveDb();
    toast("カードを再生成しました");
    render();
  }

  function download(filename, text, type) {
    var blob = new Blob([text], { type: type || "text/plain" });
    var url = URL.createObjectURL(blob);
    var anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    setTimeout(function () {
      URL.revokeObjectURL(url);
    }, 1000);
  }

  function downloadBytes(filename, bytes, type) {
    var blob = new Blob([bytes], { type: type || "application/octet-stream" });
    var url = URL.createObjectURL(blob);
    var anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    setTimeout(function () {
      URL.revokeObjectURL(url);
    }, 1000);
  }

  function dateStamp() {
    return new Date().toISOString().slice(0, 10);
  }

  function readFileAsText(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () {
        resolve(String(reader.result || ""));
      };
      reader.onerror = reject;
      reader.readAsText(file);
    });
  }

  function readFileAsDataUrl(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () {
        resolve(String(reader.result || ""));
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  function attachMedia(files) {
    var list = Array.prototype.slice.call(files || []);
    if (!list.length) return;
    var active = document.activeElement && document.activeElement.matches("textarea") ? document.activeElement : state.lastFocusField;

    Promise.all(list.map(function (file) {
      return readFileAsDataUrl(file).then(function (dataUrl) {
        var name = uniqueMediaName(file.name);
        state.db.media[name] = {
          type: file.type || "application/octet-stream",
          data: dataUrl,
          size: file.size,
          createdAt: now()
        };
        return { name: name, type: file.type || "" };
      });
    })).then(function (items) {
      saveDb();
      if (active && active.matches && active.matches("textarea")) {
        var insert = items
          .map(function (item) {
            return item.type.indexOf("audio/") === 0 ? "[sound:" + item.name + "]" : "![" + item.name + "](media:" + item.name + ")";
          })
          .join("\n");
        insertAtCursor(active, insert);
      }
      toast(items.length + "件のメディアを追加しました");
    }).catch(function (error) {
      console.error(error);
      toast("メディアを追加できませんでした");
    });
  }

  function insertAtCursor(field, text) {
    var start = field.selectionStart || 0;
    var end = field.selectionEnd || 0;
    var value = field.value;
    var prefix = value.slice(0, start);
    var suffix = value.slice(end);
    var spacerBefore = prefix && !/\s$/.test(prefix) ? "\n" : "";
    var spacerAfter = suffix && !/^\s/.test(suffix) ? "\n" : "";
    field.value = prefix + spacerBefore + text + spacerAfter + suffix;
    field.focus();
    var cursor = (prefix + spacerBefore + text).length;
    field.setSelectionRange(cursor, cursor);
  }

  function updateStorageStatus() {
    var el = $("#storageStatus");
    if (!el) return;
    var raw = localStorage.getItem(STORAGE_KEY) || "";
    var kb = Math.round(raw.length / 102.4) / 10;
    el.textContent = kb + " KB local";
  }

  function toast(message) {
    var el = $("#toast");
    if (!el) return;
    el.textContent = message;
    el.classList.add("show");
    clearTimeout(state.toastTimer);
    state.toastTimer = setTimeout(function () {
      el.classList.remove("show");
    }, 2600);
  }

  function handleClick(event) {
    var deckButton = event.target.closest("[data-deck-id]");
    if (deckButton) {
      state.selectedDeckId = deckButton.dataset.deckId;
      state.currentCardId = null;
      state.answerShown = false;
      render();
      return;
    }

    var viewButton = event.target.closest("[data-view]");
    if (viewButton) {
      state.view = viewButton.dataset.view;
      state.editNoteId = null;
      render();
      return;
    }

    var jumpButton = event.target.closest("[data-view-jump]");
    if (jumpButton) {
      state.view = jumpButton.dataset.viewJump;
      render();
      return;
    }

    var gradeButton = event.target.closest("[data-grade]");
    if (gradeButton) {
      gradeCurrentCard(Number(gradeButton.dataset.grade));
      return;
    }

    var customButton = event.target.closest("[data-custom]");
    if (customButton) {
      startCustomStudy(customButton.dataset.custom);
      return;
    }

    var editButton = event.target.closest("[data-edit-note]");
    if (editButton) {
      editNote(editButton.dataset.editNote);
      return;
    }

    var deleteButton = event.target.closest("[data-delete-note]");
    if (deleteButton) {
      deleteNote(deleteButton.dataset.deleteNote);
      return;
    }

    var cardAction = event.target.closest("[data-card-action]");
    if (cardAction) {
      runCardAction(cardAction.dataset.cardAction, cardAction.dataset.cardId);
      return;
    }

    var bulkButton = event.target.closest("[data-bulk]");
    if (bulkButton) {
      runBulkAction(bulkButton.dataset.bulk);
      return;
    }

    var action = event.target.closest("[data-action]");
    if (action) {
      runAction(action.dataset.action);
    }
  }

  function runAction(action) {
    if (action === "show-answer") {
      state.answerShown = true;
      render();
    } else if (action === "bury-card") {
      buryCard();
    } else if (action === "toggle-suspend") {
      toggleSuspend();
    } else if (action === "cycle-flag") {
      cycleFlag();
    } else if (action === "edit-current") {
      var card = cardById(state.currentCardId);
      if (card) editNote(card.noteId);
    } else if (action === "undo") {
      undoLastReview();
    } else if (action === "clear-custom") {
      clearCustomStudy();
    } else if (action === "cancel-edit") {
      state.editNoteId = null;
      state.view = "review";
      render();
    } else if (action === "clear-search") {
      state.browserQuery = "";
      render();
    } else if (action === "export-json") {
      exportJson();
    } else if (action === "export-apkg") {
      exportApkg();
    } else if (action === "import-tsv") {
      importTsv($("#tsvText").value || "");
    } else if (action === "export-tsv") {
      exportTsv();
    } else if (action === "rebuild-cards") {
      rebuildCards();
    } else if (action === "delete-deck") {
      deleteSelectedDeck();
    } else if (action === "reset-data") {
      resetData();
    }
  }

  function runCardAction(action, cardId) {
    if (action === "toggle-suspend") toggleSuspend(cardId);
    if (action === "cycle-flag") cycleFlag(cardId);
  }

  function runBulkAction(action) {
    var rows = searchRows(state.browserQuery);
    if (!rows.length) return;
    if (action === "unsuspend") {
      rows.forEach(function (row) {
        row.card.suspended = false;
      });
      toast(rows.length + "枚の保留を解除しました");
    } else if (action === "bury") {
      var until = startOfTomorrow();
      rows.forEach(function (row) {
        row.card.buriedUntil = until;
      });
      toast(rows.length + "枚を今日埋めました");
    }
    saveDb();
    render();
  }

  function handleSubmit(event) {
    if (event.target.id === "deckForm") {
      event.preventDefault();
      addDeck($("#deckName").value);
      $("#deckName").value = "";
    } else if (event.target.id === "noteForm") {
      event.preventDefault();
      saveNoteFromForm(event.target);
    } else if (event.target.id === "settingsForm") {
      event.preventDefault();
      saveSettings(event.target);
    } else if (event.target.id === "deckSettingsForm") {
      event.preventDefault();
      saveDeckSettings(event.target);
    }
  }

  function handleInput(event) {
    if (event.target.id === "browserQuery") {
      state.browserQuery = event.target.value;
      render();
      var query = $("#browserQuery");
      if (query) {
        query.focus();
        query.setSelectionRange(query.value.length, query.value.length);
      }
    }
    if (event.target.matches("textarea")) {
      state.lastFocusField = event.target;
    }
  }

  function handleChange(event) {
    if (event.target.id === "noteModel") {
      state.addModel = event.target.value;
      render();
    } else if (event.target.id === "jsonImport" && event.target.files[0]) {
      var mode = $("#jsonImportMode") ? $("#jsonImportMode").value : "merge";
      importJsonFile(event.target.files[0], mode);
    } else if (event.target.id === "apkgImport" && event.target.files[0]) {
      var apkgMode = $("#apkgImportMode") ? $("#apkgImportMode").value : "merge";
      importApkgFile(event.target.files[0], apkgMode);
      event.target.value = "";
    } else if (event.target.id === "mediaFiles") {
      attachMedia(event.target.files);
      event.target.value = "";
    }
  }

  function handleKeydown(event) {
    var tag = document.activeElement ? document.activeElement.tagName : "";
    var editingText = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
    if (editingText) return;
    if (state.view !== "review") return;

    if (event.key === " " || event.key === "Enter") {
      event.preventDefault();
      if (!state.answerShown) {
        state.answerShown = true;
        render();
      }
    } else if (state.answerShown && ["1", "2", "3", "4"].indexOf(event.key) > -1) {
      gradeCurrentCard(Number(event.key));
    } else if (event.key.toLowerCase() === "b") {
      buryCard();
    } else if (event.key.toLowerCase() === "s") {
      toggleSuspend();
    } else if (event.key.toLowerCase() === "f") {
      cycleFlag();
    } else if (event.key.toLowerCase() === "e") {
      var card = cardById(state.currentCardId);
      if (card) editNote(card.noteId);
    } else if (event.key.toLowerCase() === "z") {
      undoLastReview();
    }
  }

  function bindEvents() {
    document.addEventListener("click", handleClick);
    document.addEventListener("submit", handleSubmit);
    document.addEventListener("input", handleInput);
    document.addEventListener("change", handleChange);
    document.addEventListener("focusin", function (event) {
      if (event.target.matches("textarea")) state.lastFocusField = event.target;
    });
    document.addEventListener("keydown", handleKeydown);
  }

  function boot() {
    state.db = loadDb();
    bindEvents();
    saveDb();
    render();
  }

  boot();
})();

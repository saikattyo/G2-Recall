(function (root) {
  "use strict";

  var DAY = 24 * 60 * 60 * 1000;
  var SQL_PROMISE = null;
  var MODEL_IDS = {
    basic: 1700000000001,
    reverse: 1700000000002,
    cloze: 1700000000003
  };

  function sqlModule() {
    if (!SQL_PROMISE) {
      if (typeof root.initSqlJs !== "function") {
        return Promise.reject(new Error("SQLite runtime is not loaded"));
      }
      SQL_PROMISE = root.initSqlJs({
        locateFile: function (file) {
          return "./vendor/" + file;
        }
      });
    }
    return SQL_PROMISE;
  }

  function requireZip() {
    if (!root.fflate || typeof root.fflate.unzipSync !== "function") {
      throw new Error("ZIP runtime is not loaded");
    }
    return root.fflate;
  }

  function utf8(bytes) {
    return new TextDecoder("utf-8").decode(bytes);
  }

  function utf8Bytes(value) {
    return new TextEncoder().encode(String(value || ""));
  }

  function parseJson(value, fallback) {
    try {
      return JSON.parse(value || "");
    } catch (error) {
      return fallback;
    }
  }

  function rows(db, sql) {
    var result = db.exec(sql);
    if (!result.length) return [];
    return result[0].values.map(function (values) {
      var row = {};
      result[0].columns.forEach(function (column, index) {
        row[column] = values[index];
      });
      return row;
    });
  }

  function tableRows(db, table) {
    try {
      return rows(db, "SELECT * FROM " + table);
    } catch (error) {
      return [];
    }
  }

  function collectionFile(entries) {
    var names = Object.keys(entries);
    var candidates = names.filter(function (name) {
      return /(^|\/)collection\.(anki2|anki21|anki21b)$/.test(name);
    });
    candidates.sort(function (a, b) {
      return a.endsWith("collection.anki2") ? -1 : b.endsWith("collection.anki2") ? 1 : 0;
    });
    return candidates.find(function (name) {
      var bytes = entries[name];
      return bytes && utf8(bytes.subarray(0, 16)).indexOf("SQLite format 3") === 0;
    });
  }

  function basename(path) {
    return String(path || "").split(/[\\/]/).pop();
  }

  function mimeType(name) {
    var extension = String(name || "").toLowerCase().split(".").pop();
    var types = {
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      png: "image/png",
      gif: "image/gif",
      webp: "image/webp",
      svg: "image/svg+xml",
      mp3: "audio/mpeg",
      m4a: "audio/mp4",
      wav: "audio/wav",
      ogg: "audio/ogg",
      opus: "audio/ogg",
      mp4: "video/mp4",
      webm: "video/webm"
    };
    return types[extension] || "application/octet-stream";
  }

  function base64(bytes) {
    var output = "";
    var chunkSize = 0x8000;
    for (var i = 0; i < bytes.length; i += chunkSize) {
      output += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
    }
    return btoa(output);
  }

  function dataUrl(bytes, type) {
    return "data:" + (type || "application/octet-stream") + ";base64," + base64(bytes);
  }

  function dataUrlBytes(value) {
    var match = String(value || "").match(/^data:[^;]+;base64,(.*)$/);
    if (!match) return new Uint8Array(0);
    var binary = atob(match[1]);
    var bytes = new Uint8Array(binary.length);
    for (var i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }

  function decodeEntity(value) {
    var textarea = document.createElement("textarea");
    textarea.innerHTML = value;
    return textarea.value;
  }

  function normalizeMediaName(value) {
    var name = decodeEntity(String(value || "")).trim();
    name = name.split(/[?#]/)[0];
    try {
      name = decodeURIComponent(name);
    } catch (error) {
      // Keep malformed URI components as literal filenames.
    }
    return basename(name);
  }

  function mediaMarkup(source, mediaNames, kind) {
    var name = normalizeMediaName(source);
    if (!name) return "";
    if (!mediaNames[name]) return kind === "sound" ? "[sound:" + name + "]" : "![" + name + "](media:" + name + ")";
    return kind === "sound" ? "[sound:" + name + "]" : "![" + name + "](media:" + name + ")";
  }

  function ankiHtmlToMarkup(value, mediaNames) {
    var output = String(value || "");
    output = output.replace(/<!--([\s\S]*?)-->/g, "");
    output = output.replace(/<img\b[^>]*?src\s*=\s*["']([^"']+)["'][^>]*>/gi, function (all, src) {
      return mediaMarkup(src, mediaNames, "image");
    });
    output = output.replace(/<audio\b[^>]*?src\s*=\s*["']([^"']+)["'][^>]*>[\s\S]*?<\/audio>/gi, function (all, src) {
      return mediaMarkup(src, mediaNames, "sound");
    });
    output = output.replace(/<br\s*\/?>/gi, "\n");
    output = output.replace(/<\/(div|p|li|h[1-6]|tr|table|blockquote)>/gi, "\n");
    output = output.replace(/<(strong|b)>/gi, "**").replace(/<\/(strong|b)>/gi, "**");
    output = output.replace(/<code>/gi, "`").replace(/<\/code>/gi, "`");
    output = output.replace(/<[^>]+>/g, "");
    output = decodeEntity(output);
    return output.replace(/\n{3,}/g, "\n\n").trim();
  }

  function uniqueWarning(list, value) {
    if (list.indexOf(value) === -1) list.push(value);
  }

  function modelFields(model) {
    return Array.isArray(model && model.flds) ? model.flds.slice().sort(function (a, b) {
      return Number(a.ord || 0) - Number(b.ord || 0);
    }) : [];
  }

  function fieldValue(fields, definitions, names, fallbackIndex) {
    var index = definitions.findIndex(function (field) {
      return names.indexOf(String(field.name || "").toLowerCase()) > -1;
    });
    return fields[index > -1 ? index : fallbackIndex] || "";
  }

  function modelInfo(model, warnings) {
    var templates = Array.isArray(model && model.tmpls) ? model.tmpls : [];
    var isCloze = Number(model && model.type) === 1 || /cloze/i.test(String(model && model.name));
    if (!model || !model.flds || !templates.length) {
      uniqueWarning(warnings, "ノートタイプ情報が壊れているカードは基本カードとして読み込みました。");
      return { model: "basic", fields: [] };
    }
    if (isCloze) {
      if (templates.length > 1) uniqueWarning(warnings, "複数テンプレートの穴埋めノートは1テンプレートに簡略化しました。");
      return { model: "cloze", fields: modelFields(model) };
    }
    if (templates.length > 2) uniqueWarning(warnings, "3種類以上のカードテンプレートは表裏反転カードに簡略化しました。");
    return {
      model: templates.length > 1 ? "reverse" : "basic",
      fields: modelFields(model)
    };
  }

  function todayIndex(creationSeconds) {
    return Math.floor((Date.now() / 1000 - Number(creationSeconds || 0)) / 86400);
  }

  function localMidnight() {
    var date = new Date();
    date.setHours(0, 0, 0, 0);
    return date.getTime();
  }

  function importedDue(card, creationSeconds) {
    var type = Number(card.type);
    var queue = Number(card.queue);
    if (type === 0 || queue === 0) return Date.now();
    if (queue === 1 && Number(card.due) > 100000000) return Number(card.due) * 1000;
    if (type === 2 || queue === 2 || queue === 3) {
      return localMidnight() + (Number(card.due || 0) - todayIndex(creationSeconds)) * DAY;
    }
    return Date.now();
  }

  function importedState(card) {
    if (Number(card.type) === 0 || Number(card.queue) === 0) return "new";
    if (Number(card.type) === 3) return "relearning";
    if (Number(card.type) === 1 || Number(card.queue) === 1) return "learning";
    return "review";
  }

  function importedFlag(flags) {
    return {
      1: "red",
      2: "amber",
      3: "green",
      4: "blue"
    }[Number(flags || 0) & 7] || "";
  }

  function importCollection(entries, databaseBytes) {
    var warnings = [];
    return sqlModule().then(function (SQL) {
      var db = new SQL.Database(databaseBytes);
      try {
        var collection = rows(db, "SELECT * FROM col LIMIT 1")[0];
        if (!collection) throw new Error("Anki collection table is empty");

        var models = parseJson(collection.models, {});
        var decks = parseJson(collection.decks, {});
        var mediaManifest = entries.media ? parseJson(utf8(entries.media), {}) : {};
        var media = {};
        var mediaNames = {};
        Object.keys(mediaManifest).forEach(function (key) {
          var originalName = String(mediaManifest[key] || "");
          var bytes = entries[String(key)];
          if (!bytes || !originalName) return;
          mediaNames[originalName] = true;
          media[originalName] = {
            type: mimeType(originalName),
            data: dataUrl(bytes, mimeType(originalName)),
            size: bytes.length,
            createdAt: Date.now()
          };
        });

        var deckByAnkiId = {};
        var importedDecks = Object.keys(decks).map(function (id) {
          return { id: "anki-deck-" + id, sourceId: String(id), name: decks[id].name || "インポート" };
        }).filter(function (deck) {
          if (decks[deck.sourceId] && decks[deck.sourceId].dyn) return false;
          deckByAnkiId[deck.sourceId] = deck.id;
          return true;
        });
        if (!importedDecks.length) {
          importedDecks.push({ id: "anki-deck-default", sourceId: "1", name: "インポート" });
          deckByAnkiId["1"] = "anki-deck-default";
        }

        var noteRows = tableRows(db, "notes");
        var cardRows = tableRows(db, "cards");
        var noteByAnkiId = {};
        var importedNotes = [];
        noteRows.forEach(function (sourceNote) {
          var model = models[String(sourceNote.mid)];
          var info = modelInfo(model, warnings);
          var fields = String(sourceNote.flds || "").split("\x1f");
          var deckId = "anki-deck-default";
          var sourceCards = cardRows.filter(function (card) {
            return String(card.nid) === String(sourceNote.id);
          });
          if (sourceCards.length && deckByAnkiId[String(sourceCards[0].did)]) {
            deckId = deckByAnkiId[String(sourceCards[0].did)];
          } else if (sourceCards.length && deckByAnkiId[String(sourceCards[0].odid)]) {
            deckId = deckByAnkiId[String(sourceCards[0].odid)];
          }
          var createdAt = Number(sourceNote.id) > 100000000000 ? Number(sourceNote.id) : Date.now();
          var common = {
            id: "anki-note-" + sourceNote.id,
            ankiNoteId: String(sourceNote.id),
            ankiGuid: String(sourceNote.guid || ""),
            ankiModelId: String(sourceNote.mid || ""),
            sourceMod: Number(sourceNote.mod || 0) * 1000,
            deckId: deckId,
            tags: String(sourceNote.tags || "").trim().split(/\s+/).filter(Boolean),
            createdAt: createdAt,
            updatedAt: Number(sourceNote.mod || 0) * 1000 || createdAt
          };
          if (info.model === "cloze") {
            var text = ankiHtmlToMarkup(fieldValue(fields, info.fields, ["text"], 0), mediaNames);
            if (!/\{\{c\d+::/.test(text)) {
              uniqueWarning(warnings, "穴埋め記法を検出できない穴埋めノートは基本カードとして読み込みました。");
              common.model = "basic";
              common.fields = {
                front: text,
                back: ankiHtmlToMarkup(fieldValue(fields, info.fields, ["back", "extra"], 1), mediaNames),
                extra: ""
              };
            } else {
              common.model = "cloze";
              common.fields = {
                text: text,
                extra: ankiHtmlToMarkup(fieldValue(fields, info.fields, ["back extra", "extra"], 1), mediaNames)
              };
            }
          } else {
            common.model = info.model;
            common.fields = {
              front: ankiHtmlToMarkup(fieldValue(fields, info.fields, ["front", "question"], 0), mediaNames),
              back: ankiHtmlToMarkup(fieldValue(fields, info.fields, ["back", "answer"], 1), mediaNames),
              extra: fields.slice(2).map(function (value) {
                return ankiHtmlToMarkup(value, mediaNames);
              }).filter(Boolean).join("\n\n")
            };
            if (info.fields.length > 3) {
              uniqueWarning(warnings, "3つ以上のフィールドは補足欄にまとめました。");
            }
          }
          noteByAnkiId[String(sourceNote.id)] = common;
          importedNotes.push(common);
        });

        var importedCards = [];
        var cardByAnkiId = {};
        cardRows.forEach(function (sourceCard) {
          var note = noteByAnkiId[String(sourceCard.nid)];
          if (!note) return;
          var model = models[String(sourceCard.mid || note.ankiModelId)];
          var templates = Array.isArray(model && model.tmpls) ? model.tmpls : [];
          var ordinal = Number(sourceCard.ord || 0);
          if (note.model === "cloze") ordinal += 1;
          var card = {
            id: "anki-card-" + sourceCard.id,
            ankiCardId: String(sourceCard.id),
            noteId: note.id,
            deckId: note.deckId,
            ordinal: ordinal,
            templateName: templates[Number(sourceCard.ord || 0)] && templates[Number(sourceCard.ord || 0)].name || (note.model === "cloze" ? "穴埋め" : "Card"),
            state: importedState(sourceCard),
            due: importedDue(sourceCard, collection.crt),
            interval: Number(sourceCard.ivl || 0),
            ease: Math.max(130, Number(sourceCard.factor || 2500) / 10 || 250),
            reps: Number(sourceCard.reps || 0),
            lapses: Number(sourceCard.lapses || 0),
            suspended: Number(sourceCard.queue) === -1,
            buriedUntil: 0,
            flag: importedFlag(sourceCard.flags),
            createdAt: Number(sourceCard.id) > 100000000000 ? Number(sourceCard.id) : Date.now()
          };
          cardByAnkiId[String(sourceCard.id)] = card;
          importedCards.push(card);
        });

        var importedReviews = [];
        tableRows(db, "revlog").forEach(function (sourceReview) {
          var card = cardByAnkiId[String(sourceReview.cid)];
          if (!card) return;
          importedReviews.push({
            id: "anki-review-" + sourceReview.id,
            cardId: card.id,
            noteId: card.noteId,
            deckId: card.deckId,
            grade: Number(sourceReview.ease || 3),
            fromState: Number(sourceReview.type) === 0 ? "learning" : Number(sourceReview.type) === 2 ? "relearning" : "review",
            toState: "review",
            fromInterval: Number(sourceReview.lastIvl || 0),
            toInterval: Number(sourceReview.ivl || 0),
            fromEase: Number(sourceReview.factor || 2500) / 10 || 250,
            toEase: Number(sourceReview.factor || 2500) / 10 || 250,
            elapsedMs: Number(sourceReview.time || 0),
            reviewedAt: Number(sourceReview.id || 0) || Date.now()
          });
        });

        return {
          decks: importedDecks,
          notes: importedNotes,
          cards: importedCards,
          reviews: importedReviews,
          media: media,
          warnings: warnings,
          stats: {
            decks: importedDecks.length,
            notes: importedNotes.length,
            cards: importedCards.length,
            reviews: importedReviews.length,
            media: Object.keys(media).length
          }
        };
      } finally {
        db.close();
      }
    });
  }

  function importFile(file) {
    return file.arrayBuffer().then(function (buffer) {
      var entries = requireZip().unzipSync(new Uint8Array(buffer));
      var collectionName = collectionFile(entries);
      if (!collectionName) throw new Error("対応するSQLiteコレクションが見つかりません");
      return importCollection(entries, entries[collectionName]);
    });
  }

  function hashId(value) {
    var hash = 2166136261;
    String(value || "").split("").forEach(function (char) {
      hash ^= char.charCodeAt(0);
      hash = Math.imul(hash, 16777619);
    });
    return Math.abs(hash) + 1000000000;
  }

  function ankiModel(name, fields, templates, type) {
    return {
      id: MODEL_IDS[name],
      name: name === "basic" ? "Basic" : name === "reverse" ? "Basic (and reversed card)" : "Cloze",
      type: type || 0,
      mod: Math.floor(Date.now() / 1000),
      usn: -1,
      sortf: 0,
      did: null,
      tmpls: templates,
      flds: fields.map(function (field, index) {
        return { name: field, ord: index, sticky: false, rtl: false, font: "Arial", size: 20 };
      }),
      css: ".card { font-family: Arial; font-size: 20px; text-align: center; color: black; background-color: white; }",
      latexPre: "",
      latexPost: "",
      req: []
    };
  }

  function modelsForExport() {
    return {
      [MODEL_IDS.basic]: ankiModel("basic", ["Front", "Back", "Extra"], [
        { name: "Card 1", ord: 0, qfmt: "{{Front}}", afmt: "{{FrontSide}}<hr id=answer>{{Back}}<br>{{Extra}}", bqfmt: "", bafmt: "" }
      ]),
      [MODEL_IDS.reverse]: ankiModel("reverse", ["Front", "Back", "Extra"], [
        { name: "Front -> Back", ord: 0, qfmt: "{{Front}}", afmt: "{{FrontSide}}<hr id=answer>{{Back}}<br>{{Extra}}", bqfmt: "", bafmt: "" },
        { name: "Back -> Front", ord: 1, qfmt: "{{Back}}", afmt: "{{FrontSide}}<hr id=answer>{{Front}}<br>{{Extra}}", bqfmt: "", bafmt: "" }
      ]),
      [MODEL_IDS.cloze]: ankiModel("cloze", ["Text", "Extra"], [
        { name: "Cloze", ord: 0, qfmt: "{{cloze:Text}}", afmt: "{{cloze:Text}}<br>{{Extra}}", bqfmt: "", bafmt: "" }
      ], 1)
    };
  }

  function deckIdForExport(deckId) {
    return hashId("deck:" + deckId);
  }

  function noteIdForExport(note, index) {
    if (note.ankiNoteId && /^\d+$/.test(String(note.ankiNoteId))) return Number(note.ankiNoteId);
    return hashId("note:" + note.id + ":" + index);
  }

  function cardIdForExport(card, index) {
    if (card.ankiCardId && /^\d+$/.test(String(card.ankiCardId))) return Number(card.ankiCardId);
    return hashId("card:" + card.id + ":" + index);
  }

  function reviewIdForExport(review, index) {
    if (review.ankiReviewId && /^\d+$/.test(String(review.ankiReviewId))) return Number(review.ankiReviewId);
    return hashId("review:" + review.id + ":" + index);
  }

  function stripMarkup(value) {
    return String(value || "")
      .replace(/!\[[^\]]*\]\(media:([^)]+)\)/g, "$1")
      .replace(/\[sound:([^\]]+)\]/g, "$1")
      .replace(/\{\{c\d+::(.*?)(?:::.*?)?\}\}/g, "$1")
      .replace(/<[^>]+>/g, "")
      .replace(/\*\*|`/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function exportField(value, mediaNames) {
    var output = String(value || "");
    output = output.replace(/!\[[^\]]*\]\(media:([^)]+)\)/g, function (all, name) {
      mediaNames[name] = true;
      return '<img src="' + name.replace(/"/g, "&quot;") + '">';
    });
    output = output.replace(/\[sound:([^\]]+)\]/g, function (all, name) {
      mediaNames[name] = true;
      return "[sound:" + name + "]";
    });
    output = output.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    output = output.replace(/`([^`]+)`/g, "<code>$1</code>");
    return output.replace(/\n/g, "<br>");
  }

  function modelForNote(note) {
    return note.model === "cloze" ? "cloze" : note.model === "reverse" ? "reverse" : "basic";
  }

  function cardType(card) {
    if (card.state === "learning") return 1;
    if (card.state === "relearning") return 3;
    if (card.state === "review") return 2;
    return 0;
  }

  function cardQueue(card) {
    if (card.suspended) return -1;
    if (card.state === "learning" || card.state === "relearning") return 1;
    if (card.state === "review") return 2;
    return 0;
  }

  function cardFlag(flag) {
    return { red: 1, amber: 2, green: 3, blue: 4 }[flag] || 0;
  }

  function reviewType(review) {
    if (review.fromState === "learning" || review.toState === "learning") return 0;
    if (review.fromState === "relearning" || review.toState === "relearning") return 2;
    return 1;
  }

  function insert(db, sql, values) {
    var statement = db.prepare(sql);
    statement.run(values);
    statement.free();
  }

  function exportCollection(source) {
    return sqlModule().then(function (SQL) {
      var database = new SQL.Database();
      var collectionCreatedAt = Number(source.createdAt || Date.now());
      var collectionCreatedSeconds = Math.floor(collectionCreatedAt / 1000);
      var mediaNames = {};
      var models = modelsForExport();
      var deckIds = {};
      var noteIds = {};
      var cardIds = {};

      try {
        database.run("CREATE TABLE col (id integer PRIMARY KEY, crt integer NOT NULL, mod integer NOT NULL, scm integer NOT NULL, ver integer NOT NULL, dty integer NOT NULL, usn integer NOT NULL, ls integer NOT NULL, conf text NOT NULL, models text NOT NULL, decks text NOT NULL, dconf text NOT NULL, tags text NOT NULL)");
        database.run("CREATE TABLE notes (id integer PRIMARY KEY, guid text NOT NULL, mid integer NOT NULL, mod integer NOT NULL, usn integer NOT NULL, tags text NOT NULL, flds text NOT NULL, sfld integer NOT NULL, csum integer NOT NULL, flags integer NOT NULL, data text NOT NULL)");
        database.run("CREATE TABLE cards (id integer PRIMARY KEY, nid integer NOT NULL, did integer NOT NULL, ord integer NOT NULL, mod integer NOT NULL, usn integer NOT NULL, type integer NOT NULL, queue integer NOT NULL, due integer NOT NULL, ivl integer NOT NULL, factor integer NOT NULL, reps integer NOT NULL, lapses integer NOT NULL, left integer NOT NULL, odue integer NOT NULL, odid integer NOT NULL, flags integer NOT NULL, data text NOT NULL)");
        database.run("CREATE TABLE revlog (id integer PRIMARY KEY, cid integer NOT NULL, usn integer NOT NULL, ease integer NOT NULL, ivl integer NOT NULL, lastIvl integer NOT NULL, factor integer NOT NULL, time integer NOT NULL, type integer NOT NULL)");
        database.run("CREATE TABLE graves (usn integer NOT NULL, oid integer NOT NULL, type integer NOT NULL)");
        database.run("CREATE INDEX ix_notes_usn ON notes (usn)");
        database.run("CREATE INDEX ix_cards_usn ON cards (usn)");
        database.run("CREATE INDEX ix_revlog_usn ON revlog (usn)");
        database.run("CREATE INDEX ix_cards_nid ON cards (nid)");
        database.run("CREATE INDEX ix_cards_sched ON cards (did, queue, due)");
        database.run("CREATE INDEX ix_revlog_cid ON revlog (cid)");
        database.run("CREATE INDEX ix_notes_csum ON notes (csum)");

        var ankiDecks = {};
        (source.decks || []).forEach(function (deck) {
          var id = deckIdForExport(deck.id);
          deckIds[deck.id] = id;
          ankiDecks[String(id)] = {
            id: id,
            name: deck.name || "デフォルト",
            desc: deck.description || "",
            extendNew: 10,
            extendRev: 50,
            usn: -1,
            collapsed: false,
            dyn: 0,
            conf: 1,
            newToday: [0, 0],
            revToday: [0, 0],
            lrnToday: [0, 0],
            timeToday: [0, 0]
          };
        });
        if (!Object.keys(ankiDecks).length) {
          var fallbackDeckId = deckIdForExport("default");
          deckIds.default = fallbackDeckId;
          ankiDecks[String(fallbackDeckId)] = { id: fallbackDeckId, name: "デフォルト", desc: "", dyn: 0, conf: 1, usn: -1 };
        }

        var defaultConfig = {
          1: {
            id: 1,
            name: "G2 Recall",
            dyn: 0,
            new: { delays: [1, 10], ints: [1, 4], initialFactor: 2500, perDay: 20 },
            rev: { perDay: 200, fuzz: 0.05, ivlFct: 1, hardFactor: 1.2, maxIvl: Number(source.settings && source.settings.maxIntervalDays || 36500), ease4: 1.3 },
            lapse: { delays: [10], mult: 0, minInt: 1, leechFails: 8, delDelay: 0 },
            autoplay: true,
            replayq: true
          }
        };
        insert(database, "INSERT INTO col VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)", [
          1,
          collectionCreatedSeconds,
          Math.floor(Date.now() / 1000),
          Date.now(),
          11,
          0,
          -1,
          0,
          JSON.stringify({ schedVer: 2, nextPos: 1 }),
          JSON.stringify(models),
          JSON.stringify(ankiDecks),
          JSON.stringify(defaultConfig),
          "{}"
        ]);

        (source.notes || []).forEach(function (note, index) {
          var modelName = modelForNote(note);
          var modelId = MODEL_IDS[modelName];
          var values;
          if (modelName === "cloze") {
            var text = exportField(note.fields && note.fields.text, mediaNames);
            var extra = exportField(note.fields && note.fields.extra, mediaNames);
            values = [text, extra];
          } else {
            values = [
              exportField(note.fields && note.fields.front, mediaNames),
              exportField(note.fields && note.fields.back, mediaNames),
              exportField(note.fields && note.fields.extra, mediaNames)
            ];
          }
          var noteId = noteIdForExport(note, index);
          noteIds[note.id] = noteId;
          var first = stripMarkup(values[0]);
          insert(database, "INSERT INTO notes VALUES (?,?,?,?,?,?,?,?,?,?,?)", [
            noteId,
            note.ankiGuid || "g2-" + noteId,
            modelId,
            Math.floor(Number(note.updatedAt || Date.now()) / 1000),
            -1,
            (note.tags || []).join(" "),
            values.join("\x1f"),
            first,
            hashId(first) % 4294967296,
            0,
            ""
          ]);
        });

        (source.cards || []).forEach(function (card, index) {
          var note = (source.notes || []).find(function (item) {
            return item.id === card.noteId;
          });
          if (!note || !noteIds[note.id]) return;
          var cardId = cardIdForExport(card, index);
          cardIds[card.id] = cardId;
          var did = deckIds[card.deckId] || deckIds[note.deckId] || Object.keys(ankiDecks)[0];
          var type = cardType(card);
          var queue = cardQueue(card);
          var due = 0;
          if (queue === 1) {
            due = Math.floor(Number(card.due || Date.now()) / 1000);
          } else if (queue === 2) {
            due = Math.max(0, Math.round((Number(card.due || Date.now()) - collectionCreatedAt) / DAY));
          }
          var ordinal = Number(card.ordinal || 0);
          if (note.model === "cloze") ordinal = Math.max(0, ordinal - 1);
          insert(database, "INSERT INTO cards VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)", [
            cardId,
            noteIds[note.id],
            Number(did),
            ordinal,
            Math.floor(Number(card.lastReviewedAt || note.updatedAt || Date.now()) / 1000),
            -1,
            type,
            queue,
            due,
            Math.round(Number(card.interval || 0)),
            Math.round(Number(card.ease || 250) * 10),
            Number(card.reps || 0),
            Number(card.lapses || 0),
            0,
            0,
            0,
            cardFlag(card.flag),
            ""
          ]);
        });

        (source.reviews || []).forEach(function (review, index) {
          if (!cardIds[review.cardId]) return;
          insert(database, "INSERT INTO revlog VALUES (?,?,?,?,?,?,?,?,?)", [
            reviewIdForExport(review, index),
            cardIds[review.cardId],
            -1,
            Math.max(1, Math.min(4, Number(review.grade || 3))),
            Math.round(Number(review.toInterval || 0)),
            Math.round(Number(review.fromInterval || 0)),
            Math.round(Number(review.toEase || 250) * 10),
            Math.max(0, Number(review.elapsedMs || 0)),
            reviewType(review)
          ]);
        });

        var zipEntries = {
          "collection.anki2": database.export(),
          media: utf8Bytes(JSON.stringify(Object.keys(mediaNames).reduce(function (manifest, name, index) {
            manifest[String(index)] = name;
            return manifest;
          }, {})))
        };
        Object.keys(mediaNames).forEach(function (name, index) {
          if (source.media && source.media[name]) {
            zipEntries[String(index)] = dataUrlBytes(source.media[name].data);
          }
        });
        return {
          bytes: requireZip().zipSync(zipEntries, { level: 6 }),
          stats: {
            decks: Object.keys(ankiDecks).length,
            notes: (source.notes || []).length,
            cards: (source.cards || []).length,
            reviews: (source.reviews || []).length,
            media: Object.keys(mediaNames).length
          }
        };
      } finally {
        database.close();
      }
    });
  }

  root.G2Apkg = {
    importFile: importFile,
    exportCollection: exportCollection
  };
})(window);

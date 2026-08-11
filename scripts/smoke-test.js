const fs = require("fs");
const vm = require("vm");

const ids = [
  "storageStatus",
  "todayStrip",
  "deckList",
  "deckName",
  "activeDeckLabel",
  "viewTitle",
  "content",
  "toast"
];

const elements = {};

function makeEl(id) {
  const element = {
    id,
    innerHTML: "",
    textContent: "",
    value: "",
    dataset: {},
    style: {},
    classList: {
      toggle() {},
      add() {},
      remove() {}
    },
    addEventListener() {},
    matches() {
      return false;
    },
    closest() {
      return null;
    },
    querySelector() {
      return null;
    },
    setSelectionRange() {},
    focus() {}
  };
  elements[id] = element;
  return element;
}

ids.forEach(makeEl);

const tabButtons = ["review", "add", "browse", "stats", "io", "settings"].map((view) => ({
  dataset: { view },
  classList: { toggle() {} }
}));

const document = {
  querySelector(selector) {
    return selector[0] === "#" ? elements[selector.slice(1)] || null : null;
  },
  querySelectorAll(selector) {
    return selector === "#tabs button" ? tabButtons : [];
  },
  addEventListener() {},
  createElement() {
    return makeEl(`tmp-${Math.random()}`);
  },
  body: {
    appendChild() {},
    removeChild() {}
  }
};

const localStorage = {
  data: {},
  getItem(key) {
    return this.data[key] || null;
  },
  setItem(key, value) {
    this.data[key] = String(value);
  }
};

const context = {
  Blob: function Blob() {},
  URL: {
    createObjectURL() {
      return "blob:test";
    },
    revokeObjectURL() {}
  },
  clearTimeout,
  console,
  document,
  localStorage,
  setTimeout,
  window: {
    confirm() {
      return true;
    }
  }
};

vm.createContext(context);
vm.runInContext(fs.readFileSync("app.js", "utf8"), context);

if (!elements.content.innerHTML.includes("今日のカード")) {
  throw new Error("Initial review view did not render.");
}

if (!localStorage.data["g2-recall-db-v1"]) {
  throw new Error("Initial database was not saved.");
}

console.log("smoke ok");

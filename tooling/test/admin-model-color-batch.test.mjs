import test from "node:test";
import assert from "node:assert/strict";
import { parseHTML } from "linkedom";
import { mountModelColorBatch } from "../../admin/js/model-color-batch.js";

function renderEditor(api, complete = () => {}) {
  const { document } = parseHTML("<html><body><main></main></body></html>");
  globalThis.document = document;
  const host = document.querySelector("main");
  const model = { id: "model-1", persisted: true, version: 1, name: "بلوفر", category: "بلوفر", active: true, colors: [] };
  mountModelColorBatch(host, model, api, complete);
  const rows = () => [...host.querySelectorAll(".model-batch-row")];
  const edit = (index, name, code = "") => {
    const inputs = rows()[index].querySelectorAll("input");
    inputs[0].value = name;
    inputs[1].value = "#abcdef";
    inputs[2].value = code;
  };
  const save = [...host.querySelectorAll("button")].find(b => b.textContent === "حفظ الألوان");
  const feedback = [...host.querySelectorAll("[role=status]")].at(-1);
  return { host, rows, edit, save, feedback };
}

function registry() {
  const state = { version: 1, colors: [], products: new Map(), creates: 0, attaches: 0, keys: [] };
  const api = async (op, args) => {
    if (op === "products.create") {
      state.creates++;
      state.keys.push(args.idempotency_key);
      if (!state.products.has(args.idempotency_key)) {
        state.products.set(args.idempotency_key, "SS-" + String(1100 + state.products.size));
      }
      return { outcome: state.creates === state.products.size ? "created" : "existing", code: state.products.get(args.idempotency_key) };
    }
    if (op === "models.list") {
      return { outcome: "ok", data: [{ id: "model-1", active: true, version: state.version, colors: state.colors.slice() }] };
    }
    if (op === "models.attach") {
      assert.equal(args.version, state.version, "must read the latest model version before each attachment");
      state.attaches++;
      state.colors.push({ code: args.code, name: args.name, hex: args.hex, active: true });
      state.version++;
      return { outcome: "saved", version: state.version };
    }
    throw Error("Unexpected " + op);
  };
  return { state, api };
}

test("adds two colours to one model as separate Draft SKUs and advances model version", async () => {
  const { api, state } = registry();
  let complete;
  const ui = renderEditor(api, message => { complete = message; });
  ui.edit(0, "بيبي بلو");
  ui.edit(1, "بينك");
  await ui.save.onclick();
  assert.equal(state.creates, 2);
  assert.equal(state.attaches, 2);
  assert.equal(state.version, 3);
  assert.deepEqual(state.colors.map(c => c.name), ["بيبي بلو", "بينك"]);
  assert.deepEqual(state.colors.map(c => c.code), ["SS-1100", "SS-1101"]);
  assert.match(complete, /اتسجل 2 لون/);
});

test("lost create response retries with the same key and never duplicates a product", async () => {
  const { api: original, state } = registry();
  let lost = false;
  const ui = renderEditor(async (op, args) => {
    if (op === "products.create" && !lost) {
      lost = true;
      await original(op, args);
      throw Error("connection lost after server created Draft");
    }
    return original(op, args);
  });
  ui.edit(0, "أسود");
  await ui.save.onclick();
  assert.equal(state.products.size, 1);
  assert.equal(state.attaches, 0);
  await ui.save.onclick();
  assert.equal(state.creates, 2, "first lost create, then retry using the same key");
  assert.equal(state.products.size, 1);
  assert.equal(state.keys[0], state.keys[1]);
  assert.equal(state.colors.length, 1);
});

test("lost attach response reconciles existing registry membership before retry", async () => {
  const { api: original, state } = registry();
  let lost = false;
  const ui = renderEditor(async (op, args) => {
    if (op === "models.attach" && !lost) {
      lost = true;
      await original(op, args);
      throw Error("lost attach response");
    }
    return original(op, args);
  });
  ui.edit(0, "بني");
  ui.edit(1, "زيتي");
  await ui.save.onclick();
  assert.equal(state.attaches, 1);
  await ui.save.onclick();
  assert.equal(state.attaches, 2, "reconcile first attachment; only second colour is attached");
  assert.equal(state.creates, 2, "no duplicate Draft on retry");
  assert.equal(state.colors.length, 2);
});

test("duplicate names are refused before any product or model mutation", async () => {
  const { state, api } = registry();
  const ui = renderEditor(api);
  ui.edit(0, "أسود");
  ui.edit(1, "أسود");
  await ui.save.onclick();
  assert.equal(state.creates, 0);
  assert.equal(state.attaches, 0);
  assert.match(ui.feedback.textContent, /ممنوع التكرار/);
});

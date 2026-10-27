"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

function makeElement() {
  const listeners = {};
  return {
    value: "", textContent: "", disabled: false, attrs: {}, listeners,
    addEventListener(type, fn) { listeners[type] = fn; },
    setAttribute(key, value) { this.attrs[key] = value; },
    getAttribute(key) { return this.attrs[key] || null; },
    focus() {}, dispatchEvent() {}
  };
}
async function runGeneration(question) {
  const panel = makeElement(); panel.attrs["data-aurora-kind"] = "qcm";
  const input = makeElement(); input.value = "Prépare 1 question sur les dérivées";
  const button = makeElement(); button.textContent = "Préparer";
  const status = makeElement();
  const byId = {
    auroraPagePromptPanel: panel, auroraPagePrompt: input,
    auroraPagePromptSubmit: button, auroraPagePromptStatus: status
  };
  const local = new Map(), session = new Map();
  const localStorage = { setItem(k,v){local.set(k,v)}, getItem(k){return local.get(k)||null} };
  const sessionStorage = { setItem(k,v){session.set(k,v)}, getItem(k){return session.get(k)||null} };
  const location = { pathname: "/qcm.html", hash: "", href: "" };
  const window = {
    auroreAuthReady: Promise.resolve({
      getSession: async () => ({ access_token: "test" }),
      client: { functions: { invoke: async () => ({ data: { reply: JSON.stringify({
        reply: "Prêt", action: { type: "create_qcm", title: "Dérivées", questions: [question] }
      }) } }) } }
    }),
    location
  };
  const document = { getElementById(id){return byId[id]||null} };
  vm.runInNewContext(fs.readFileSync("aurora-page-prompt.js", "utf8"), {
    document, window, location, localStorage, sessionStorage,
    URLSearchParams, Date, Math, String, Array, Number, Set, JSON, Error,
    Event: function Event() {}, setTimeout, console
  });
  await button.listeners.click();
  return { local, status, button, location };
}
(async () => {
  const valid = await runGeneration({
    prompt: "Calculer la dérivée de f(x)=x^2.",
    options: ["\\(2x\\)", "\\(x\\)", "\\(x^2\\)", "\\(2\\)"],
    correctIndex: 0, explanation: "La dérivée de \\(x^2\\) est \\(2x\\)."
  });
  const draft = JSON.parse(valid.local.get("aurore-qcm-editor-draft-v1"));
  assert.equal(draft.q.questions.length, 1);
  assert.ok(draft.q.questions[0].correctOptionId);
  assert.equal(draft.q.questions[0].options.findIndex(o => o.id === draft.q.questions[0].correctOptionId), 0);
  assert.match(valid.location.href, /fromAurora=/);

  const invalid = await runGeneration({
    prompt: "Calculer la dérivée.",
    options: ["2x", "x", "x²", "2"],
    explanation: "La réponse est 2x."
  });
  assert.equal(invalid.local.has("aurore-qcm-editor-draft-v1"), false,
    "never writes a QCM draft if the correct answer is missing");
  assert.match(invalid.status.textContent, /bonne réponse clairement identifiable/);
  assert.equal(invalid.button.disabled, false);

  const malformed = await runGeneration({
    prompt: "Calculer \\(f(x)=x^2.",
    options: ["\\(2x\\)", "\\(x\\)", "\\(x^2\\)", "\\(2\\)"],
    correctIndex: 0, explanation: "La dérivée est \\(2x\\)."
  });
  assert.equal(malformed.local.has("aurore-qcm-editor-draft-v1"), false,
    "does not store QCMs containing unbalanced LaTeX delimiters");
  assert.match(malformed.status.textContent, /LaTeX.*incomplets/);
  console.log("Aurora QCM generation tests passed (valid answer, missing-answer rejection, malformed-LaTeX rejection).");
})().catch((error) => { console.error(error); process.exitCode = 1; });
const assert = require('node:assert/strict');
const fs = require('node:fs');
const source = fs.readFileSync('cartes.js', 'utf8');
const start = source.indexOf('function validImage(');
const end = source.indexOf('function syncRowAppearance(', start);
assert(start >= 0 && end > start, 'Storage helpers must be present in cartes.js');
const helperSource = source.slice(start, end);
const KEY = 'aurore-memory-cards-v1';
const DRAFT = 'aurore-memory-flashcard-draft-v1:new';

class QuotaStorage {
  constructor(initial, quota) { this.values = new Map(Object.entries(initial || {})); this.quota = quota; }
  getItem(key) { return this.values.has(key) ? this.values.get(key) : null; }
  removeItem(key) { this.values.delete(key); }
  setItem(key, value) {
    value = String(value);
    let used = value.length;
    for (const [k, v] of this.values) if (k !== key) used += v.length;
    if (used > this.quota) {
      const error = new Error('Storage quota exceeded');
      error.name = 'QuotaExceededError';
      error.code = 22;
      throw error;
    }
    this.values.set(key, value);
  }
}

class FakeImage {
  naturalWidth = 1200;
  naturalHeight = 800;
  set src(value) { this._src = value; this.onload(); }
}
const fakeDocument = {
  createElement() {
    return {
      width: 1, height: 1,
      getContext() { return { drawImage() {}, fillRect() {}, set fillStyle(value) {} }; },
      toDataURL(type) { return 'data:image/webp;base64,' + 'x'.repeat(250); }
    };
  }
};
function makeTools(storage) {
  return new Function('localStorage', 'draftKey', 'KEY', 'Blob', 'Image', 'document',
    helperSource + '\nreturn { storeSeriesSafely, isQuotaExceeded };')(
      storage, DRAFT, KEY, Blob, FakeImage, fakeDocument);
}

(async () => {
  // The common failure: the draft duplicates an image-heavy form while the series is saved.
  {
    const storage = new QuotaStorage({ [KEY]: 'o'.repeat(1000), [DRAFT]: 'd'.repeat(9000) }, 11000);
    const tools = makeTools(storage);
    const data = { cards: [{ id: 'new-card', front: 'Question', back: 'Answer' }], deckStyles: {} };
    const result = await tools.storeSeriesSafely(data);
    assert.equal(JSON.parse(storage.getItem(KEY)).cards[0].id, 'new-card');
    assert.equal(storage.getItem(DRAFT), null, 'successful save removes the temporary draft');
    assert.equal(result.compacted, false, 'no image loss/compaction is needed when removing the duplicate draft is enough');
    console.log('PASS: draft is removed before the primary write, freeing quota');
  }

  // If the stored library itself is too large, images are compacted and the save retried.
  {
    const storage = new QuotaStorage({ [KEY]: 'old-state' }, 7000);
    const tools = makeTools(storage);
    const largeImage = 'data:image/jpeg;base64,' + 'i'.repeat(15000);
    const data = { cards: [{ id: 'image-card', backgroundImage: largeImage }], deckStyles: {} };
    const result = await tools.storeSeriesSafely(data);
    const saved = JSON.parse(storage.getItem(KEY));
    assert.equal(saved.cards[0].id, 'image-card');
    assert.match(saved.cards[0].backgroundImage, /^data:image\/webp;base64,/);
    assert.ok(saved.cards[0].backgroundImage.length < largeImage.length);
    assert.equal(result.compacted, true);
    console.log('PASS: image compaction recovers a quota failure without dropping cards');
  }

  // If the quota still cannot accommodate text-only data, keep the old library and restore the draft.
  {
    const oldState = JSON.stringify({ cards: [{ id: 'existing' }] });
    const draft = JSON.stringify({ title: 'unfinished', rows: [{ front: 'keep this' }] });
    const storage = new QuotaStorage({ [KEY]: oldState, [DRAFT]: draft }, 2500);
    const tools = makeTools(storage);
    const tooLarge = { cards: [{ id: 'large', front: 'x'.repeat(5000) }], deckStyles: {} };
    await assert.rejects(() => tools.storeSeriesSafely(tooLarge), tools.isQuotaExceeded);
    assert.equal(storage.getItem(KEY), oldState, 'the saved library must remain unchanged');
    assert.equal(storage.getItem(DRAFT), draft, 'the user draft must be restored after a failed save');
    console.log('PASS: unrecoverable quota errors preserve the existing library and draft');
  }
})().catch(error => { console.error(error); process.exitCode = 1; });

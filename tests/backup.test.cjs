// Runs backup.js against an in-memory storage: backup, restore, the older export, and bad files.
const assert = require('assert');
const B = require('../backup.js');

function mem(init) {
  const m = new Map(Object.entries(init || {}));
  return {
    getItem: k => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: k => m.delete(k),
    dump: () => Object.fromEntries(m)
  };
}

const phone = mem({
  ar_profile: JSON.stringify({ name: 'Asha', city: 'Pune' }),
  incomeEntries: JSON.stringify([{ id: 1, amount: 1200 }, { id: 2, amount: 800 }]),
  expenses: JSON.stringify([{ id: 3, amount: 50 }]),
  ar_goals: JSON.stringify([{ id: 'g' }]),
  ar_lang: 'HI',
  ar_pin: '123456',
  ar_bio_cred: 'cred',
  ar_tier: 'pro', ar_tier_src: 'play', ar_play_plan: 'yearly', ar_tier_token: 'ar_pro_play_yearly',
  ar_onboarded: '1'
});

// 1. Backup keeps the records, never the PIN, fingerprint or Pro.
const backup = B.collect(phone, new Date('2026-11-19T12:00:00Z'));
assert.strictEqual(backup.kind, 'sakred-artha-backup');
assert.strictEqual(backup.exportedAt, '2026-11-19T12:00:00.000Z');
assert.deepStrictEqual(Object.keys(backup.data).sort(), ['ar_goals', 'ar_lang', 'ar_profile', 'expenses', 'incomeEntries']);

// 2. Round trip onto a wiped phone (onboarding not done): everything comes back, app opens.
const fresh = mem({});
const r = B.parse(JSON.stringify(backup));
assert.ok(r.ok, r.reason);
assert.deepStrictEqual(r.counts, { incomeEntries: 2, expenses: 1, ar_goals: 1 });
assert.strictEqual(r.exportedAt, '2026-11-19T12:00:00.000Z');
B.apply(fresh, r.entries);
for (const k of Object.keys(backup.data)) assert.strictEqual(fresh.getItem(k), backup.data[k], k);
assert.strictEqual(fresh.getItem('ar_onboarded'), '1');
assert.strictEqual(fresh.getItem('ar_tier'), null);

// 3. Restore replaces the phone's records but leaves PIN, fingerprint and Pro alone.
const other = mem({ incomeEntries: '[{"id":9}]', moods: '[1,2]', ar_pin: '999999', ar_bio_cred: 'x', ar_tier: 'pro', ar_tier_src: 'play' });
B.apply(other, r.entries);
assert.strictEqual(other.getItem('incomeEntries'), backup.data.incomeEntries);
assert.strictEqual(other.getItem('moods'), null, 'records not in the backup are cleared');
assert.strictEqual(other.getItem('ar_pin'), '999999');
assert.strictEqual(other.getItem('ar_bio_cred'), 'x');
assert.strictEqual(other.getItem('ar_tier'), 'pro');

// 4. A file that tries to set the PIN or Pro: those keys are ignored.
const sneaky = B.parse(JSON.stringify({ kind: 'sakred-artha-backup', version: 2, data: { ar_tier: 'pro', ar_pin: '000000', incomeEntries: '[]' } }));
assert.ok(sneaky.ok);
assert.deepStrictEqual(sneaky.entries.map(e => e[0]), ['incomeEntries']);

// 5. The older "Export my data" file still restores.
const old = B.parse(JSON.stringify({ profile: { name: 'Ravi' }, incomeEntries: [{ id: 1 }], expenses: [], moods: [], rmEntries: [], exportedAt: '2026-10-01T00:00:00Z', note: 'Exported from Sakred Artha v5.0' }));
assert.ok(old.ok, old.reason);
assert.deepStrictEqual(old.entries.map(e => e[0]).sort(), ['ar_profile', 'expenses', 'incomeEntries', 'moods', 'rmEntries']);
assert.strictEqual(old.counts.incomeEntries, 1);

// 6. Bad files are refused with a plain reason and change nothing.
for (const [text, why] of [
  ['', /empty/], ['not json', /not an Artha backup/], ['[1,2]', /not an Artha backup/], ['{"hello":1}', /not an Artha backup/],
  [JSON.stringify({ kind: 'sakred-artha-backup', version: 3, data: {} }), /newer Artha/],
  [JSON.stringify({ kind: 'sakred-artha-backup', version: 2, data: { incomeEntries: '{broken' } }), /damaged/],
  [JSON.stringify({ kind: 'sakred-artha-backup', version: 2, data: { incomeEntries: 5 } }), /damaged/],
  [JSON.stringify({ kind: 'sakred-artha-backup', version: 2, data: { ar_pin: '1' } }), /no records/],
  [JSON.stringify({ incomeEntries: 'oops' }), /damaged/]
]) {
  const x = B.parse(text);
  assert.strictEqual(x.ok, false, text);
  assert.ok(why.test(x.reason), text + ' -> ' + x.reason);
}

// 7. keepStorage never throws, with or without the browser API.
(async () => {
  assert.strictEqual(await B.keepStorage(), null);
  console.log('backup.js: all 7 scenarios pass');
})().catch(e => { console.error('FAIL', e); process.exit(1); });

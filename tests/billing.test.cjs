// Runs billing.js against a fake Digital Goods service + PaymentRequest.
const fs = require('fs'), vm = require('vm'), assert = require('assert');
const code = fs.readFileSync('' + require('path').join(__dirname, '..', 'billing.js') + '', 'utf8');

function load(win) { const ctx = vm.createContext({ window: win, Intl, Array, Number, Error }); vm.runInContext(code, ctx); return win.ArthaBilling; }

(async () => {
  // 1. Browser: no billing
  let B = load({});
  assert.strictEqual(await B.isAvailable(), false);
  assert.strictEqual(JSON.stringify(await B.getPrices()), JSON.stringify({ monthly: '₹49', yearly: '₹399' }));
  assert.strictEqual(await B.activePlan(), undefined);
  await assert.rejects(B.buy('monthly'), e => e.code === 'unavailable');

  // 2. Play app with an active yearly sub
  let completed = null;
  const svc = {
    getDetails: async ids => ids.map(id => ({ itemId: id, price: { currency: 'INR', value: id.endsWith('yearly') ? '399.00' : '49.00' } })),
    listPurchases: async () => [{ itemId: 'artha_pro_yearly', purchaseToken: 't' }]
  };
  class PR { constructor(m) { this.m = m; } async show() { return { details: { purchaseToken: 'tok' }, complete: async r => { completed = r; } }; } }
  B = load({ getDigitalGoodsService: async () => svc, PaymentRequest: PR });
  assert.strictEqual(await B.isAvailable(), true);
  const prices = await B.getPrices();
  assert.ok(/399/.test(prices.yearly) && /49/.test(prices.monthly), JSON.stringify(prices));
  assert.strictEqual(await B.activePlan(), 'yearly');
  assert.strictEqual(await B.buy('monthly'), true);
  assert.strictEqual(completed, 'success');
  await assert.rejects(B.buy('weekly'), e => e.code === 'bad_plan');

  // 3. No active sub; user cancels the sheet
  class PRCancel { async show() { const e = new Error('x'); e.name = 'AbortError'; throw e; } }
  B = load({ getDigitalGoodsService: async () => ({ ...svc, listPurchases: async () => [] }), PaymentRequest: PRCancel });
  assert.strictEqual(await B.activePlan(), null);
  await assert.rejects(B.buy('yearly'), e => e.code === 'cancelled');

  // 4. Purchase without a token is failed, not completed
  let comp2 = null;
  class PRNoTok { async show() { return { details: {}, complete: async r => { comp2 = r; } }; } }
  B = load({ getDigitalGoodsService: async () => svc, PaymentRequest: PRNoTok });
  await assert.rejects(B.buy('yearly'), e => e.code === 'no_token');
  assert.strictEqual(comp2, 'fail');

  console.log('billing.js: all 4 scenarios pass; prices', prices);
})().catch(e => { console.error('FAIL', e); process.exit(1); });

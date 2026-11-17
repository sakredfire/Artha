// Sakred Artha Pro — Google Play Billing via the Digital Goods API + Payment Request.
// Classic script (index.html is not a module): exposes window.ArthaBilling.
//
// Works only inside the Play-installed TWA (com.sakredfire.sidestack) once its build has the
// androidbrowserhelper billing bridge (twa-manifest features.playBilling.enabled = true).
// Everywhere else every call reports "unavailable" and the app sells nothing in the browser:
// it only points to the Play listing (Play Payments policy: no external payment link in the app).
// Pro is an auto-renewing subscription with two base plans. listPurchases() lists only active
// subscriptions, so the entitlement is re-checked on every launch and lapses with the subscription.
(function () {
  'use strict';

  var PLAY_BILLING_METHOD = 'https://play.google.com/billing';
  var SKUS = { monthly: 'artha_pro_monthly', yearly: 'artha_pro_yearly' };
  var PRICE_FALLBACK = { monthly: '₹49', yearly: '₹399' };
  var PACKAGE = 'com.sakredfire.sidestack';
  var PLAY_LISTING_URL = 'https://play.google.com/store/apps/details?id=' + PACKAGE;
  var MANAGE_URL = 'https://play.google.com/store/account/subscriptions?package=' + PACKAGE;

  function PurchaseError(code, message) {
    var e = new Error(message || code);
    e.code = code;
    return e;
  }

  // A TWA launch arrives with an android-app:// referrer on its first page. Remember it for the
  // session so an older app build without the billing bridge can say "update the app".
  try {
    if (typeof document !== 'undefined' && document.referrer.indexOf('android-app://') === 0) {
      sessionStorage.setItem('ar_in_play_app', '1');
    }
  } catch (e) { /* storage blocked */ }
  function inPlayApp() {
    try { return sessionStorage.getItem('ar_in_play_app') === '1'; } catch (e) { return false; }
  }

  var svcPromise = null;
  function service() {
    if (svcPromise) return svcPromise;
    svcPromise = (async function () {
      if (typeof window.getDigitalGoodsService !== 'function') return null;
      try {
        return (await window.getDigitalGoodsService(PLAY_BILLING_METHOD)) || null;
      } catch (e) {
        return null;
      }
    })();
    return svcPromise;
  }

  async function isAvailable() {
    if (typeof window.PaymentRequest !== 'function') return false;
    return (await service()) !== null;
  }

  function formatPrice(price) {
    try {
      return new Intl.NumberFormat('en-IN', { style: 'currency', currency: price.currency, maximumFractionDigits: 2 })
        .format(Number(price.value))
        .replace(/\.00$/, '');
    } catch (e) {
      return price.currency + ' ' + price.value;
    }
  }

  /** Localised Play prices for both plans, or the fallbacks. */
  async function getPrices() {
    var out = { monthly: PRICE_FALLBACK.monthly, yearly: PRICE_FALLBACK.yearly };
    var svc = await service();
    if (!svc) return out;
    try {
      var details = await svc.getDetails([SKUS.monthly, SKUS.yearly]);
      ['monthly', 'yearly'].forEach(function (plan) {
        var d = Array.isArray(details) ? details.find(function (x) { return x.itemId === SKUS[plan]; }) : null;
        if (d && d.price) out[plan] = formatPrice(d.price);
      });
    } catch (e) { /* keep fallbacks */ }
    return out;
  }

  /** 'monthly' | 'yearly' when this Google account has an active Pro subscription, else null.
   *  undefined when billing is unavailable (so callers can tell "no" from "can't tell"). */
  async function activePlan() {
    var svc = await service();
    if (!svc) return undefined;
    try {
      var list = await svc.listPurchases();
      if (!Array.isArray(list)) return null;
      if (list.some(function (p) { return p.itemId === SKUS.yearly; })) return 'yearly';
      if (list.some(function (p) { return p.itemId === SKUS.monthly; })) return 'monthly';
      return null;
    } catch (e) {
      return undefined;
    }
  }

  /** Subscribe inside the Play app. Resolves true on success; throws {code} otherwise. */
  async function buy(plan) {
    var sku = SKUS[plan];
    if (!sku) throw PurchaseError('bad_plan');
    if (!(await isAvailable())) throw PurchaseError('unavailable');
    var request = new window.PaymentRequest(
      [{ supportedMethods: PLAY_BILLING_METHOD, data: { sku: sku } }],
      // Play ignores this total and charges the Play Console price.
      { total: { label: sku, amount: { currency: 'INR', value: '0' } } }
    );
    var response;
    try {
      response = await request.show();
    } catch (e) {
      throw PurchaseError(e && e.name === 'AbortError' ? 'cancelled' : 'show_failed', e && e.message);
    }
    var details = (response && response.details) || {};
    if (!(details.purchaseToken || details.token)) {
      try { await response.complete('fail'); } catch (e) { /* ignore */ }
      throw PurchaseError('no_token');
    }
    // complete('success') makes the billing bridge acknowledge the purchase with Play.
    await response.complete('success');
    return true;
  }

  window.ArthaBilling = {
    SKUS: SKUS,
    PRICE_FALLBACK: PRICE_FALLBACK,
    PLAY_LISTING_URL: PLAY_LISTING_URL,
    MANAGE_URL: MANAGE_URL,
    isAvailable: isAvailable,
    inPlayApp: inPlayApp,
    getPrices: getPrices,
    activePlan: activePlan,
    buy: buy,
    formatPrice: formatPrice
  };
})();

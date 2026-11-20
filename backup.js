// Sakred Artha: back up and restore the records kept on this phone.
// Classic script (index.html is not a module): exposes window.ArthaBackup.
//
// Everything Artha knows lives only in this phone's browser storage, so a cleared browser or a new
// phone loses it. A backup is a JSON file the user saves; restore reads it back.
// - Writes only the keys listed in DATA_KEYS. Never the PIN, the fingerprint credential, or Pro
//   (Pro always follows Google Play or an unlock code, never a file).
// - Also reads the older export (profile, incomeEntries, expenses, moods, rmEntries).
(function () {
  'use strict';

  var KIND = 'sakred-artha-backup';
  var VERSION = 2;

  // key -> 'json' (must parse as JSON) or 'text'
  var DATA_KEYS = {
    ar_profile: 'json',
    incomeEntries: 'json',
    expenses: 'json',
    moods: 'json',
    rmEntries: 'json',
    ar_goals: 'json',
    ar_invoices: 'json',
    ar_emergency: 'json',
    ar_lang: 'text',
    ar_tax_type: 'text',
    ar_lb_optin: 'text',
    lastPdfDate: 'text'
  };
  var LIST_KEYS = ['incomeEntries', 'expenses', 'moods', 'rmEntries', 'ar_goals', 'ar_invoices'];
  var MAX_BYTES = 20 * 1024 * 1024;

  function okJson(text) {
    try { JSON.parse(text); return true; } catch (e) { return false; }
  }

  /** The backup object for everything in DATA_KEYS that this phone holds. */
  function collect(storage, now) {
    var data = {};
    Object.keys(DATA_KEYS).forEach(function (k) {
      var v = storage.getItem(k);
      if (typeof v === 'string' && v !== '') data[k] = v;
    });
    return { kind: KIND, version: VERSION, exportedAt: (now || new Date()).toISOString(), app: 'Sakred Artha', data: data };
  }

  function counts(entries) {
    var out = {};
    entries.forEach(function (e) {
      if (LIST_KEYS.indexOf(e[0]) === -1) return;
      try { var a = JSON.parse(e[1]); if (Array.isArray(a)) out[e[0]] = a.length; } catch (x) { /* checked earlier */ }
    });
    return out;
  }

  /** Reads a backup file. {ok:true, entries:[[key,value]], exportedAt, counts} or {ok:false, reason}. */
  function parse(text) {
    if (typeof text !== 'string' || !text.trim()) return { ok: false, reason: 'The file is empty.' };
    if (text.length > MAX_BYTES) return { ok: false, reason: 'The file is too large to be an Artha backup.' };
    var obj;
    try { obj = JSON.parse(text); } catch (e) { return { ok: false, reason: 'This is not an Artha backup file.' }; }
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return { ok: false, reason: 'This is not an Artha backup file.' };

    var entries = [];
    if (obj.kind === KIND) {
      if (typeof obj.version !== 'number' || obj.version > VERSION) {
        return { ok: false, reason: 'This backup comes from a newer Artha. Update the app, then try again.' };
      }
      var data = obj.data;
      if (!data || typeof data !== 'object' || Array.isArray(data)) return { ok: false, reason: 'The backup file is damaged.' };
      for (var k in data) {
        if (!Object.prototype.hasOwnProperty.call(data, k)) continue;
        if (!Object.prototype.hasOwnProperty.call(DATA_KEYS, k)) continue; // ignore anything else (PIN, Pro, unknown)
        var v = data[k];
        if (typeof v !== 'string') return { ok: false, reason: 'The backup file is damaged.' };
        if (DATA_KEYS[k] === 'json' && !okJson(v)) return { ok: false, reason: 'The backup file is damaged.' };
        entries.push([k, v]);
      }
    } else if ('incomeEntries' in obj || 'profile' in obj) {
      // The older "Export my data" file.
      var lists = ['incomeEntries', 'expenses', 'moods', 'rmEntries'];
      for (var i = 0; i < lists.length; i++) {
        var name = lists[i];
        if (!(name in obj)) continue;
        if (!Array.isArray(obj[name])) return { ok: false, reason: 'The backup file is damaged.' };
        entries.push([name, JSON.stringify(obj[name])]);
      }
      if (obj.profile && typeof obj.profile === 'object' && !Array.isArray(obj.profile)) {
        entries.push(['ar_profile', JSON.stringify(obj.profile)]);
      }
    } else {
      return { ok: false, reason: 'This is not an Artha backup file.' };
    }
    if (!entries.length) return { ok: false, reason: 'The backup has no records in it.' };
    var at = typeof obj.exportedAt === 'string' && !isNaN(Date.parse(obj.exportedAt)) ? obj.exportedAt : null;
    return { ok: true, entries: entries, exportedAt: at, counts: counts(entries) };
  }

  /** Replaces this phone's records with the backup's. Keys the backup does not have are cleared,
   *  so the phone ends up exactly as the backup was. PIN, fingerprint and Pro are left alone. */
  function apply(storage, entries) {
    var incoming = {};
    entries.forEach(function (e) { incoming[e[0]] = e[1]; });
    Object.keys(DATA_KEYS).forEach(function (k) {
      if (Object.prototype.hasOwnProperty.call(incoming, k)) storage.setItem(k, incoming[k]);
      else storage.removeItem(k);
    });
    storage.setItem('ar_onboarded', '1');
  }

  /** Asks the browser to keep Artha's storage when the phone runs low on space. Never throws. */
  async function keepStorage() {
    try {
      var s = typeof navigator !== 'undefined' ? navigator.storage : null;
      if (!s || typeof s.persist !== 'function') return null;
      if (typeof s.persisted === 'function' && (await s.persisted())) return true;
      return await s.persist();
    } catch (e) {
      return null;
    }
  }

  var api = { KIND: KIND, VERSION: VERSION, DATA_KEYS: DATA_KEYS, collect: collect, parse: parse, apply: apply, keepStorage: keepStorage };
  if (typeof window !== 'undefined') window.ArthaBackup = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();

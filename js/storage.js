/* storage.js — IndexedDB persistence for annotations, keyed per book.
   DB: "tcm-reader", store "annotations" (key = bookId, value = {bookId, annotations, updatedAt}).
   Small settings (student name, last book/spread, flags) live in localStorage. */
(function (global) {
  'use strict';
  var DB_NAME = 'tcm-reader';
  var DB_VERSION = 1;
  var STORE = 'annotations';
  var DIRTY_KEY = 'tcm.dirtySinceBackup';
  var dbPromise = null;

  function openDb() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise(function (resolve, reject) {
      if (!('indexedDB' in global)) { reject(new Error('IndexedDB is not available in this browser.')); return; }
      var req = global.indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = function () {
        var db = req.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'bookId' });
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
    return dbPromise;
  }

  function tx(mode, fn) {
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var t = db.transaction(STORE, mode);
        var store = t.objectStore(STORE);
        var out;
        try { out = fn(store); } catch (e) { reject(e); return; }
        t.oncomplete = function () { resolve(out && out.__result); };
        t.onerror = function () { reject(t.error); };
        t.onabort = function () { reject(t.error || new Error('Transaction aborted')); };
      });
    });
  }

  function requestToPromise(req) {
    return new Promise(function (resolve, reject) {
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
  }

  var TCMStorage = {
    getAnnotations: function (bookId) {
      return openDb().then(function (db) {
        return requestToPromise(db.transaction(STORE, 'readonly').objectStore(STORE).get(bookId));
      }).then(function (rec) { return rec && Array.isArray(rec.annotations) ? rec.annotations : []; })
        .catch(function () { return []; });
    },
    setAnnotations: function (bookId, annotations) {
      return tx('readwrite', function (store) {
        store.put({ bookId: bookId, annotations: annotations, updatedAt: Date.now() });
      }).then(function () { TCMStorage.markDirty(); });
    },
    getAll: function () {
      return openDb().then(function (db) {
        return requestToPromise(db.transaction(STORE, 'readonly').objectStore(STORE).getAll());
      }).then(function (recs) {
        var out = {};
        (recs || []).forEach(function (r) { out[r.bookId] = r.annotations || []; });
        return out;
      }).catch(function () { return {}; });
    },
    importAll: function (byBook) {
      return tx('readwrite', function (store) {
        Object.keys(byBook || {}).forEach(function (bookId) {
          store.put({ bookId: bookId, annotations: byBook[bookId] || [], updatedAt: Date.now() });
        });
      });
    },
    markDirty: function () { try { global.localStorage.setItem(DIRTY_KEY, '1'); } catch (e) {} },
    clearDirty: function () { try { global.localStorage.removeItem(DIRTY_KEY); } catch (e) {} },
    isDirty: function () { try { return global.localStorage.getItem(DIRTY_KEY) === '1'; } catch (e) { return false; } },
    getSetting: function (key, fallback) {
      try { var v = global.localStorage.getItem('tcm.' + key); return v === null ? fallback : JSON.parse(v); }
      catch (e) { return fallback; }
    },
    setSetting: function (key, value) {
      try { global.localStorage.setItem('tcm.' + key, JSON.stringify(value)); } catch (e) {}
    }
  };

  global.TCMStorage = TCMStorage;
  if (typeof module !== 'undefined' && module.exports) module.exports = TCMStorage;
})(typeof window !== 'undefined' ? window : globalThis);

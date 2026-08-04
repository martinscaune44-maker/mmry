// ---------------------------------------------------------------------------
// MMRY — local journey storage
//
// Journeys live in IndexedDB rather than localStorage because audio is stored
// as Blobs; localStorage only holds strings and caps out around 5MB.
// Nothing leaves the device.
// ---------------------------------------------------------------------------

const MmryStore = {
  DB_NAME: "mmry",
  STORE: "journeys",
  VERSION: 1,
  _db: null,

  open() {
    if (this._db) return Promise.resolve(this._db);

    return new Promise((resolve, reject) => {
      const req = indexedDB.open(this.DB_NAME, this.VERSION);

      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(this.STORE)) {
          db.createObjectStore(this.STORE, { keyPath: "id" });
        }
      };

      req.onsuccess = () => {
        this._db = req.result;
        resolve(this._db);
      };
      req.onerror = () => reject(req.error);
    });
  },

  _tx(mode, fn) {
    return this.open().then(
      (db) =>
        new Promise((resolve, reject) => {
          const tx = db.transaction(this.STORE, mode);
          const req = fn(tx.objectStore(this.STORE));
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => reject(req.error);
        })
    );
  },

  save(journey) {
    return this._tx("readwrite", (store) => store.put(journey));
  },

  load(id) {
    return this._tx("readonly", (store) => store.get(id));
  },

  remove(id) {
    return this._tx("readwrite", (store) => store.delete(id));
  },
};

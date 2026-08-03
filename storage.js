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

// ---------------------------------------------------------------------------
// Export / import
//
// A journey travels as a single JSON file with audio inlined as base64. That
// inflates size by about a third, which is fine for a handful of short clips
// and poor for long music tracks — worth replacing with a zip if journeys grow.
// ---------------------------------------------------------------------------

const MmryTransfer = {
  blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result.split(",")[1]);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
  },

  base64ToBlob(base64, type) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new Blob([bytes], { type });
  },

  async export(journey) {
    const checkpoints = await Promise.all(
      journey.checkpoints.map(async (cp) => {
        const out = { ...cp, audioBlob: undefined };
        if (cp.audioBlob) {
          out.audioBase64 = await this.blobToBase64(cp.audioBlob);
          out.audioType = cp.audioBlob.type || "audio/mpeg";
        }
        return out;
      })
    );

    return JSON.stringify(
      { format: "mmry-journey", version: 1, name: journey.name, checkpoints },
      null,
      2
    );
  },

  import(text) {
    const data = JSON.parse(text);
    if (data.format !== "mmry-journey") {
      throw new Error("Not an MMRY journey file");
    }

    return {
      id: "current",
      name: data.name || "Imported journey",
      checkpoints: (data.checkpoints || []).map((cp) => ({
        id: cp.id,
        name: cp.name,
        lat: cp.lat,
        lng: cp.lng,
        radius: cp.radius,
        fadeMs: cp.fadeMs,
        audioName: cp.audioName,
        audioBlob: cp.audioBase64
          ? this.base64ToBlob(cp.audioBase64, cp.audioType)
          : null,
      })),
    };
  },
};

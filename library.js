// ---------------------------------------------------------------------------
// MMRY — this device's library.
//
// Two lists: walks you have opened (recents) and walks you chose to keep
// (saved). Both live in localStorage rather than the database, because both
// are about this device rather than this account — a walk arrives as a link
// from a friend, and needing an account before it can be remembered would
// defeat the point of the link.
//
// The consequence, stated plainly: these do not follow you to another device,
// and clearing site data loses them. That trade is worth making until there is
// a reason to sync, at which point they become two more tables.
// ---------------------------------------------------------------------------

const MmryLibrary = {
  RECENTS_KEY: "mmry.recents",
  SAVED_KEY: "mmry.saved",
  RECENTS_LIMIT: 20,

  _read(key) {
    try {
      const raw = localStorage.getItem(key);
      const list = raw ? JSON.parse(raw) : [];
      return Array.isArray(list) ? list : [];
    } catch (_) {
      // Corrupt or unavailable storage is not worth an error — an empty
      // library is a perfectly usable state.
      return [];
    }
  },

  _write(key, list) {
    try {
      localStorage.setItem(key, JSON.stringify(list));
    } catch (err) {
      console.warn("Could not write library:", err);
    }
  },

  // entry: { id, name, count }
  _stamp(entry) {
    return {
      id: entry.id,
      name: entry.name || "Untitled journey",
      count: entry.count || 0,
      at: Date.now(),
    };
  },

  // ---- Recents ---------------------------------------------------------------

  recents() {
    return this._read(this.RECENTS_KEY);
  },

  // Opening a walk you have opened before should move it to the top rather
  // than adding a second row for it.
  recordVisit(entry) {
    if (!entry || !entry.id) return;
    const list = this.recents().filter((w) => w.id !== entry.id);
    list.unshift(this._stamp(entry));
    this._write(this.RECENTS_KEY, list.slice(0, this.RECENTS_LIMIT));
  },

  clearRecents() {
    this._write(this.RECENTS_KEY, []);
  },

  // ---- Saved -----------------------------------------------------------------

  saved() {
    return this._read(this.SAVED_KEY);
  },

  isSaved(id) {
    return this.saved().some((w) => w.id === id);
  },

  save(entry) {
    if (!entry || !entry.id) return;
    if (this.isSaved(entry.id)) return;
    const list = this.saved();
    list.unshift(this._stamp(entry));
    this._write(this.SAVED_KEY, list);
  },

  unsave(id) {
    this._write(
      this.SAVED_KEY,
      this.saved().filter((w) => w.id !== id)
    );
  },

  toggleSave(entry) {
    if (this.isSaved(entry.id)) {
      this.unsave(entry.id);
      return false;
    }
    this.save(entry);
    return true;
  },
};

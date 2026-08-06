// ---------------------------------------------------------------------------
// MMRY — publishing and loading shared journeys.
//
// Talks to Supabase over plain fetch rather than the JS SDK: the SDK would mean
// another CDN dependency, and Leaflet is vendored precisely so a demo cannot be
// taken down by someone else's outage.
//
// A published journey's id is unguessable, and the link is still the credential
// for anyone opening it. Signing in adds ownership on top of that: your walks
// become findable again, editable, and hideable. Publishing signed out works
// exactly as it always did, and produces an unowned unlisted walk.
//
// The three states are private (only its owner), unlisted (anyone with the
// link — the default) and public (listed, once discovery exists). Requiring an
// account to *open* a walk is the one thing that must never happen: the link
// arrives from a friend who has no reason to sign up.
// ---------------------------------------------------------------------------

const TAG_VOCABULARY = [
  "musical",
  "funny",
  "atmospheric",
  "morning",
  "late night",
  "historical",
  "personal",
];

const MmryShare = {
  // The user's token when signed in, the anon key when not. Both are valid;
  // which one is sent is what the row-level security policies key off.
  async headers() {
    return MmryAuth.headers();
  },

  newJourneyId() {
    const bytes = new Uint8Array(9);
    crypto.getRandomValues(bytes);
    return Array.from(bytes)
      .map((b) => b.toString(36).padStart(2, "0"))
      .join("")
      .slice(0, 12);
  },

  extensionFor(blob, fallbackName) {
    const fromName = (fallbackName || "").match(/\.([a-z0-9]{1,5})$/i);
    if (fromName) return fromName[1].toLowerCase();
    const fromType = (blob.type || "").split("/")[1];
    return (fromType || "mp3").replace("mpeg", "mp3").split(";")[0];
  },

  // journey: { name, visibility, tags, checkpoints: [{ id, name, lat, lng,
  //            radius, fadeMs, audioBlob, audioName }] }
  // onProgress: (step, total, label) — for a UI that would otherwise look frozen
  //             while several megabytes upload.
  async publish(journey, onProgress = () => {}) {
    const withAudio = journey.checkpoints.filter((cp) => cp.audioBlob);
    if (withAudio.length === 0) {
      throw new Error("Attach audio to at least one checkpoint first.");
    }

    const user = MmryAuth.user();
    // A walk nobody owns cannot be made private — there would be no account
    // that could ever open it again. The database enforces this too.
    const visibility = user ? journey.visibility || "unlisted" : "unlisted";
    const tags = (journey.tags || []).filter((tag) => TAG_VOCABULARY.includes(tag));

    const headers = await this.headers();
    const journeyId = this.newJourneyId();
    const total = withAudio.length + 1;
    let step = 0;

    const checkpoints = [];

    for (const cp of journey.checkpoints) {
      if (!cp.audioBlob) continue;

      step += 1;
      onProgress(step, total, `Uploading ${cp.name}`);

      const ext = this.extensionFor(cp.audioBlob, cp.audioName);
      const path = `${journeyId}/${cp.id}.${ext}`;

      // MediaRecorder reports types like "audio/mp4;codecs=opus". The bucket
      // matches its allowed list exactly, so the codec parameter has to go.
      const contentType = (cp.audioBlob.type || "audio/mpeg")
        .split(";")[0]
        .trim();

      const response = await fetch(
        `${SUPABASE_URL}/storage/v1/object/audio/${path}`,
        {
          method: "POST",
          headers: {
            ...headers,
            "Content-Type": contentType,
            "x-upsert": "true",
          },
          body: cp.audioBlob,
        }
      );

      if (!response.ok) {
        // Supabase returns JSON errors; a raw dump of one is no use to anyone.
        let detail = await response.text();
        try {
          detail = JSON.parse(detail).message || detail;
        } catch (_) {
          /* not JSON — show it as-is */
        }

        if (response.status === 413) {
          const mb = (cp.audioBlob.size / 1024 / 1024).toFixed(1);
          throw new Error(
            `"${cp.audioName}" is ${mb} MB — the limit is 10 MB. Export it at a lower bitrate and try again.`
          );
        }
        if (response.status === 415) {
          throw new Error(
            `"${cp.audioName}" is a file type the server won't accept (${
              cp.audioBlob.type || "unknown"
            }). Try an mp3 or m4a.`
          );
        }
        throw new Error(`Couldn't upload "${cp.name}": ${detail}`);
      }

      checkpoints.push({
        id: cp.id,
        name: cp.name,
        lat: cp.lat,
        lng: cp.lng,
        radius: cp.radius,
        fadeMs: cp.fadeMs,
        gain: cp.gain || 1,
        mono: Boolean(cp.mono),
        audioPath: path,
      });
    }

    step += 1;
    onProgress(step, total, "Creating link");

    const insert = await fetch(`${SUPABASE_URL}/rest/v1/journeys`, {
      method: "POST",
      headers: {
        ...headers,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({
        id: journeyId,
        name: journey.name || "Untitled journey",
        checkpoints,
        user_id: user ? user.id : null,
        visibility,
        tags,
      }),
    });

    if (!insert.ok) {
      throw new Error(`Could not publish: ${await insert.text()}`);
    }

    return { id: journeyId, url: this.linkFor(journeyId), visibility };
  },

  linkFor(id) {
    const base = location.href.replace(/\/[^/]*$/, "/");
    return `${base}walk.html?j=${id}`;
  },

  audioUrlFor(path) {
    return `${SUPABASE_URL}/storage/v1/object/public/audio/${path}`;
  },

  async load(id) {
    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/journeys?id=eq.${encodeURIComponent(id)}&select=*`,
      { headers: await this.headers() }
    );

    if (!response.ok) throw new Error(`Could not load journey: ${await response.text()}`);

    const rows = await response.json();
    if (rows.length === 0) {
      // A private walk and a deleted one are indistinguishable from out here —
      // the read policy filters it out rather than refusing, which is what
      // stops the existence of somebody's private walk leaking. So the message
      // has to cover both without pretending to know which.
      const err = new Error(
        MmryAuth.signedIn()
          ? "This walk is private, or the link is wrong. If it's yours, check it in My walks."
          : "This walk is private or no longer exists. If it's yours, sign in and check My walks."
      );
      err.code = "not-visible";
      throw err;
    }

    return this._shape(rows[0]);
  },

  _shape(row) {
    return {
      id: row.id,
      name: row.name,
      visibility: row.visibility || "unlisted",
      tags: row.tags || [],
      createdAt: row.created_at,
      checkpoints: (row.checkpoints || []).map((cp) => ({
        ...cp,
        audioUrl: this.audioUrlFor(cp.audioPath),
      })),
    };
  },

  // ---- Owning your walks ---------------------------------------------------
  //
  // Every call below relies on the row-level security policies rather than on
  // any check here: the request simply carries the user's token, and the
  // database decides. A client-side guard would be theatre — anyone can call
  // the REST endpoint directly.

  async mine() {
    const user = MmryAuth.user();
    if (!user) return [];

    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/journeys?user_id=eq.${user.id}&select=*&order=created_at.desc`,
      { headers: await this.headers() }
    );

    if (!response.ok) throw new Error(`Could not load your walks: ${await response.text()}`);
    return (await response.json()).map((row) => this._shape(row));
  },

  async update(id, changes) {
    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/journeys?id=eq.${encodeURIComponent(id)}`,
      {
        method: "PATCH",
        headers: {
          ...(await this.headers()),
          "Content-Type": "application/json",
          Prefer: "return=representation",
        },
        body: JSON.stringify(changes),
      }
    );

    if (!response.ok) throw new Error(await response.text());

    const rows = await response.json();
    // PATCH against a row the policy hides succeeds with an empty result
    // rather than failing, so silence is the failure signal here.
    if (rows.length === 0) throw new Error("That walk isn't yours to change.");
    return this._shape(rows[0]);
  },

  // Audio first, then the row. The storage policy works out ownership by
  // looking the journey up from the object's path, so once the row is gone
  // nothing can authorise deleting its files and they are stranded.
  async destroy(id) {
    const headers = await this.headers();
    const journey = await this.load(id);
    const paths = journey.checkpoints.map((cp) => cp.audioPath).filter(Boolean);

    if (paths.length > 0) {
      const removed = await fetch(`${SUPABASE_URL}/storage/v1/object/audio`, {
        method: "DELETE",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ prefixes: paths }),
      });
      if (!removed.ok) {
        console.warn("Could not remove audio files:", await removed.text());
      }
    }

    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/journeys?id=eq.${encodeURIComponent(id)}`,
      { method: "DELETE", headers: { ...headers, Prefer: "return=representation" } }
    );

    if (!response.ok) throw new Error(await response.text());
    if ((await response.json()).length === 0) {
      throw new Error("That walk isn't yours to delete.");
    }
  },
};

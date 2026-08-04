// ---------------------------------------------------------------------------
// MMRY — publishing and loading shared journeys.
//
// Talks to Supabase over plain fetch rather than the JS SDK: the SDK would mean
// another CDN dependency, and Leaflet is vendored precisely so a demo cannot be
// taken down by someone else's outage.
//
// A published journey's id is unguessable, and the link is the credential —
// there are no accounts yet. Republishing mints a new link rather than editing
// the old one, because nothing may update a row once written.
// ---------------------------------------------------------------------------

const MmryShare = {
  headers() {
    return {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    };
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

  // journey: { name, checkpoints: [{ id, name, lat, lng, radius, fadeMs,
  //            audioBlob, audioName }] }
  // onProgress: (step, total, label) — for a UI that would otherwise look frozen
  //             while several megabytes upload.
  async publish(journey, onProgress = () => {}) {
    const withAudio = journey.checkpoints.filter((cp) => cp.audioBlob);
    if (withAudio.length === 0) {
      throw new Error("Attach audio to at least one checkpoint first.");
    }

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
            ...this.headers(),
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
        audioPath: path,
      });
    }

    step += 1;
    onProgress(step, total, "Creating link");

    const insert = await fetch(`${SUPABASE_URL}/rest/v1/journeys`, {
      method: "POST",
      headers: {
        ...this.headers(),
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({
        id: journeyId,
        name: journey.name || "Untitled journey",
        checkpoints,
      }),
    });

    if (!insert.ok) {
      throw new Error(`Could not publish: ${await insert.text()}`);
    }

    return { id: journeyId, url: this.linkFor(journeyId) };
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
      { headers: this.headers() }
    );

    if (!response.ok) throw new Error(`Could not load journey: ${await response.text()}`);

    const rows = await response.json();
    if (rows.length === 0) throw new Error("That journey link doesn't exist.");

    const row = rows[0];
    return {
      id: row.id,
      name: row.name,
      checkpoints: (row.checkpoints || []).map((cp) => ({
        ...cp,
        audioUrl: this.audioUrlFor(cp.audioPath),
      })),
    };
  },
};

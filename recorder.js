// ---------------------------------------------------------------------------
// MMRY — recording audio in place.
//
// Standing at the spot and capturing the sound there is the natural way to make
// a soundwalk. Sending people via the Files app — or worse, letting them film a
// video for its audio track — is a detour around a browser API that exists.
//
// MediaRecorder is available in Safari from iOS 14.3 and in Chrome everywhere.
// ---------------------------------------------------------------------------

const MmryRecorder = {
  stream: null,
  recorder: null,
  chunks: [],
  startedAt: 0,

  supported() {
    return Boolean(
      navigator.mediaDevices &&
        navigator.mediaDevices.getUserMedia &&
        window.MediaRecorder
    );
  },

  // Ordered by how widely the result can be *played*, not by what is convenient
  // to record. AAC in MP4 plays everywhere, so it comes first; asking for plain
  // "audio/mp4" on Chrome yields Opus inside an MP4, which Safari may refuse —
  // and a clip recorded on a laptop is meant to be walked on a phone.
  preferredType() {
    const candidates = [
      "audio/mp4;codecs=mp4a.40.2", // AAC — universally playable
      "audio/mp4",                  // Safari gives AAC here; Chrome may give Opus
      "audio/webm;codecs=opus",
      "audio/webm",
      "audio/ogg;codecs=opus",
    ];
    for (const type of candidates) {
      if (MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(type)) {
        return type;
      }
    }
    return "";
  },

  extensionFor(mimeType) {
    if (mimeType.includes("mp4")) return "m4a";
    if (mimeType.includes("webm")) return "webm";
    if (mimeType.includes("ogg")) return "ogg";
    return "audio";
  },

  isRecording() {
    return Boolean(this.recorder && this.recorder.state === "recording");
  },

  elapsedMs() {
    return this.startedAt ? Date.now() - this.startedAt : 0;
  },

  async start() {
    if (this.isRecording()) throw new Error("Already recording");

    // A previous take may have only just let go of the microphone. Re-acquiring
    // in the same tick can return a device still in its old state, so make sure
    // it is fully released first.
    this.release();
    await new Promise((resolve) => setTimeout(resolve, 120));

    // Leaving ANY of echo cancellation, noise suppression or auto gain on sends
    // the capture through the browser's voice-call pipeline, which downsamples
    // to roughly 16 kHz mono — fine for a phone call, ruinous for music or
    // ambience. All three off, and the full rate asked for explicitly.
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
        channelCount: 2,
        sampleRate: 48000,
        sampleSize: 16,
      },
    });

    const track = this.stream.getAudioTracks()[0];
    const settings = track?.getSettings?.() || {};
    this.lastSettings = settings;
    console.log("MMRY capture:", {
      device: settings.deviceId ? String(settings.deviceId).slice(0, 8) : "?",
      sampleRate: settings.sampleRate,
      channels: settings.channelCount,
      echoCancellation: settings.echoCancellation,
      noiseSuppression: settings.noiseSuppression,
      autoGainControl: settings.autoGainControl,
    });

    const mimeType = this.preferredType();
    // Without this MediaRecorder picks its own bitrate, which is conservative.
    // 128 kbps keeps a few minutes comfortably inside the 10 MB upload cap.
    const options = { audioBitsPerSecond: 128000 };
    if (mimeType) options.mimeType = mimeType;

    this.recorder = new MediaRecorder(this.stream, options);

    this.chunks = [];
    this.recorder.addEventListener("dataavailable", (event) => {
      if (event.data && event.data.size > 0) this.chunks.push(event.data);
    });

    this.recorder.start();
    this.startedAt = Date.now();
  },

  // Resolves with the finished clip.
  stop() {
    return new Promise((resolve, reject) => {
      if (!this.recorder) {
        reject(new Error("Not recording"));
        return;
      }

      const type = this.recorder.mimeType || "audio/mp4";

      this.recorder.addEventListener(
        "stop",
        () => {
          const blob = new Blob(this.chunks, { type });
          this.release();
          resolve({ blob, extension: this.extensionFor(type) });
        },
        { once: true }
      );

      this.recorder.stop();
    });
  },

  cancel() {
    if (this.recorder && this.recorder.state !== "inactive") {
      try {
        this.recorder.stop();
      } catch (_) {
        /* already stopping */
      }
    }
    this.release();
  },

  release() {
    if (this.stream) {
      // Without this the browser keeps showing a live microphone indicator.
      this.stream.getTracks().forEach((track) => track.stop());
      this.stream = null;
    }
    this.recorder = null;
    this.chunks = [];
    this.startedAt = 0;
  },
};

function mmryFormatDuration(ms) {
  const total = Math.floor(ms / 1000);
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

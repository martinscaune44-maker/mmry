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

  // Browsers disagree about container support: Safari records mp4, Chrome and
  // Firefox prefer webm/opus. Pick whichever the browser admits to.
  preferredType() {
    const candidates = [
      "audio/mp4",
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

    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: true,
      },
    });

    const mimeType = this.preferredType();
    this.recorder = mimeType
      ? new MediaRecorder(this.stream, { mimeType })
      : new MediaRecorder(this.stream);

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

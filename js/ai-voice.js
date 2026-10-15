// AI voice engine: Kokoro, an open-source neural text-to-speech model
// (Apache 2.0, https://github.com/hexgrad/kokoro). It runs entirely in the
// visitor's browser, so there's no server and no API key. The model downloads
// once and the browser caches it for next time: about 330 MB to run on the
// graphics card, or about 90 MB for the slower CPU fallback (see ai-worker.js).
//
// The model itself runs in ai-worker.js, a background thread, so the page
// never freezes while speech is being made.
//
// Kokoro gives us audio but no word timings, so it highlights one sentence at a time.
//
// Making speech takes a while, so we work ahead: while one sentence plays, the
// next few are already being made. That way a long sentence after a short one
// is usually ready before it's needed.

const DEFAULT_VOICE = 'af_heart';
// How much text to have made (or being made) ahead of the sentence being read.
// About 15 characters is one second of speech, so this is roughly 30 seconds.
const READ_AHEAD_CHARS = 450;
// A fraction of a second of silence (used by unlockAudio below).
const SILENT_WAV = 'data:audio/wav;base64,UklGRnQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YVAAAACAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgA==';

export function createAiEngine(hooks) {
  let worker = null;
  let loading = null;

  const audio = new Audio();
  audio.preservesPitch = true; // faster speech shouldn't sound like chipmunks

  let list = [];
  let index = 0;
  let speed = 1;
  let voice = DEFAULT_VOICE;
  let playing = false;
  let loadedIndex = -1;   // which sentence's audio is in the <audio> element
  let runId = 0;          // bumped on pause/stop so old async work is ignored
  let cache = new Map();  // sentence index → Promise of an audio URL
  let generating = Promise.resolve(); // makes sure only one sentence is generated at a time

  // ---------- Talking to the worker ----------

  let nextMessageId = 0;
  const waitingFor = new Map(); // message id → { resolve, reject }
  const downloads = new Map();  // file name → download progress

  function startWorker() {
    worker = new Worker(new URL('./ai-worker.js', import.meta.url), { type: 'module' });

    worker.addEventListener('message', (event) => {
      const { id, type, info, result, error } = event.data;
      if (type === 'progress') {
        showDownloadProgress(info);
      } else if (waitingFor.has(id)) {
        const { resolve, reject } = waitingFor.get(id);
        waitingFor.delete(id);
        if (error) reject(new Error(error));
        else resolve(result);
      }
    });

    // The worker itself failed (for example, the library couldn't download).
    worker.addEventListener('error', (event) => {
      event.preventDefault();
      for (const { reject } of waitingFor.values()) reject(new Error('The AI voice worker failed.'));
      waitingFor.clear();
      worker.terminate();
      worker = null;
    });
  }

  // Send a message to the worker and get a Promise of its reply.
  function ask(message) {
    if (!worker) startWorker();
    const id = ++nextMessageId;
    return new Promise((resolve, reject) => {
      waitingFor.set(id, { resolve, reject });
      worker.postMessage({ id, ...message });
    });
  }

  function showDownloadProgress(info) {
    if (info.status === 'restart') {
      downloads.clear();
      hooks.onLoadProgress(0);
      return;
    }
    if (info.status !== 'progress' || !info.total) return;
    downloads.set(info.file, info);
    let loaded = 0;
    let total = 0;
    for (const f of downloads.values()) {
      loaded += f.loaded;
      total += f.total;
    }
    hooks.onLoadProgress(loaded / total);
  }

  async function load() {
    if (!loading) {
      // Resolves to where the model runs: 'webgpu' (graphics card) or 'wasm' (CPU).
      loading = ask({ type: 'load' });
      loading.catch(() => {
        loading = null; // allow another try
      });
    }
    return loading;
  }

  // Returns a Promise of an audio URL for sentence i, generating it if needed.
  // Once the audio is made, the Promise gets done = true.
  function getAudio(i) {
    if (!cache.has(i)) {
      const text = list[i].text;
      const chosenVoice = voice;
      const myCache = cache;
      const job = generating.then(async () => {
        // Skip work that's no longer needed (the user skipped ahead,
        // changed voice, or started new text while this was waiting).
        if (cache !== myCache || i < index) throw new Error('skipped');
        const wav = await ask({ type: 'generate', text, voice: chosenVoice });
        job.done = true;
        return URL.createObjectURL(wav);
      });
      generating = job.catch(() => {});
      job.catch(() => {
        if (cache.get(i) === job) cache.delete(i); // so it can be tried again later
      });
      cache.set(i, job);
    }
    return cache.get(i);
  }

  // Queue up the sentences after the current one until about READ_AHEAD_CHARS
  // of text is waiting. They're made one at a time, in order.
  function readAhead() {
    let queued = 0;
    for (let k = index + 1; k < list.length && queued < READ_AHEAD_CHARS; k++) {
      getAudio(k);
      queued += list[k].text.length;
    }
  }

  // Free the audio for sentences we're done with. The one just before the
  // current sentence is kept, so the Previous button doesn't have to wait.
  function freeOldAudio() {
    for (const [k, job] of cache) {
      if (k < index - 1) {
        job.then((url) => URL.revokeObjectURL(url)).catch(() => {});
        cache.delete(k);
      }
    }
  }

  function clearCache() {
    for (const job of cache.values()) {
      job.then((url) => URL.revokeObjectURL(url)).catch(() => {});
    }
    cache = new Map();
  }

  async function playCurrent() {
    const myRun = runId;
    if (index >= list.length) {
      playing = false;
      hooks.onDone();
      return;
    }

    const i = index;
    hooks.onSentence(i);

    const job = getAudio(i);
    if (!job.done) hooks.onWaiting(); // this sentence's audio isn't ready yet
    readAhead();
    freeOldAudio();

    let url;
    try {
      url = await job;
    } catch (error) {
      if (myRun === runId) {
        console.error(error);
        playing = false;
        hooks.onError('The AI voice had a problem generating this sentence.');
      }
      return;
    }
    if (myRun !== runId) return; // paused or stopped while we were waiting

    audio.src = url;
    loadedIndex = i;
    // Loading new audio resets the speed, so set it every time.
    audio.defaultPlaybackRate = speed;
    audio.playbackRate = speed;
    try {
      await audio.play();
      if (myRun === runId) hooks.onPlaying();
    } catch (error) {
      if (error.name === 'NotAllowedError' && myRun === runId) {
        playing = false;
        hooks.onError('The browser blocked the audio. Press Play to try again.');
      }
      // Otherwise it was interrupted by a pause or stop, which is fine.
    }
  }

  // Browsers (especially Safari) only let audio start from a click. The real
  // audio isn't ready until after the click, so we play a tiny silent clip
  // during the click to "unlock" the audio player for later.
  function unlockAudio() {
    audio.src = SILENT_WAV;
    audio.play().catch(() => {});
  }

  audio.addEventListener('ended', () => {
    if (!playing || loadedIndex !== index) return;
    index++;
    playCurrent();
  });

  function haltAudio() {
    runId++;
    audio.pause();
  }

  return {
    load,
    async play(newSentences, startIndex = 0) {
      haltAudio();
      clearCache();
      list = newSentences;
      index = startIndex;
      loadedIndex = -1;
      playing = true;
      unlockAudio();
      const myRun = runId;
      await load();
      if (myRun === runId) playCurrent(); // not stopped while loading
    },
    pause() {
      playing = false;
      haltAudio();
    },
    resume() {
      playing = true;
      if (loadedIndex === index && !audio.ended) {
        audio.play();
      } else {
        playCurrent();
      }
    },
    // Jump to the previous (-1) or next (+1) sentence.
    skip(delta) {
      index = Math.min(Math.max(index + delta, 0), list.length - 1);
      hooks.onSentence(index);
      haltAudio();
      loadedIndex = -1;
      if (playing) playCurrent();
    },
    stop() {
      playing = false;
      haltAudio();
      clearCache();
      index = 0;
      loadedIndex = -1;
    },
    setSpeed(rate) {
      // Changing playbackRate takes effect immediately, no need to regenerate.
      speed = rate;
      audio.defaultPlaybackRate = rate;
      audio.playbackRate = rate;
    },
    setVoice(id) {
      if (id === voice) return;
      voice = id;
      // Audio made with the old voice is no longer useful.
      const wasPlaying = playing;
      haltAudio();
      clearCache();
      loadedIndex = -1;
      if (wasPlaying) playCurrent();
    },
  };
}

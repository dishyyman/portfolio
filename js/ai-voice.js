// AI voice engine: Kokoro, an open-source neural text-to-speech model
// (Apache 2.0, https://github.com/hexgrad/kokoro). It runs entirely in the
// visitor's browser, so there's no server and no API key. The model downloads
// once (about 90 MB) and the browser caches it for next time.
//
// The model itself runs in ai-worker.js, a background thread, so the page
// never freezes while speech is being made.
//
// Kokoro gives us audio but not word timings, so:
// - the sentence highlight is exact (we play one sentence at a time), and
// - the word highlight is estimated from how far through the sentence's audio we are.

const DEFAULT_VOICE = 'af_heart';
// A fraction of a second of silence (used by unlockAudio below).
const SILENT_WAV = 'data:audio/wav;base64,UklGRnQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YVAAAACAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgA==';

export function createAiEngine(hooks) {
  let worker = null;
  let voices = null;      // the voice list, once the model has loaded
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
      loading = ask({ type: 'load' }).then((result) => {
        voices = result;
      });
      loading.catch(() => {
        loading = null; // allow another try
      });
    }
    return loading;
  }

  // Returns a Promise of an audio URL for sentence i, generating it if needed.
  function getAudio(i) {
    if (!cache.has(i)) {
      const text = list[i].text;
      const chosenVoice = voice;
      const myCache = cache;
      const job = generating.then(async () => {
        // Skip work that's no longer needed (the user skipped ahead,
        // changed voice, or started new text while this was waiting).
        if (cache !== myCache || i < index || i > index + 1) throw new Error('skipped');
        const wav = await ask({ type: 'generate', text, voice: chosenVoice });
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
    if (!cache.has(i)) hooks.onWaiting(); // this sentence's audio isn't ready yet

    let url;
    try {
      url = await getAudio(i);
    } catch (error) {
      if (myRun === runId) {
        console.error(error);
        playing = false;
        hooks.onError('The AI voice had a problem generating this sentence.');
      }
      return;
    }
    if (myRun !== runId) return; // paused or stopped while we were waiting

    // Start making the next sentence now so there's no gap.
    if (i + 1 < list.length) getAudio(i + 1);
    // Free the audio for sentences we've finished with.
    if (cache.has(i - 1)) {
      cache.get(i - 1).then((oldUrl) => URL.revokeObjectURL(oldUrl));
      cache.delete(i - 1);
    }

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

  // Estimate the current word: if we're 40% through the audio, we're probably
  // about 40% through the sentence's letters. Runs every animation frame.
  function trackWord() {
    if (audio.paused || audio.ended || loadedIndex < 0) return;
    const words = list[loadedIndex].words;
    if (audio.duration > 0 && words.length > 0) {
      const fraction = audio.currentTime / audio.duration;
      const weights = words.map((w) => w.end - w.start + 1); // longer words take longer to say
      const total = weights.reduce((sum, w) => sum + w, 0);
      let target = fraction * total;
      let k = 0;
      while (k < words.length - 1 && target > weights[k]) {
        target -= weights[k];
        k++;
      }
      hooks.onWord(loadedIndex, words[k].start);
    }
    frame = requestAnimationFrame(trackWord);
  }
  let frame = 0;
  audio.addEventListener('play', () => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(trackWord);
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
    listVoices() {
      if (!voices) return [];
      const names = new Intl.DisplayNames(['en'], { type: 'language' });
      return Object.entries(voices).map(([id, info]) => ({
        id,
        label: `${info.name} (${info.gender.toLowerCase()}, grade ${info.overallGrade})`,
        group: names.of(info.language), // "en-us" → "American English"
        isDefault: id === DEFAULT_VOICE,
      }));
    },
  };
}

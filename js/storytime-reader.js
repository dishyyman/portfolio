// Storytime Reader: main page logic.
//
// 1. Turn the pasted text into sentences and words, each wrapped in a <span>.
// 2. Hand the sentences to a voice "engine" that reads them aloud.
// 3. The engine calls back to tell us which sentence/word it's on, and we highlight it.
//
// There are two engines, and both have the same methods:
//   play(sentences, startIndex), pause(), resume(), skip(delta), stop(),
//   setSpeed(rate), setVoice(id), listVoices()
// - Browser engine (in this file): the Web Speech API built into every browser.
// - AI engine (ai-voice.js): Kokoro, an open-source neural voice that runs in the browser.

const els = {
  text: document.getElementById('text-input'),
  reading: document.getElementById('reading-view'),
  engineRadios: document.querySelectorAll('input[name="engine"]'),
  voice: document.getElementById('voice-select'),
  speed: document.getElementById('speed'),
  speedLabel: document.getElementById('speed-label'),
  play: document.getElementById('play-btn'),
  playIcon: document.getElementById('play-icon'),
  prev: document.getElementById('prev-btn'),
  next: document.getElementById('next-btn'),
  stop: document.getElementById('stop-btn'),
  edit: document.getElementById('edit-btn'),
  progress: document.getElementById('load-progress'),
  loadingBar: document.getElementById('loading-bar'),
  status: document.getElementById('status'),
  note: document.getElementById('note'),
};

// Very long sentences are split into smaller pieces. The AI voice cuts off
// text that is too long, and some browser voices stop partway through.
const MAX_CHUNK_LENGTH = 300;

const sentenceSegmenter = new Intl.Segmenter(undefined, { granularity: 'sentence' });
const wordSegmenter = new Intl.Segmenter(undefined, { granularity: 'word' });

let sentences = [];       // [{ text, el, words: [{ start, end, el }] }]
let state = 'idle';       // 'idle' | 'playing' | 'paused'
let engineName = 'browser';
let engine = null;
let browserEngine = null;
let aiEngine = null;
let engineLoading = false;
const chosenVoice = { browser: null, ai: null }; // remembered per engine

// Everything an engine needs to tell the page.
const hooks = {
  onSentence: (i) => highlightSentence(i),
  onWord: (i, charIndex) => highlightWord(i, charIndex),
  // The voice needs a moment before it can speak (the AI voice is preparing audio).
  onWaiting() {
    showLoading(true);
    setStatus('The AI voice is turning this sentence into speech…');
  },
  // Sound has started: hide the loading bar and fade into reader mode.
  onPlaying() {
    showLoading(false);
    els.reading.classList.add('reader-mode');
    setStatus('Reading…');
  },
  onDone() {
    clearHighlights();
    showLoading(false);
    setState('idle');
    setStatus('Finished.');
  },
  onError(message) {
    clearHighlights();
    showLoading(false);
    setState('idle');
    setStatus(message);
  },
  onNoWordTiming() {
    showNote("This voice doesn't report word timing, so only the sentence is highlighted. Try another voice for word highlighting.");
  },
  onVoicesChanged() {
    if (engineName === 'browser') fillVoiceSelect();
  },
  onLoadProgress(fraction) {
    els.progress.value = fraction;
  },
};

// ---------- Text → sentences and words ----------

function buildReadingView(text) {
  els.reading.replaceChildren();
  const result = [];

  for (const { segment } of sentenceSegmenter.segment(text)) {
    for (const piece of splitLongSentence(segment)) {
      const sentence = buildSentence(piece);
      els.reading.append(sentence.el);
      // Pieces with no words (just spaces or "...") are shown but not spoken.
      if (sentence.words.length > 0) result.push(sentence);
    }
  }
  return result;
}

function buildSentence(text) {
  const el = document.createElement('span');
  el.className = 'sentence';
  const words = [];

  for (const { segment, index, isWordLike } of wordSegmenter.segment(text)) {
    if (isWordLike) {
      const wordEl = document.createElement('span');
      wordEl.className = 'word';
      wordEl.textContent = segment; // textContent (not innerHTML) so pasted text can't add HTML
      el.append(wordEl);
      words.push({ start: index, end: index + segment.length, el: wordEl });
    } else {
      el.append(segment); // spaces and punctuation stay as plain text
    }
  }
  return { text, el, words };
}

function splitLongSentence(text) {
  const pieces = [];
  while (text.length > MAX_CHUNK_LENGTH) {
    const slice = text.slice(0, MAX_CHUNK_LENGTH);
    // Prefer to break after a comma, semicolon or colon; otherwise after a space.
    let cut = Math.max(slice.lastIndexOf(', '), slice.lastIndexOf('; '), slice.lastIndexOf(': '));
    if (cut < MAX_CHUNK_LENGTH / 2) cut = slice.lastIndexOf(' ');
    if (cut <= 0) cut = MAX_CHUNK_LENGTH - 1;
    pieces.push(text.slice(0, cut + 1));
    text = text.slice(cut + 1);
  }
  pieces.push(text);
  return pieces;
}

// ---------- Highlighting ----------

let currentSentenceEl = null;
let currentWordEl = null;

function highlightSentence(i) {
  currentSentenceEl?.classList.remove('current-sentence');
  currentWordEl?.classList.remove('current-word');
  currentWordEl = null;

  currentSentenceEl = sentences[i].el;
  currentSentenceEl.classList.add('current-sentence');
  currentSentenceEl.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

// charIndex is a position inside the sentence's text. Highlight the word
// that contains it (or the next word, if it points at a space).
function highlightWord(i, charIndex) {
  const word = sentences[i].words.find((w) => charIndex < w.end);
  if (!word || word.el === currentWordEl) return;

  currentWordEl?.classList.remove('current-word');
  currentWordEl = word.el;
  currentWordEl.classList.add('current-word');
  currentWordEl.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

function clearHighlights() {
  currentSentenceEl?.classList.remove('current-sentence');
  currentWordEl?.classList.remove('current-word');
  currentSentenceEl = null;
  currentWordEl = null;
}

// ---------- Browser engine (Web Speech API) ----------

function createBrowserEngine(hooks) {
  const synth = window.speechSynthesis;
  let list = [];
  let index = 0;
  let speed = 1;
  let voice = null;
  let playing = false;
  let utterance = null; // the one we're speaking now (null after a cancel)
  let timer = null;

  // Voices load in the background in some browsers (like Chrome).
  synth.addEventListener('voiceschanged', () => hooks.onVoicesChanged());
  // Chrome keeps talking after a page reload unless we stop it.
  window.addEventListener('pagehide', () => synth.cancel());
  synth.cancel();

  // Read one sentence; when it ends, move on to the next.
  // One utterance per sentence avoids Chrome cutting off long text,
  // and makes pausing and speed changes reliable.
  function speakCurrent() {
    if (!playing) return;
    if (index >= list.length) {
      playing = false;
      hooks.onDone();
      return;
    }

    const i = index;
    const u = new SpeechSynthesisUtterance(list[i].text);
    let sawWordBoundary = false;
    u.rate = speed;
    if (voice) {
      u.voice = voice;
      u.lang = voice.lang;
    }

    u.onstart = () => {
      hooks.onSentence(i);
      hooks.onPlaying();
    };
    u.onboundary = (event) => {
      if (event.name !== 'word') return;
      sawWordBoundary = true;
      hooks.onWord(i, event.charIndex);
    };
    u.onend = () => {
      if (u !== utterance) return; // this one was cancelled; ignore it
      if (!sawWordBoundary) hooks.onNoWordTiming();
      index++;
      speakCurrent();
    };
    u.onerror = (event) => {
      if (u !== utterance) return;
      if (event.error === 'interrupted' || event.error === 'canceled') return;
      playing = false;
      if (event.error === 'not-allowed') {
        hooks.onError('The browser blocked the voice. Press Play to start it.');
      } else {
        hooks.onError(`The voice stopped with an error: ${event.error}`);
      }
    };

    utterance = u;
    synth.speak(u);
  }

  function cancelCurrent() {
    clearTimeout(timer);
    utterance = null;
    synth.cancel();
  }

  // Chrome sometimes ignores speak() right after cancel(), so wait a moment.
  function speakSoon() {
    clearTimeout(timer);
    timer = setTimeout(speakCurrent, 50);
  }

  // Start the current sentence again (used after speed or voice changes).
  function restartSentence() {
    if (!playing) return;
    cancelCurrent();
    speakSoon();
  }

  return {
    play(newSentences, startIndex = 0) {
      cancelCurrent();
      list = newSentences;
      index = startIndex;
      playing = true;
      // Speak right away (not after a delay): Safari only allows speech
      // that starts directly from a click.
      speakCurrent();
    },
    // The built-in pause()/resume() are unreliable in Chrome and on Android,
    // so pausing cancels speech and resuming re-reads the current sentence.
    pause() {
      playing = false;
      cancelCurrent();
    },
    resume() {
      playing = true;
      speakCurrent();
    },
    // Jump to the previous (-1) or next (+1) sentence.
    skip(delta) {
      index = Math.min(Math.max(index + delta, 0), list.length - 1);
      hooks.onSentence(index);
      restartSentence(); // only does something while playing
    },
    stop() {
      playing = false;
      index = 0;
      cancelCurrent();
    },
    setSpeed(rate) {
      speed = rate;
      restartSentence();
    },
    setVoice(id) {
      voice = synth.getVoices().find((v) => v.voiceURI === id) ?? null;
      restartSentence();
    },
    listVoices() {
      const voices = synth.getVoices();
      const userLang = (navigator.language || 'en').toLowerCase().split('-')[0];
      const isMine = (v) => normalizeLang(v.lang).toLowerCase().startsWith(userLang);
      const preferred =
        voices.find((v) => v.default && isMine(v)) ??
        voices.find((v) => v.localService && isMine(v)) ??
        voices.find(isMine) ??
        voices.find((v) => v.default) ??
        voices[0];

      return voices
        .map((v) => ({
          id: v.voiceURI,
          label: v.localService ? v.name : `${v.name} (online)`,
          group: languageName(v.lang),
          isDefault: v === preferred,
          mine: isMine(v),
        }))
        // Your own language first, then grouped by language, then by name.
        .sort((a, b) => (b.mine - a.mine) || a.group.localeCompare(b.group) || a.label.localeCompare(b.label));
    },
  };
}

// Android uses "en_US" instead of "en-US".
function normalizeLang(lang) {
  return lang.replace('_', '-');
}

// "en-US" → "American English"
function languageName(lang) {
  try {
    return new Intl.DisplayNames([navigator.language], { type: 'language' }).of(normalizeLang(lang));
  } catch {
    return lang;
  }
}

// ---------- Page state and controls ----------

function setState(newState) {
  state = newState;
  // One button for Play, Pause and Resume: swap its icon and label.
  const label = state === 'playing' ? 'Pause' : state === 'paused' ? 'Resume' : 'Play';
  els.playIcon.setAttribute('href', state === 'playing' ? '#icon-pause' : '#icon-play');
  els.play.setAttribute('aria-label', label);
  els.play.title = label;
  els.play.disabled = state === 'idle' && engineLoading;

  els.prev.disabled = state === 'idle';
  els.next.disabled = state === 'idle';
  els.stop.disabled = state === 'idle';
}

// The loading bar slides along the top of the text, and the sentence
// being prepared pulses, so you can see the voice is working on it.
function showLoading(show) {
  els.loadingBar.classList.toggle('active', show);
  els.reading.classList.toggle('preparing', show);
}

function setStatus(message) {
  els.status.textContent = message;
}

function showNote(message) {
  els.note.textContent = message;
  els.note.hidden = !message;
}

function showReadingView(show) {
  els.text.hidden = show;
  els.reading.hidden = !show;
  els.edit.hidden = !show;
  if (!show) {
    els.reading.classList.remove('reader-mode');
    // Fade the text box's border back in.
    els.text.classList.add('fade-in');
    els.text.addEventListener('animationend', () => els.text.classList.remove('fade-in'), { once: true });
  }
}

function fillVoiceSelect() {
  const voices = engine.listVoices();
  els.voice.replaceChildren();

  // One <optgroup> per language.
  const groups = new Map();
  for (const v of voices) {
    if (!groups.has(v.group)) {
      const optgroup = document.createElement('optgroup');
      optgroup.label = v.group;
      groups.set(v.group, optgroup);
      els.voice.append(optgroup);
    }
    groups.get(v.group).append(new Option(v.label, v.id));
  }

  const pick = voices.find((v) => v.id === chosenVoice[engineName]) ?? voices.find((v) => v.isDefault) ?? voices[0];
  if (pick) {
    els.voice.value = pick.id;
    engine.setVoice(pick.id);
  }
  els.voice.disabled = voices.length === 0;
}

function startReading() {
  const text = els.text.value;
  if (!text.trim()) {
    setStatus('Paste some text first.');
    els.text.focus();
    return;
  }

  sentences = buildReadingView(text);
  if (sentences.length === 0) {
    setStatus("There aren't any words to read.");
    return;
  }

  showReadingView(true);
  if (engineName === 'browser') showNote('');
  setState('playing');
  setStatus('Starting…');
  showLoading(true);
  engine.play(sentences, 0);
}

async function switchEngine(name) {
  engine?.stop();
  clearHighlights();
  showLoading(false);
  setState('idle');
  setStatus('');
  engineName = name;

  if (name === 'browser') {
    engine = browserEngine;
    showNote('');
  } else {
    engineLoading = true;
    setState('idle');
    els.voice.replaceChildren();
    els.voice.disabled = true;
    els.progress.hidden = false;
    setStatus('Loading the AI voice. The first time this downloads about 90 MB, so it can take a minute…');

    try {
      if (!aiEngine) {
        const { createAiEngine } = await import('./ai-voice.js');
        aiEngine = createAiEngine(hooks);
      }
      await aiEngine.load();
    } catch (error) {
      console.error(error);
      engineLoading = false;
      els.progress.hidden = true;
      if (engineName === 'ai') {
        // Go back to browser voices so the page still works.
        document.querySelector('input[name="engine"][value="browser"]').checked = true;
        await switchEngine('browser');
        setStatus("The AI voice couldn't load. Check your connection and try again.");
      }
      return;
    }

    engineLoading = false;
    els.progress.hidden = true;
    if (engineName !== 'ai') return; // switched back while it was loading
    engine = aiEngine;
    setStatus('AI voice ready.');
    showNote('AI voice: English only. Word highlighting is approximate; the sentence highlight is exact.');
  }

  engine.setSpeed(Number(els.speed.value));
  fillVoiceSelect();
  setState('idle');
}

// ---------- Wire up the controls ----------

if (!('speechSynthesis' in window)) {
  setStatus("This browser has no built-in voices. Try the AI voice, or use Chrome, Edge, Safari or Firefox.");
  els.play.disabled = true;
  els.voice.disabled = true;
  document.querySelector('input[name="engine"][value="browser"]').disabled = true;
} else {
  browserEngine = createBrowserEngine(hooks);
  engine = browserEngine;
  fillVoiceSelect();
}

els.play.addEventListener('click', () => {
  if (state === 'idle') {
    startReading();
  } else if (state === 'playing') {
    engine.pause();
    showLoading(false);
    setState('paused');
    setStatus('Paused.');
  } else {
    engine.resume();
    setState('playing');
    setStatus('Reading…');
  }
});

els.prev.addEventListener('click', () => engine.skip(-1));
els.next.addEventListener('click', () => engine.skip(1));

els.stop.addEventListener('click', () => {
  engine.stop();
  clearHighlights();
  showLoading(false);
  setState('idle');
  setStatus('Stopped.');
});

els.edit.addEventListener('click', () => {
  engine.stop();
  clearHighlights();
  showLoading(false);
  setState('idle');
  setStatus('');
  showReadingView(false);
  els.text.focus();
});

els.speed.addEventListener('input', () => {
  const rate = Number(els.speed.value);
  els.speedLabel.textContent = `${rate}×`;
  engine.setSpeed(rate);
});

els.voice.addEventListener('change', () => {
  chosenVoice[engineName] = els.voice.value;
  engine.setVoice(els.voice.value);
  if (engineName === 'browser') showNote('');
});

for (const radio of els.engineRadios) {
  radio.addEventListener('change', () => {
    if (radio.checked) switchEngine(radio.value);
  });
}

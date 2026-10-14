// Runs the Kokoro AI voice in a Web Worker: a separate background thread.
// Turning text into speech takes a lot of computing. If it ran on the page's
// own thread, the page would freeze (no animations, no button clicks) while
// each sentence was being made. In here, it can't slow the page down.
//
// The page sends messages like { id, type: 'generate', text, voice } and we
// reply with { id, result } or { id, error }.

import { KokoroTTS } from 'https://cdn.jsdelivr.net/npm/kokoro-js@1.2.1/dist/kokoro.web.js';

const MODEL_ID = 'onnx-community/Kokoro-82M-v1.0-ONNX';
let tts = null;

self.addEventListener('message', async (event) => {
  const { id, type, text, voice } = event.data;
  try {
    if (type === 'load') {
      tts ??= await KokoroTTS.from_pretrained(MODEL_ID, {
        dtype: 'q8',    // smaller, "quantized" model: ~90 MB instead of ~330 MB
        device: 'wasm', // runs on the CPU and works in every modern browser
        progress_callback: (info) => self.postMessage({ type: 'progress', info }),
      });
      self.postMessage({ id, result: tts.voices });
    } else if (type === 'generate') {
      const audio = await tts.generate(text, { voice });
      self.postMessage({ id, result: audio.toBlob() }); // a WAV file
    }
  } catch (error) {
    self.postMessage({ id, error: error.message });
  }
});

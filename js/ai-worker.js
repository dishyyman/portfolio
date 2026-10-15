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
let device = null; // 'webgpu' or 'wasm', once loaded

// Checks that the browser supports WebGPU and can find a graphics card to use.
async function canUseWebGPU() {
  if (!navigator.gpu) return false;
  try {
    return Boolean(await navigator.gpu.requestAdapter());
  } catch {
    return false;
  }
}

// Some graphics cards make garbled noise instead of failing outright, so say
// one word and check the sound looks like speech: no broken numbers, not
// silent, and not impossibly loud (real audio stays between -1 and 1).
async function soundsRight(model) {
  const { audio } = await model.generate('Hello.', { voice: 'af_heart' });
  let peak = 0;
  for (const sample of audio) {
    if (!Number.isFinite(sample)) return false;
    peak = Math.max(peak, Math.abs(sample));
  }
  return peak > 0.01 && peak < 1.5;
}

async function loadModel(progress_callback) {
  // The fast way: the graphics card (WebGPU) with the full-size model (~330 MB).
  // On a recent Mac this makes speech about 6× faster than it plays.
  // It has to be the full-size ("fp32") model: the half-size one ("fp16") came
  // out distorted or silent on the graphics card.
  if (await canUseWebGPU()) {
    try {
      const model = await KokoroTTS.from_pretrained(MODEL_ID, { dtype: 'fp32', device: 'webgpu', progress_callback });
      if (await soundsRight(model)) {
        device = 'webgpu';
        return model;
      }
      console.warn('The graphics card made garbled audio, so the AI voice will use the CPU instead.');
    } catch (error) {
      console.warn('The AI voice could not use the graphics card, so it will use the CPU instead.', error);
    }
  }

  // The fallback: the CPU (WebAssembly) with a smaller, "quantized" model (~90 MB).
  // It works in every modern browser, but can be slower than the speech plays.
  progress_callback({ status: 'restart' }); // start the progress bar over for the new download
  device = 'wasm';
  return KokoroTTS.from_pretrained(MODEL_ID, { dtype: 'q8', device: 'wasm', progress_callback });
}

self.addEventListener('message', async (event) => {
  const { id, type, text, voice } = event.data;
  try {
    if (type === 'load') {
      tts ??= await loadModel((info) => self.postMessage({ type: 'progress', info }));
      self.postMessage({ id, result: device });
    } else if (type === 'generate') {
      const audio = await tts.generate(text, { voice });
      self.postMessage({ id, result: audio.toBlob() }); // a WAV file
    }
  } catch (error) {
    self.postMessage({ id, error: error.message });
  }
});

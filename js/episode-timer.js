/*
  episode-timer.js: counts down through an episode's segments and shows what
  to talk about in each one.

  How the timing works: instead of adding 1 every second (which drifts, and
  stops when the tab is in the background), we remember WHEN play was pressed
  and work out the elapsed time from the clock every time we draw the screen.
*/

// ===== THE SEGMENTS =====
// Edit this list to change the episode. start and end are in minutes.
// "focus" is the message shown under the countdown.
const SEGMENTS = [
  {
    title: "Cold open",
    start: 0,
    end: 1,
    focus: "The single hottest take or argument from the episode.",
  },
  {
    title: "Intro",
    start: 1,
    end: 2,
    focus: "Show name, the film, and the question: “Do we need one more?”",
  },
  {
    title: "First impressions + quality",
    start: 2,
    end: 15,
    focus: "Open with the strongest opinion, not the setup.",
  },
  {
    title: "Rewatchability",
    start: 15,
    end: 35,
    focus: "Best scenes, what holds up, what doesn't.",
  },
  {
    title: "Narrative runway",
    start: 35,
    end: 50,
    focus: "Is there story left?",
  },
  {
    title: "The verdict",
    start: 50,
    end: 57,
    focus: "Each host votes YES or NO, then the official show verdict.",
  },
  {
    title: "Outro",
    start: 57,
    end: 60,
    focus: "Tease the next episode.",
  },
];

// The timer turns yellow when this much time is left in a segment.
const WARNING_SECONDS = 2 * 60;
// Segments this short or shorter would be yellow the whole time, so they warn
// for the last 15 seconds instead.
const SHORT_SEGMENT_WARNING_SECONDS = 15;
const SKIP_SECONDS = 30;
// When a new segment starts, the timer flashes red and white this many times.
const FLASH_COUNT = 3;

// Everything below works in seconds, so convert the minutes once up front.
const segments = SEGMENTS.map((segment) => ({
  ...segment,
  start: segment.start * 60,
  end: segment.end * 60,
}));
const TOTAL_SECONDS = segments[segments.length - 1].end;

// ===== FIND THE ELEMENTS ON THE PAGE =====

const timer = document.getElementById("timer");
const segmentTitle = document.getElementById("segment-title");
const countdown = document.getElementById("countdown");
const countdownLabel = document.getElementById("countdown-label");
const segmentFocus = document.getElementById("segment-focus");
const progressBar = document.getElementById("progress-bar");
const progressFill = document.getElementById("progress-fill");
const progressThumb = document.getElementById("progress-thumb");
const progressHover = document.getElementById("progress-hover");
const progressTicks = document.getElementById("progress-ticks");
const elapsedText = document.getElementById("elapsed");
const totalText = document.getElementById("total");
const upNext = document.getElementById("up-next");
const playButton = document.getElementById("play-btn");
const playIcon = document.getElementById("play-icon");
const playLabel = document.getElementById("play-label");
const segmentList = document.getElementById("segment-list");

// ===== TIMER STATE =====

// Seconds counted before the most recent press of play.
let savedSeconds = 0;
// The clock reading (in ms) when play was pressed, or null while paused.
let startedAt = null;
// Which segment is on screen, so we only redraw the message when it changes.
let shownSegmentIndex = -1;

const isRunning = () => startedAt !== null;

const getElapsedSeconds = () => {
  if (!isRunning()) return savedSeconds;
  return savedSeconds + (performance.now() - startedAt) / 1000;
};

// Jump to a time. Keeps running if it was running.
const setElapsedSeconds = (seconds) => {
  savedSeconds = Math.min(Math.max(seconds, 0), TOTAL_SECONDS);
  if (isRunning()) startedAt = performance.now();
  render();
};

// ===== HELPERS =====

// 754 -> "12:34"
const formatTime = (totalSeconds) => {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.floor(totalSeconds % 60);
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
};

// The segment that contains this time. Past the end, it's the last one.
const getSegmentIndex = (seconds) => {
  const index = segments.findIndex((segment) => seconds < segment.end);
  return index === -1 ? segments.length - 1 : index;
};

const getWarningSeconds = (segment) => {
  const length = segment.end - segment.start;
  return length <= WARNING_SECONDS ? SHORT_SEGMENT_WARNING_SECONDS : WARNING_SECONDS;
};

// ===== DRAW THE SCREEN =====

const showSegmentMessage = (index) => {
  const segment = segments[index];
  segmentTitle.textContent = segment.title;
  segmentFocus.textContent = segment.focus;

  const next = segments[index + 1];
  upNext.textContent = next ? `Up next: ${next.title} at ${formatTime(next.start)}` : "Last segment";

  // Highlight this segment in the run sheet
  segmentList.querySelectorAll("li").forEach((item, itemIndex) => {
    item.classList.toggle("current", itemIndex === index);
    item.classList.toggle("done", itemIndex < index);
  });

  // Replay the fade-in animation (same trick as I Read It Somewhere)
  segmentFocus.classList.remove("fade-in");
  segmentTitle.classList.remove("fade-in");
  void segmentFocus.offsetWidth;
  segmentFocus.classList.add("fade-in");
  segmentTitle.classList.add("fade-in");
};

// The "new segment" cue: red for half a second, white for half a second,
// FLASH_COUNT times, then back to normal. The CSS colors come from data-flash.
let flashInterval = null;

const flashSegmentChange = () => {
  clearInterval(flashInterval); // in case a flash is already going
  let halfSeconds = 0;
  timer.dataset.flash = "red";

  flashInterval = setInterval(() => {
    halfSeconds += 1;
    if (halfSeconds >= FLASH_COUNT * 2) {
      clearInterval(flashInterval);
      delete timer.dataset.flash; // removes data-flash, so the normal color comes back
    } else {
      timer.dataset.flash = halfSeconds % 2 === 0 ? "red" : "white";
    }
  }, 500);
};

// isTick is true when the clock moved on its own (not a skip or a jump),
// which is the only time a new segment should flash.
const render = (isTick = false) => {
  const elapsed = getElapsedSeconds();
  const index = getSegmentIndex(elapsed);
  const segment = segments[index];
  const isOver = elapsed >= TOTAL_SECONDS;

  if (index !== shownSegmentIndex) {
    if (isTick) flashSegmentChange();
    shownSegmentIndex = index;
    showSegmentMessage(index);
  }

  // Round the countdown UP, so it reads 1:00 at the start of a 1-minute
  // segment and 0:01 during the last second, then switches at 0.
  const secondsLeft = Math.ceil(segment.end - elapsed);

  if (isOver) {
    countdown.textContent = `+${formatTime(elapsed - TOTAL_SECONDS)}`;
    countdownLabel.textContent = "over time";
  } else {
    countdown.textContent = formatTime(secondsLeft);
    countdownLabel.textContent = index === segments.length - 1 ? "left in episode" : "left in segment";
  }

  // Pick the color: red when over, yellow near the end of a segment, green otherwise
  if (isOver) timer.dataset.state = "over";
  else if (secondsLeft <= getWarningSeconds(segment)) timer.dataset.state = "warning";
  else timer.dataset.state = "normal";

  // Paused partway through: dim the numbers so it's obvious from across the room
  const isPaused = !isRunning() && elapsed > 0;
  timer.classList.toggle("is-paused", isPaused);
  if (isPaused) countdownLabel.textContent = "paused";

  // Progress bar and elapsed time
  const shownElapsed = Math.min(elapsed, TOTAL_SECONDS);
  const percent = `${(shownElapsed / TOTAL_SECONDS) * 100}%`;
  progressFill.style.width = percent;
  progressThumb.style.left = percent;
  progressBar.setAttribute("aria-valuenow", Math.floor(shownElapsed));
  progressBar.setAttribute("aria-valuetext", `${formatTime(shownElapsed)} of ${formatTime(TOTAL_SECONDS)}`);
  elapsedText.textContent = formatTime(elapsed);

  // Play / pause button
  playIcon.className = isRunning() ? "fa-solid fa-pause" : "fa-solid fa-play";
  if (isRunning()) playLabel.textContent = "Pause";
  else if (elapsed === 0) playLabel.textContent = "Start";
  else playLabel.textContent = "Resume";
  // On phones the label is hidden to save room, so screen readers get it from here
  playButton.setAttribute("aria-label", playLabel.textContent);

  // Browser tab title, handy when the timer is in another tab
  document.title = isRunning() ? `${countdown.textContent} · ${segment.title}` : "Dish | Episode Timer";
};

// ===== CONTROLS =====

let tickInterval = null;

const play = () => {
  if (isRunning()) return;
  startedAt = performance.now();
  // Redraw 4 times a second so the countdown never looks a beat late
  tickInterval = setInterval(() => render(true), 250);
  keepScreenOn();
  render();
};

const pause = () => {
  if (!isRunning()) return;
  savedSeconds = getElapsedSeconds();
  startedAt = null;
  clearInterval(tickInterval);
  letScreenSleep();
  render();
};

const togglePlay = () => (isRunning() ? pause() : play());

const skip = (seconds) => setElapsedSeconds(getElapsedSeconds() + seconds);

// Like a music player: a few seconds into a segment, "previous" restarts it.
// Right at the start, it goes to the one before.
const previousSegment = () => {
  const elapsed = getElapsedSeconds();
  const index = getSegmentIndex(elapsed);
  const intoSegment = elapsed - segments[index].start;
  const target = intoSegment > 3 || index === 0 ? index : index - 1;
  setElapsedSeconds(segments[target].start);
};

const nextSegment = () => {
  const index = getSegmentIndex(getElapsedSeconds());
  setElapsedSeconds(segments[index].end);
};

const reset = () => {
  if (getElapsedSeconds() > 0 && !confirm("Reset the timer to 0:00?")) return;
  pause();
  setElapsedSeconds(0);
};

playButton.addEventListener("click", togglePlay);
document.getElementById("back-btn").addEventListener("click", () => skip(-SKIP_SECONDS));
document.getElementById("forward-btn").addEventListener("click", () => skip(SKIP_SECONDS));
document.getElementById("prev-btn").addEventListener("click", previousSegment);
document.getElementById("next-btn").addEventListener("click", nextSegment);
document.getElementById("reset-btn").addEventListener("click", reset);

// ===== RUN SHEET =====
// One row per segment, plus a tick mark on the progress bar where each one starts.

segments.forEach((segment, index) => {
  const item = document.createElement("li");
  const button = document.createElement("button");
  button.type = "button";
  button.innerHTML = `<span class="segment-time"></span><span class="segment-name"></span>`;
  button.querySelector(".segment-time").textContent = `${formatTime(segment.start)}–${formatTime(segment.end)}`;
  button.querySelector(".segment-name").textContent = segment.title;
  button.addEventListener("click", () => setElapsedSeconds(segment.start));
  item.appendChild(button);
  segmentList.appendChild(item);

  if (index > 0) {
    const tick = document.createElement("span");
    tick.className = "progress-tick";
    tick.style.left = `${(segment.start / TOTAL_SECONDS) * 100}%`;
    progressTicks.appendChild(tick);
  }
});

totalText.textContent = formatTime(TOTAL_SECONDS);

// ===== CLICK OR DRAG THE PROGRESS BAR TO JUMP =====
// Works like a video: click anywhere on the bar, or drag along it.

let isDragging = false;

// Turns a spot on the screen into a time in the episode
const timeAtPointer = (event) => {
  const box = progressBar.getBoundingClientRect();
  const fraction = Math.min(Math.max((event.clientX - box.left) / box.width, 0), 1);
  return fraction * TOTAL_SECONDS;
};

// The little label above the bar, e.g. "16:22 · Rewatchability"
const showHoverTime = (event) => {
  const seconds = timeAtPointer(event);
  progressHover.textContent = `${formatTime(seconds)} · ${segments[getSegmentIndex(seconds)].title}`;
  progressHover.hidden = false;

  // Center it over the pointer, but keep it from hanging off either end of the bar
  const barWidth = progressBar.offsetWidth;
  const halfLabel = progressHover.offsetWidth / 2;
  const x = (seconds / TOTAL_SECONDS) * barWidth;
  progressHover.style.left = `${Math.min(Math.max(x, halfLabel), barWidth - halfLabel)}px`;
};

const stopDragging = () => {
  isDragging = false;
  progressBar.classList.remove("dragging");
  progressHover.hidden = true;
};

progressBar.addEventListener("pointerdown", (event) => {
  isDragging = true;
  // "Capture" keeps sending moves to the bar even if your finger slides off it
  progressBar.setPointerCapture(event.pointerId);
  progressBar.classList.add("dragging");
  setElapsedSeconds(timeAtPointer(event));
  showHoverTime(event);
});

progressBar.addEventListener("pointermove", (event) => {
  // Safety net: if the mouse button came up somewhere we didn't hear about, stop dragging
  if (isDragging && event.pointerType === "mouse" && event.buttons === 0) stopDragging();
  if (isDragging) setElapsedSeconds(timeAtPointer(event));
  // A mouse can hover without clicking; a finger only "moves" while dragging
  if (isDragging || event.pointerType === "mouse") showHoverTime(event);
});

progressBar.addEventListener("pointerup", stopDragging);
progressBar.addEventListener("pointercancel", stopDragging);
progressBar.addEventListener("pointerleave", () => {
  if (!isDragging) progressHover.hidden = true;
});

// ===== FULL SCREEN =====
// Makes the timer fill the screen so it's easy to read from across the room.

const fullscreenButton = document.getElementById("fullscreen-btn");

const toggleFullscreen = () => {
  if (document.fullscreenElement) document.exitFullscreen();
  else timer.requestFullscreen();
};

if (document.fullscreenEnabled) {
  fullscreenButton.addEventListener("click", toggleFullscreen);
  document.addEventListener("fullscreenchange", () => {
    const isFullscreen = document.fullscreenElement === timer;
    fullscreenButton.querySelector("i").className = isFullscreen ? "fa-solid fa-compress" : "fa-solid fa-expand";
    fullscreenButton.setAttribute("aria-label", isFullscreen ? "Exit full screen" : "Full screen");
  });
} else {
  // iPhones don't support full screen for page elements
  fullscreenButton.hidden = true;
}

// ===== KEEP THE SCREEN ON =====
// A "wake lock" stops the screen from dimming while the timer runs.
// Not every browser has it, so every step checks first and ignores errors.

let wakeLock = null;

const keepScreenOn = async () => {
  if (!("wakeLock" in navigator) || wakeLock) return;
  try {
    wakeLock = await navigator.wakeLock.request("screen");
    wakeLock.addEventListener("release", () => (wakeLock = null));
  } catch {
    wakeLock = null;
  }
};

const letScreenSleep = () => {
  if (wakeLock) wakeLock.release();
};

// The browser drops the wake lock when you switch tabs, so ask again on return
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && isRunning()) keepScreenOn();
});

// ===== KEYBOARD SHORTCUTS =====

document.addEventListener("keydown", (event) => {
  if (event.metaKey || event.ctrlKey || event.altKey) return;

  if (event.key === " ") {
    // preventDefault stops the page from scrolling, and stops Space from also
    // "clicking" whichever button was clicked last
    event.preventDefault();
    if (!event.repeat) togglePlay();
  } else if (event.key === "ArrowLeft") {
    event.preventDefault();
    event.shiftKey ? previousSegment() : skip(-SKIP_SECONDS);
  } else if (event.key === "ArrowRight") {
    event.preventDefault();
    event.shiftKey ? nextSegment() : skip(SKIP_SECONDS);
  } else if (event.key === "f" || event.key === "F") {
    if (document.fullscreenEnabled) toggleFullscreen();
  }
});

// Draw the starting screen
render();

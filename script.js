// script.js — the "Fun fact" counter in the About Me section.
// It works out how many seconds have passed since START_DATE
// and updates the number on the page once every second.

// Change this to the day you started coding (format: "YYYY-MM-DD")
const START_DATE = new Date("2026-10-12");

// Find the <span id="time-container"> in index.html
const timeContainer = document.getElementById("time-container");

// Formats big numbers with commas, e.g. 1234567 -> "1,234,567"
const numberFormatter = new Intl.NumberFormat("en-US");

function updateCounter() {
  const now = new Date();
  // Dates subtract to milliseconds, so divide by 1000 to get seconds
  const seconds = Math.floor((now - START_DATE) / 1000);
  timeContainer.innerText = numberFormatter.format(seconds);
}

updateCounter(); // run once right away
setInterval(updateCounter, 1000); // then again every 1000ms (1 second)

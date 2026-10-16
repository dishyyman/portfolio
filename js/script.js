// script.js — the homepage: the "Fun fact" counter and the projects carousel.
// The counter works out how many seconds have passed since START_DATE
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

// ---------- Projects carousel ----------
// The project cards sit in a row that scrolls sideways (see .project-carousel
// in style.css). The arrow buttons scroll it by one card at a time, and each
// button turns off when there's nothing more to see in its direction.

const carousel = document.getElementById("project-carousel");
const prevButton = document.getElementById("projects-prev");
const nextButton = document.getElementById("projects-next");

// One card's width plus the gap after it
function cardStep() {
  const card = carousel.querySelector(".project-card");
  const gap = parseFloat(getComputedStyle(carousel).columnGap) || 0;
  return card.offsetWidth + gap;
}

function updateCarouselButtons() {
  const maxScroll = carousel.scrollWidth - carousel.clientWidth;
  // A couple of pixels of slack, since scroll positions aren't always whole numbers
  prevButton.disabled = carousel.scrollLeft <= 2;
  nextButton.disabled = carousel.scrollLeft >= maxScroll - 2;
}

prevButton.addEventListener("click", () => {
  carousel.scrollBy({ left: -cardStep() });
});

nextButton.addEventListener("click", () => {
  carousel.scrollBy({ left: cardStep() });
});

carousel.addEventListener("scroll", updateCarouselButtons);
window.addEventListener("resize", updateCarouselButtons);
updateCarouselButtons(); // set them right on page load

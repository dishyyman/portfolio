# mdishno-portfolio

My portfolio to build on as I create projects. Built from scratch with plain HTML, CSS, and JavaScript.

**Live site:** https://dishyyman.github.io/portfolio/

## Projects

- **[Storytime Reader](https://dishyyman.github.io/portfolio/storytime-reader.html)**: paste any text and hear it read aloud, with each sentence and word highlighted as it's spoken. It can use your browser's built-in voices or Kokoro, an open-source AI voice that runs on your device. Code: `storytime-reader.html`, `css/storytime-reader.css`, and the `js/storytime-reader.js`, `js/ai-voice.js`, `js/ai-worker.js` scripts.
- **[Weather](https://dishyyman.github.io/portfolio/weather.html)**: search any city (or use your location) for current weather, the next 24 hours, a 7-day forecast, air quality, and surf conditions for beach towns. Place search suggests cities as you type, remembers recent places, and guesses misspellings. Weather data comes from the free [Open-Meteo](https://open-meteo.com/) APIs, and [Photon](https://photon.komoot.io/) helps with misspelled searches and naming "Use my location". Neither needs an API key. Code: `weather.html`, `css/weather.css`, and the `js/weather.js`, `js/place-search.js`, `js/api.js`, `js/weather-codes.js` scripts.
- **[Episode Timer](https://dishyyman.github.io/portfolio/episode-timer.html)**: a countdown for recording a podcast episode. It shows what to talk about in each segment, turns yellow with 2 minutes left in a segment, and has play/pause, 30-second skips, segment jumps, a timeline you can click or drag like a video, keyboard shortcuts and a full-screen mode. Edit the `SEGMENTS` list at the top of `js/episode-timer.js` to change the run sheet. Code: `episode-timer.html`, `css/episode-timer.css`, `js/episode-timer.js`.
- **This portfolio**: a one-page site with Hero, About, Projects, Skills, Experience and Contact sections. Code: `index.html`, `css/style.css`, `js/script.js`.

## Files

| File | What it does |
| --- | --- |
| `index.html` | The homepage: Hero, About, Projects, Skills, Experience, Contact |
| `storytime-reader.html` | **Storytime Reader**: paste text and hear it read aloud with highlighting |
| `weather.html` | **Weather**: forecast, air quality and surf for any city |
| `css/style.css` | Styling (colors, fonts, layout) for the homepage |
| `css/storytime-reader.css` | Styling for Storytime Reader |
| `js/script.js` | The "I've been coding for X seconds" counter |
| `js/storytime-reader.js` | Storytime Reader's main script |
| `js/ai-voice.js`, `js/ai-worker.js` | Storytime Reader's AI voice (runs in a background thread) |
| `css/weather.css` | Styling for Weather |
| `js/weather.js` | Weather's main script: talks to the Open-Meteo APIs and fills in each panel |
| `js/place-search.js` | Weather's place search: Open-Meteo Geocoding, plus Photon for typos and naming your location |
| `js/api.js` | Shared helpers for calling APIs (`fetch`, timeouts, error messages) |
| `js/weather-codes.js` | Turns weather codes into words and icons, and AQI numbers into categories |
| `episode-timer.html` | **Episode Timer**: a segment-by-segment countdown for recording an episode |
| `css/episode-timer.css` | Styling for Episode Timer |
| `js/episode-timer.js` | Episode Timer's script, including the list of segments and their messages |
| `images/` | Photos and screenshots used on the site |
| `files/` | Downloadable files, like `resume.pdf` |

## How to view it

Double-click `index.html` to open it in your browser. After editing a file, save it and refresh the browser.

**Storytime Reader and Weather need a local server.** Their JavaScript uses modules, which browsers won't load from a double-clicked file. In this folder, run:

```bash
python3 -m http.server 8000
```

Then open http://localhost:8000. If a change doesn't show up, do a hard refresh (**Cmd+Shift+R**).

## Things to edit first

1. **Placeholder text** in `index.html`: search for "Lorem" and "Placeholder" and write each one in your own words
2. **Resume**: save it as `files/resume.pdf` so the Download resume button works
3. **Your photo**: put it in `images/` and change the `src` of the `<img class="portrait">` in `index.html`
4. **Projects** in `index.html`: copy an `<article class="project-card">` block to add more
5. **Experience** in `index.html`: copy an `<article class="timeline-item">` block to add more
6. **Start date** for the counter at the top of `js/script.js`
7. **Colors**: change the variables at the top of `css/style.css`

## Built with

- HTML
- CSS
- JavaScript
- [Font Awesome](https://fontawesome.com/) icons
- [Google Fonts](https://fonts.google.com/)
- [Open-Meteo](https://open-meteo.com/) weather data (CC BY 4.0)
- [Photon](https://photon.komoot.io/) place search, with data © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright)

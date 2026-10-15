# mdishno-portfolio

My portfolio to build on as I create projects. Built from scratch with plain HTML, CSS, and JavaScript.

**Live site:** https://dishyyman.github.io/portfolio/

## Projects

- **[Storytime Reader](https://dishyyman.github.io/portfolio/storytime-reader.html)**: paste any text and hear it read aloud, with each sentence and word highlighted as it's spoken. It can use your browser's built-in voices or Kokoro, an open-source AI voice that runs on your device. Code: `storytime-reader.html`, `css/storytime-reader.css`, and the `js/storytime-reader.js`, `js/ai-voice.js`, `js/ai-worker.js` scripts.
- **This portfolio**: a one-page site with Hero, About, Projects, Skills, Experience and Contact sections. Code: `index.html`, `css/style.css`, `js/script.js`.

## Files

| File | What it does |
| --- | --- |
| `index.html` | The homepage: Hero, About, Projects, Skills, Experience, Contact |
| `storytime-reader.html` | **Storytime Reader**: paste text and hear it read aloud with highlighting |
| `css/style.css` | Styling (colors, fonts, layout) for the homepage |
| `css/storytime-reader.css` | Styling for Storytime Reader |
| `js/script.js` | The "I've been coding for X seconds" counter |
| `js/storytime-reader.js` | Storytime Reader's main script |
| `js/ai-voice.js`, `js/ai-worker.js` | Storytime Reader's AI voice (runs in a background thread) |
| `images/` | Photos and screenshots used on the site |
| `files/` | Downloadable files, like `resume.pdf` |

## How to view it

Double-click `index.html` to open it in your browser. After editing a file, save it and refresh the browser.

**Storytime Reader needs a local server.** Its JavaScript uses modules, which browsers won't load from a double-clicked file. In this folder, run:

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

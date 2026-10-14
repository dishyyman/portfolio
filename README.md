# mdishno-portfolio

My portfolio to build on as I create projects. Built with plain HTML, CSS, and a little JavaScript.

## Files

| File | What it does |
| --- | --- |
| `index.html` | Home page: About Me, Projects, Skills |
| `contact.html` | Contact page with links to my profiles |
| `style.css` | All the styling (colors, fonts, layout) for both pages |
| `script.js` | The "I've been coding for X seconds" counter |
| `images/` | Photos and screenshots used on the site |
| `storytime-reader/` | **Storytime Reader**: paste text and hear it read aloud with highlighting. It has its own page, styles and scripts. |

## How to view it

Double-click `index.html` to open it in your browser. After editing a file, save it and refresh the browser.

**Storytime Reader needs a local server.** Its JavaScript uses modules, which browsers won't load from a double-clicked file. In this folder, run:

```bash
python3 -m http.server 8000
```

Then open http://localhost:8000. If a change doesn't show up, do a hard refresh (**Cmd+Shift+R**).

## Things to edit first

1. **About Me text** in `index.html`
2. **Your photo**: put it in `images/` and change the `src` of the `<img class="portrait">` in `index.html`
3. **Projects** in `index.html`: copy a `<details>` block to add more
4. **Contact links** in `contact.html`: replace each `href="#"`
5. **Start date** for the counter at the top of `script.js`
6. **Colors**: change the variables at the top of `style.css`

## Built with

- HTML
- CSS
- JavaScript
- [Font Awesome](https://fontawesome.com/) icons
- [Google Fonts](https://fonts.google.com/)

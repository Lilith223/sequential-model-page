# sequential-model-page

Interactive figures for **“When Imperfect Automated Fact-Checking Backfires: Social Learning in the Presence of Misinformation”** (Zixuan Liu and Ming Cao), [arXiv:2611.08053](https://arxiv.org/abs/2611.08053), the sequential fact-checking model.

The page is a static site (plain HTML, CSS and JavaScript, no build step). Every figure is recomputed live in the browser from a JavaScript port of the paper's model and Monte Carlo procedure.

## What is on the page now

| Section | What you can do |
|---|---|
| **Title section** | Title, authors, links to arXiv, PDF and this repository, and a three-point summary (no interactive part) |
| **Decision** | The individual decision problem (paper Figs. 1–2), and who is left to check as the crowd's belief moves |
| **Map** | Heatmap of the welfare change over reliability `r` and informativeness `p` (paper Figs. 3–4), with the proven thresholds and certified signs; click a cell to inspect it |

## Sections kept for later

The other sections were taken off the page but nothing was deleted:

- **HTML** (the title section's live-example card, Idea, Model, Simulate, Accuracy, Results, Takeaways, BibTeX, footer with contact details): `archive/removed-sections.html`. The comment at the top says how to put each one back.
- **Code**: still in `assets/js/`, just not loaded by `index.html` — `cascade.js` (Simulate section and the hero teaser) and `sweep.js` (Accuracy section). `model.js`, `worker.js` and `ui.js` are shared and unchanged.
- Once the Simulate section is back, the map's “Replay this article in the simulator” button reappears automatically.

## Publish on GitHub Pages

1. Push this repository to GitHub.
2. In the repository go to **Settings → Pages**, choose **Deploy from a branch**, branch `main`, folder `/ (root)`, and save.
3. The page is served at `https://<user>.github.io/sequential-model-page/` after a minute or so. (`.nojekyll` is included so files are served as they are. Note that `archive/` is served too, as plain unlinked files.)

## Preview locally

The Monte Carlo runs in a Web Worker, which browsers only start over http(s), so serve the folder rather than opening `index.html` directly:

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

## Layout

```
index.html              the page (Decision and Map)
archive/removed-sections.html   HTML of the sections taken off the page, with restore notes
assets/css/style.css    design system (light and dark themes)
assets/js/model.js      the model: decision policy, exact action probabilities, Monte Carlo kernel, theory thresholds
assets/js/worker.js     Monte Carlo jobs in a Web Worker (heatmap, accuracy sweep)
assets/js/ui.js         small DOM helpers, tooltip, sliders
assets/js/decision.js   Decision section
assets/js/welfare.js    Map section
assets/js/main.js       theme, navigation, scroll reveal (also the hero teaser and maths when restored)
assets/js/cascade.js    Simulate section + hero teaser   (not loaded at the moment)
assets/js/sweep.js      Accuracy section                 (not loaded at the moment)
tests/                  browser test page: compares model.js with the paper's Python results
```

## How the JavaScript port was checked

`tests/index.html` (served locally, open `/tests/`) compares `model.js` with the original Python code and the stored simulation results of the paper:

- the exact next-agent action probabilities `G_F`, `G_T` against the closed forms of `MC_util.py` (single method) and `MC_util_two_tool.py` (both methods);
- Monte Carlo cascade probabilities against the paper's 2,000-run grid for the main example (regime iii);
- the signs certified by Propositions 2 and 3 against those simulated values;
- welfare averaged over `r ~ U(0,1)` against the paper's 20,000-article pool for Fig. 5.

## License

MIT, see `LICENSE`.

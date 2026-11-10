# sequential-model-page

Interactive figures for **“When Imperfect Automated Fact-Checking Backfires: Social Learning in the Presence of Misinformation”** (Zixuan Liu and Ming Cao), [arXiv:2611.08053](https://arxiv.org/abs/2611.08053), the sequential fact-checking model.

The page is a static site (plain HTML, CSS and JavaScript, no build step). Every figure is recomputed live in the browser from a JavaScript port of the paper's model and Monte Carlo procedure.

## What is on the page now

| Section | What you can do |
|---|---|
| **Title section** | Title, authors, links to arXiv, PDF and this repository, and a three-point summary (no interactive part) |
| **Simulate** | **One** fact-checker (cost `K`, false-alarm rate `e1`, miss rate `e2`) and a crowd of 15 agents who arrive one by one (a cascade usually forms within a handful). **Left:** the posterior decision rule, i.e. the expected payoff of not checking and of checking by the agent's belief, and what she therefore does. **Right:** the simulated crowd, agent by agent: who checks, the crowd's belief, and the cascade once nobody checks any more. The same sliders drive both, with a row of presets for the fact-checker and another for the article (reliable or less reliable, truthful or fake; informativeness `p` is 0.9 by default). At the bottom, how often 3,000 simulated crowds end in a correct cascade, a wrong cascade or none, for a truthful article, a fake one and on average; a worker (`assets/js/worker.js`) computes it. If a check is never worth its cost nobody checks, the public belief cannot move and no cascade forms; only an article so reliable (or unreliable) that everybody acts alike from the start gives a cascade, with no learning. A cascade is counted from the first agent who arrives with the crowd's belief inside a shaded zone (`ECC.cascadeOf`: every agent then acts alike whatever she believes), in the marker, the badge and the statistics. The paper's own Monte Carlo (Explore, `runChain` without `strict`) stops a little earlier, once the less likely action is improbable for the true article alone; the outcomes are the same |
| **Explore** | One set of fact-checking sliders (`K_H`, `e1`, `e2`) drives two figures side by side. **Micro:** the individual decision rule, i.e. the expected payoff of not checking, of a manual check and of an automated check by the agent's belief (paper Figs. 1–2). **Macro:** heatmap of the welfare change over reliability `r` and informativeness `p` (paper Figs. 3–4), with the proven thresholds and certified signs (pills: `+`/`−` strict, `≤0` weak, `0` no change; `≤0` appears only on the fake-article map when both methods are used, for `p ≤ p_κ`; that case also draws `p_κ` as a tick on the left edge of the Fake and Average maps, with a short dotted line across the certified negative band on the Fake map only); hover over a cell (tap it on a phone) to read its values; the floating values and the one square marker (the cell under the mouse or finger) show only while the pointer is on the map; a click leaves no marker and nothing is marked by default (the docked readout on phones keeps the last reading) |

## Sections kept for later

The other sections were taken off the page but nothing was deleted:

- **Decision** (the former "Interactive 1": the two charts, with chart 2 showing who is left to check as the crowd's belief moves, and its own `r`, `p` sliders): HTML at the end of `archive/removed-sections.html`, code in `archive/decision.js`. Chart 1 lives on as the micro half of the explorer (`assets/js/rule.js`).
- **Simulate with two crowds** (the same agents with manual checking only vs. with an automated method added, 4,000-repeat probabilities, "Find me a backfire"): HTML at the end of `archive/removed-sections.html`, code in `archive/cascade.js`. The page now has the one-method version.
- **HTML** (the title section's live-example card, Idea, Model, Accuracy, Results, Takeaways, BibTeX, footer with contact details): `archive/removed-sections.html`. The comment at the top says how to put each one back.
- **Code**: `sweep.js` (Accuracy section) is still in `assets/js/` but not loaded by `index.html`. `cascade.js` exports `Sim.AgentStrip` and `Sim.agentTipSpec`, which the hero teaser uses if that card is restored. `model.js`, `worker.js` and `ui.js` are shared.

## Colours

The colours are those of the ENTEG Day poster (`sty/postersettings.sty` and `sty/beamercolorthemenott.sty` in the poster project), defined once as variables at the top of `assets/css/style.css`: navy `#10263B` for structure (top bar, headings, buttons, sliders); blue `#0072B2` and vermillion `#D55E00` for the manual and the automated tool; red `#D0103A` for Like and blue `#1F4FD0` for Dislike (decision rule, crowd, threshold lines of the map); gold `#FFDF9E`/`#F5A623` for a gain or a correct action and purple `#E2D1F0`/`#9C6FC4`/`#5B2A86` for a loss or a wrong one (the map's colour scale is the poster's). The dark theme keeps the hues on a navy base, lifted for contrast.

## Maths symbols

Symbols such as `r`, `K`, `p_κ` are set in the real italic of Source Serif 4 (loaded with the other fonts in `index.html`; without it the browser slants the upright face), and their subscripts share that face. Hats and tildes (`r̂`, `r̃`) are not typed as combining characters, which fall back to another font and drift off the letter: in text, `UI.hat(...)` draws the hat with CSS (`i.sym.hat` in `style.css`); in the map's curve labels, a small path is placed over the measured letter after the text is drawn (`drawOverlay` in `welfare.js`).

## On phones

The page is meant to be opened from a QR code on a phone. Below 720 px wide the two figures of each interactive become tabs in one panel docked at the top of the screen, with the simulation (or the welfare map) first and shown by default and "Decision rule" as the second tab (on wider screens the decision rule stays on the left, the other figure on the right), while the sliders scroll underneath, so a slider can be moved while its effect stays in view. Touch replaces hover: tap or drag on either figure, and a readout under it keeps the last reading (on the map, the three boxes under it also choose what the map colours). The docking is switched off in landscape (under 540 px tall). All of this is in the `@media (max-width: 720px)` block at the end of `assets/css/style.css`.

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
index.html              the page (title section and the explorer)
archive/removed-sections.html   HTML of the sections taken off the page, with restore notes
archive/decision.js     code of the removed Decision section (two charts)
archive/cascade.js      code of the two-crowd Simulate section
assets/css/style.css    design system (light and dark themes)
assets/js/model.js      the model: decision policy, exact action probabilities, Monte Carlo kernel, theory thresholds
assets/js/worker.js     Monte Carlo jobs in a Web Worker (heatmap, accuracy sweep)
assets/js/ui.js         small DOM helpers, tooltip, sliders
assets/js/rule.js       the individual decision rule (chart + readout) for one method (Simulate) or for manual + automated (Explore)
assets/js/cascade.js    Simulate section: sliders, the decision rule (rule.js) and one simulated crowd
assets/js/welfare.js    the explorer: shared sliders, the welfare map, and the layout of both figures
assets/js/main.js       theme, navigation, scroll reveal (also the hero teaser and maths when restored)
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

# aligurbu.github.io

The personal academic website of **Ali Gürbüz**: fluid mechanics, computational mechanics, and scientific machine learning.

**Live site:** <https://aligurbu.github.io>

The hero of the home page is a live simulation: tracer particles in the *exact* Stokes flow around a squirmer, a sphere that swims by moving its surface (Lighthill 1952; Blake 1971). Tracers glow with the local fluid speed, and the cursor steers the swimmer through an external torque, which adds a rotlet that is superposed exactly. The [Flow Lab](https://aligurbu.github.io/flow-lab/) page has two interactive explainers built on the same physics: a squirmer explorer (pushers, pullers, frames of reference, streamlines, speed map) and a three-sphere swimmer (shape-space loops, the scallop theorem, and Brinkman screening in a porous medium).

## Design principles

- **No build step, no dependencies.** Plain HTML, CSS, and JavaScript. GitHub Pages serves the files as they are (`.nojekyll`).
- **Content first.** Every page reads fully without JavaScript; scripts only enhance it.
- **Private by default.** No analytics, no cookies, no third-party requests. Fonts are self-hosted, and a strict Content Security Policy is set.
- **Accessible.** Semantic landmarks, keyboard-friendly controls, `prefers-reduced-motion` (animations start paused), and light and dark themes that follow the system setting.
- **Fast.** The home page weighs under 1 MB, fonts and figures included, and the WebP figures load lazily. Animations pause when they are off screen or the tab is hidden.

## Structure

```
index.html              Home: hero, recent news, about, research, publications, software, teaching, service, contact
flow-lab/index.html     Interactive explainers
404.html                "This page swam away" (absolute paths: GitHub Pages serves it at any depth)
cv.pdf                  Public CV (no home address, phone number, or referee contact details)
assets/css/site.css     The whole design system: tokens, light/dark themes, layout, components, print styles
assets/js/flow.js       Squirmer flow engine (exact Stokes solution, tracers, streamlines, speed map)
assets/js/flow-lab.js   Flow Lab user interface and the three-sphere swimmer model
assets/js/site.js       Theme toggle, navigation, scrollspy, reveal-on-scroll, publication filters, copy buttons
assets/js/theme-init.js Applies the saved theme before first paint (no flash)
assets/fonts/           Newsreader, Inter, and JetBrains Mono (latin subsets, SIL Open Font License)
assets/img/research/    Figures from published work, each cited in its caption
tools/og-card.html      Template for the social preview image (assets/img/og-card.jpg)
```

## Updating the content

Everything lives in `index.html`, so open it in any editor.

| To change… | Edit… |
| --- | --- |
| **News** | The four cards under `<!-- NEWS -->`. Replace the oldest card with the newest. |
| **A new paper** | Copy an existing `<li class="pub">` in the publications list. Set `data-tags` to `published`, `review`, or `prep`, and add `first` for first-author papers. The filter counts update automatically. |
| **A paper that gets published** | Move its `<li>` from "Under review" to "Journal articles", change its tags, and add the DOI and BibTeX. |
| **CV** | Replace `cv.pdf` with the new public CV. Remove the home address, personal phone number, and referees' contact details first. |
| **Headshot** | Save a square photo as `assets/img/headshot.jpg` and uncomment the `<img>` line in the profile card (search for `headshot`). |
| **"Last updated" date** | The footer of `index.html` and the `<lastmod>` dates in `sitemap.xml`. |

## Previewing locally

```bash
python -m http.server 8765
# then open http://localhost:8765
```

(Opening `index.html` directly also works, but the 404 page and the social card template need a server.)

## Deployment

GitHub Pages serves the `main` branch from the repository root. Every push to `main` goes live within about a minute.

## Credits and licenses

- **Code** (HTML, CSS, JavaScript): MIT License, see [`LICENSE`](LICENSE).
- **Text, CV, and images**: © Ali Gürbüz, all rights reserved. Research figures are from the published papers cited in their captions.
- **Fonts**: [Newsreader](https://github.com/productiontype/Newsreader), [Inter](https://github.com/rsms/inter), and [JetBrains Mono](https://github.com/JetBrains/JetBrainsMono), all under the SIL Open Font License 1.1 (license files in `assets/fonts/`).
- **Physics**: the squirmer model of Lighthill (1952) and Blake (1971), and the three-sphere swimmer of Najafi & Golestanian (2004), with Brinkman-screened interactions as studied in Liao, Lemus, Gürbüz *et al.*, *Phys. Rev. E* 109, 065106 (2024).

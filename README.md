# QALA: secure app streaming that stops AI cloning

QALA streams desktop and web apps from the cloud, so the binary never reaches the user's device. An AI Detection Engine scores every session and stops agents that try to copy the app through its screens.

Team **CORE TETYM**. Built for NeuroBridge.SI, Baku 2026.

## Live

| Page | Path | What it shows |
|---|---|---|
| Website | `/` | Product, results, pricing and roadmap |
| Live prototype | `/demo` | Streaming preview, live detector, attack lab, benchmark |
| Demo video | `/media/QALA_demo_video.mp4` | The core scenario in 86 seconds |

## Repository layout

```
.
├── index.html            website (static, no build step)
├── demo/index.html       live prototype (one self-contained page)
├── core/
│   ├── qala_core.js      detection logic: features, v1 and v2 models, replay, benchmark
│   ├── train_v2.js       trains the v2 logistic-regression weights
│   └── qala_core.test.js 16 automated tests
├── assets/               favicon and logos
├── media/                demo video
├── docs/                 project brief
├── vercel.json           clean URLs
└── package.json          test and train scripts (no runtime dependencies)
```

## Run the tests

You need Node 18 or newer.

```
npm test          # 16 tests: numbers, thresholds, honeypot, held-out v2 results, demo/code parity
npm run train     # reproduces the v2 weights stored in core/qala_core.js
```

## Deploy to Vercel

1. Push this folder to a GitHub repository.
2. In Vercel, choose **Add New → Project** and import the repository.
3. Set **Framework Preset** to **Other**, leave **Build Command** empty, and leave **Output Directory** as `.`.
4. Deploy. The site is served from `/` and the prototype from `/demo`.

## Results (seed 777, 100 sessions per attacker type)

| Defence | Naive | Jittered | Human-mimic | Low-and-slow | Real users flagged |
|---|---|---|---|---|---|
| Rate-limit rule | 100% | 100% | 43% | 1% | 18% |
| QALA v1 (calibrated) | 100% | 100% | 67% | 3% | 1% |
| QALA v2 (trained, held-out seed) | 100% | 100% | 73% | 38% | 1% |

All sessions are simulated, so pilots will measure the detector on real users and real agents.

## Disclosure

- **Models:** v1 is a transparent weighted logistic classifier over 7 behavioural features plus a honeypot rule. v2 averages v1 with a logistic-regression model trained on 10,612 labelled prefixes from 1,000 simulated sessions.
- **Data:** synthetic sessions generated in the browser, plus the visitor's own clicks. No personal or external data.
- **Components:** vanilla JavaScript, Canvas and a Web Worker, with no libraries. The production streaming layer is Apache Guacamole (Apache-2.0). Fonts come from Google Fonts.
- **Templates:** the website's style follows the CyberGuard Webflow template (Flowzai), rebuilt from scratch with no template code or images. The pitch deck is built on a Canva template.
- **AI tools:** built with help from Claude (Anthropic) as a coding and writing assistant.

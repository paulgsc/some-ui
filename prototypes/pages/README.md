# Pages recon: a landing page for recruiters (#3361, PAGES)

Recon and prototypes only. This folder lives on `claude/pages-recon` and never merges.

The owner (2026-11-22, close paraphrase): the public Pages site exists for recruiters and as a
portfolio. Nothing else matters there. Prune it, and make it the résumé as a landing page. The
home network's `lan` build is not part of this.

## 1. What Pages ships today

**Build.** `pages.yml` builds www with `SOME_UI_PROFILE=pages` (audiences `public` + `web`),
`VITE_STATIC_DATA=true`, base `/some-ui/`. `VIEWER_BUILD` is true there, so every store is an
in-memory copy seeded with sample drafts (`src/lib/demo`). Measured on `main` at `71e32e0`
(local `vite build`, same env):

| What                                     | Pages                                                              |
| ---------------------------------------- | ------------------------------------------------------------------ |
| Output                                   | 6.0 MB, 272 assets                                                 |
| JS / CSS                                 | 3.5 MB / 0.24 MB raw                                               |
| First visit to `/` (index.html preloads) | **97 JS files, 1.34 MB raw, about 400 KB gzip**                    |
| Requests to settle `/` (Playwright)      | 117                                                                |
| WASM (3 engines) + fonts                 | 0.65 MB                                                            |
| Résumé PDFs in `public/`                 | 37 files, 1.55 MB (7 defaults 0.34 MB, 30 layout variants 1.21 MB) |

The `lan` build is the same size. The profiles differ in a handful of chunks, so Pages is
essentially the home build without `lan` routes.

**What a visitor sees first** (`shots/today-*.png`): `/` with no session renders the extensions
comb (`ExtensionsPage chrome="front"`, `routes/index.tsx` `Root`). The header says "SOME UI",
the page says "Pick a cell", and the nav offers Playoff Delta, Résumé and Try the demo. Neither
the screen nor the page title gives the owner's name, role or a way to contact them. The
résumé is one click away. On a desktop it is a PDF in an embed. On the phone it is an HTML
reading view, 5,157 px tall.

**Routes Pages offers** (everything not under `_lan/` or `_apk/`). Every one of them is also
in `lan`: they are shared code. Last change is the route file's last commit (full history).

| Route                                                                  | What it shows a visitor                                                     | Last change         | Own chunk                                                  |
| ---------------------------------------------------------------------- | --------------------------------------------------------------------------- | ------------------- | ---------------------------------------------------------- |
| `/`                                                                    | The extensions comb (Pages); the foyer `Landing` (lan)                      | 2026-11-03          | (main)                                                     |
| `/extensions`                                                          | The same comb, with a back link                                             | 2026-09-24          | 2 KB + honeycomb                                           |
| `/resume` (+ static shell `resume/index.html`)                         | Résumé: PDF embed (desktop), HTML view (phone), 6 versions × 6 layouts      | 2026-10-27          | 52 KB                                                      |
| `/mission`                                                             | The two mandates, for a viewer                                              | 2026-10-27          | 12 KB                                                      |
| `/assurance`                                                           | The promise ledger (22,000 px tall on desktop)                              | 2026-10-27          | 392 KB                                                     |
| `/app`, `/sessions/*`, `/practice/settings`, `/profile`, `/settings/*` | The learning apps' demo on sample data (TOPIK, Hangul Honeycomb, LeetType)  | 2026-11-05          | topik 322 KB, leetype 241 KB, hangul + hexagon WASM 300 KB |
| `/rust-rounds-sample`                                                  | Rust Rounds on sample data                                                  | 2026-11-01          | 121 KB                                                     |
| `/job-run`                                                             | One morning's Jobs run on a sample digest                                   | 2026-10-18          | 16 KB                                                      |
| `/playoff-delta`                                                       | Playoff Delta's recording stage                                             | 2026-11-07          | small + stage                                              |
| `/call`, `/essay`, `/report`, `/rust-screen`                           | Video stages: one scene of the weekly call, an essay, the engagement report | 2026-11-14 to 11-21 | essay 89 KB, stage 82 KB, call 21 KB, report 23 KB         |
| `/burn-ins`, `/captions`                                               | Subtitle/card preview (`/captions` redirects to it)                         | 2026-10-29          | burn-ins 81 KB                                             |
| `/authorship`                                                          | Who made each scene of a published video                                    | 2026-10-30          | small                                                      |
| `/auth`                                                                | Sign-in page (opens the demo on Pages)                                      | 2026-11-17          | 1 KB                                                       |

The route files did change recently, as a side effect of sweeps. The owner's point is about
attention, not commits: nobody has looked at `/` as a recruiter would. Its words date from
September (`extensions.tsx`, 2026-09-24), and the comb has been the front door since #2111.

**What `lan` needs that Pages doesn't**: the foyer `Landing` (administration, wings), `_lan/*`
(home switches, lessons, résumé with contact details), the passkey, `file_host`. Pages needs
none of these. **What both share** (and so a prune may not delete): every route file above,
`Root` in `routes/index.tsx` (one component picks `Landing` or the comb), `ExtensionsPage`,
the `/resume` route and `@some-ui/resume`, `lib/site-map`, `lib/wings`, the video stages
(`lib/web-surface`), and `public/` (the résumé PDFs go to both). The video renderer does **not**
use the Pages stages: it builds its own (`build:stage` → `/opt/stage`, `lib/render-image`).

**Worth keeping for a recruiter**: the résumé (one PDF per version), proof of work with a way
to try it (the learning apps' sample, the extensions comb), the source links. **Gaps**: there
is no demo video anywhere (`site-map`'s `demo` is set on no destination), and no public AMO
listing URL in the repo for Suspender Ledger (only "passed AMO review").

## 2. Codex's attempt: PR #3034 (`codex/showcase-open`)

Open, 1 commit, +1,294/−76, 17 files: a 280-line `showcase-page.tsx`, 703 lines of CSS and 104
lines of copy. It replaces the Pages `/` with "A working notebook": a hero "I build it. I live
in it.", then "01 / Voice" (a sample conference-call stage and a motion scrubber), "02 /
Decisions" (accordions: the assurance ledger's counts, a call record, a lint rule, a typst
definition), "03 / Over time" (four dated commits). There is no `codex/showcase-guided` branch.
Screens: `shots/codex-*.png` (its own, from the branch).

Measured against what a recruiter needs from a portfolio (who, what role, proof, résumé,
contact; see the reach below):

1. **No role.** The name is in the header, but the page never says the person is a software
   engineer, or names a stack. "I build it. I live in it." is the only headline, and it names
   no job.
2. **Contact is missing, and the résumé sits at the bottom.** No email, no GitHub profile
   link. "Résumé →" is in the footer, about 3,400 px down on a phone (`codex/mobile-full.png`:
   3,561 px tall).
3. **The proof needs this repo's vocabulary.** The evidence is "90 objectives / 53 holds / 37
   other verdicts", "gray-area calls", "a falsifier", commit hashes, a typst axiom. None of it
   is a project with what it does, its stack and a link to try it. The comb, the learning apps
   and the AMO-reviewed extension are not on the page.
4. **The first claim reads against the reader.** "Claude writes the code. I work at the
   decision layer." is the second sentence a hiring reader sees, with nothing beside it that
   shows hands-on engineering (the résumé's Rust service, its 300+ tests, the AMO release).
5. **The cost is a design to maintain.** A bespoke 700-line stylesheet and a sample-call
   stage are what atrophy when nobody visits. The standard shape is a page of plain sections.

## 3. The reach (CLAUDE.md, "Reach before you build")

This is a generic story: anyone could ask for "a developer portfolio landing page with my
résumé". So it stops at rung 1 or 2 unless a part is ours.

**What the standard shape is.** Portfolio guidance converges on one short page. At the top: name,
role and domain in one line, with the résumé and contact as links. Then the best projects, each
saying what it does, the stack, and links to a live demo and source. Then experience, skills and
education, with contact again at the end. Keep the design plain, and make it work well on a
phone, since recruiters often open links there.
Sources:
[fueler.io, "Your portfolio has 7 seconds"](https://www.fueler.io/blog/your-portfolio-has-7-seconds-what-recruiters-look-at-first),
[slategit, 3-second scan](https://slategit.com/blog/portfolio-homepage-first-impression-3-second-scan),
[devplaybook checklist](https://devplaybook.cc/blog/developer-portfolio-checklist-20-things-hiring-managers),
[daily.dev](https://daily.dev/blog/how-to-build-developer-profile-get-noticed/),
[Intuit](https://www.intuit.com/blog/global-stories/software-engineer-portfolio/). The "7
seconds" figure is repeated widely without a primary study; the shape is what they agree on.

**Inward first.** We already have every piece:

- the résumé as data: Typst → `packages/ui/resume/src/react/generated/data.ts`, six versions;
- its PDFs;
- a static HTML entry on Pages: `apps/www/resume/index.html`, a second Vite input, with
  `check-resume-deploy.mjs` checking it after each deploy;
- the comb and the sample demos, as links.

A landing page is a new case of that static entry, not a new pipeline.

**Candidates.**

| Rung            | Candidate                                                                                                                   | Where data lives | Owner's step                   | Honest limits                                                                                                                                                           |
| --------------- | --------------------------------------------------------------------------------------------------------------------------- | ---------------- | ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 Use           | GitHub profile README (`paulgsc/paulgsc`)                                                                                   | GitHub           | Create the repo                | It complements the site but can't replace it: every résumé PDF names `paulgsc.github.io/some-ui` as the portfolio                                                       |
| 1 Use           | LinkedIn / hosted résumé sites (JSON Resume registry, Read.cv-style)                                                        | Third party      | An account; copy the résumé in | A second copy of the résumé that drifts. No live demos. Not this repo's channel                                                                                         |
| 2 Fold in       | MIT templates: devportfolio (Astro + Tailwind), al-folio (Jekyll, aimed at academics), Hugo themes (toha, Portio)           | Pages            | None                           | A second toolchain inside `pages.yml`'s one artifact, and the résumé typed in again by hand. The template gives us its _shape_, which is a dozen lines of HTML sections |
| 3 Build the gap | One static HTML page (prototypes here), a Vite input beside `resume/index.html`, its words from the résumé's generated data | Pages            | None                           | We maintain it (about 150 lines). No framework, no JS needed                                                                                                            |

**Verdict: rung 3, only the gap, with the template's shape as the spec.** We take the
standard sections exactly as the templates and guides lay them out. We don't take the
toolchain, because the one thing that is ours is the content source: the résumé is data in
this repo, and a template would make a second hand-kept copy. The page is that data rendered
once more, beside the résumé shell that already does this. Add the GitHub profile README
(rung 1) as a cheap second door with the same links. The call is drafted below; when the PR
lands, record it as `docs/calls/C1055.json`.

Pages' assets, the résumé PDFs included, are bundled at build time (round 2, the owner's
correction), so the landing links them by path inside the artifact.

## 4. Prototypes

All three use the same real content: the `fullstack` and `backend` résumé versions, the
CABA Design role and education from `src/data/personal.typ`, the comb's Suspender Ledger
line. Static HTML, no JS, system fonts.

- **A · one page** (`a-one-page/`): a single centred column that reads like the résumé. Name, role and
  contact sit above the fold, then four projects, experience, education and skills.
- **B · sidebar** (`b-sidebar/`): a sticky left column (name, role, nav, résumé, contact) beside
  project cards. This is the common two-column developer portfolio. On a phone it stacks.
- **C · projects first** (`c-projects-first/`): a header band with the résumé and contact, then
  three project cards with a picture each (today's demo screens), then experience and skills.

Screens at 1440×900 and 412×915 (first screen and full page): `shots/`. Contact sheets:
`shots/contact-sheet.png` compares today, Codex and A to C (first screens), and
`shots/contact-sheet-phone-full.png` shows the three prototypes full height on a phone. None
of them overflows sideways.

Facts to confirm with the owner before shipping: "2024 to now" for independent work is taken
from the repo's first commit (2024-06-22); the résumé gives no dates for it. Whether to list
WIS and Natera ("Also" line) is the owner's call: the published résumé versions differ on it.

## 5. The prune list

| Route / asset                                                                            | Verdict                                                                               | Reason                                                                                                                    | Saves (Pages)                                                                                         |
| ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `/` (comb as front door)                                                                 | **Replace** with the static landing                                                   | No name, role or contact                                                                                                  | First visit goes from 97 files, ~400 KB gzip, to one HTML file of ~10 KB, with no JS                  |
| `/resume` + `resume/index.html`                                                          | **Keep the address**; point it at the landing's résumé section, or keep the HTML view | `check-resume-deploy` and the canonical URL stay valid                                                                    | —                                                                                                     |
| Résumé PDFs                                                                              | **Keep 7** (one per version + `resume.pdf`), drop 30 layout variants from Pages       | A recruiter needs one PDF; layouts are the owner's tool (`/resume-build`, lan)                                            | 1.21 MB. Mechanism exists: `OFF_PATH_PUBLIC_FILES.pages` in `build.paths.ts` (mobile already uses it) |
| `/extensions`                                                                            | **Keep**                                                                              | "The curious" way in, linked from the extensions card                                                                     | —                                                                                                     |
| `/app`, `/sessions/*`, `/practice/settings`, `/profile`, `/settings/*`, `/auth`          | **Keep**                                                                              | The learning apps' "try it"                                                                                               | —                                                                                                     |
| `/authorship`                                                                            | **Keep**                                                                              | Every published video's end card prints `paulgsc.github.io/some-ui/authorship` (`burn-ins/src/lib/authorship-link.ts`)    | —                                                                                                     |
| `/assurance`                                                                             | **Drop from Pages**                                                                   | A ledger 22,000 px tall, in this repo's own terms; the owner reads it on home                                             | 392 KB                                                                                                |
| `/mission`                                                                               | **Drop from Pages** (or one footer link)                                              | Addressed to a viewer of the toolkit, not to a hiring reader                                                              | 12 KB                                                                                                 |
| `/rust-rounds-sample`                                                                    | **Drop**                                                                              | A second sample of the learning apps; `/app` is enough                                                                    | 121 KB                                                                                                |
| `/job-run`                                                                               | **Drop**                                                                              | Shows the Jobs wing's reading of postings: a job seeker's tool is the wrong thing to show a recruiter                     | 16 KB                                                                                                 |
| `/call`, `/essay`, `/report`, `/rust-screen`, `/playoff-delta`, `/burn-ins`, `/captions` | **Drop from Pages**                                                                   | These are the video recorder's stages. The renderer builds its own (`build:stage`), so the copies on Pages have no reader | ≈ 320 KB (essay 89, stage 82, burn-ins 81, call 21, report 23, others)                                |

Gating dropped routes off `pages` should use an existing door: a `web`-audience route gate, or
a new `pages`-excluded gate in `build.profiles.ts`. Deleting a route file would break `lan`,
which still routes to every one of them. `Root` keeps `Landing` for `lan`. On Pages, `/` is
served by the static file, so `Root`'s comb branch and `ExtensionsPage`'s `chrome="front"`
become dead and are removed in the same PR.

## Call draft (C1055, recorded when the PR lands)

- **chose:** Pages' front door is one static page in the standard portfolio shape, generated from
  the résumé's data, beside `resume/index.html`. Rung 3, the gap only. Plus a GitHub profile
  README (rung 1).
- **options:** a GitHub README or a hosted résumé alone; an Astro, Jekyll or Hugo template folded
  into `pages.yml`; a static page in the existing Vite build; Codex's showcase (#3034).
- **why gray:** the owner has no opinion on the design ("just do what's recommended").
- **undo:** remove the Vite input; `/` falls back to the SPA's `Root`.
- **by:** claude.

## Round 2: the owner's answers (2026-11-22, via the coordinator)

The owner's answers, as the coordinator paraphrased them:

1. List WIS and Natera.
2. No preference between A, B and C; my call.
3. Add a photo slot ("it's important people see you"). The mochi stands in until a photo exists.
4. Show, don't describe. Each project gets a short motion clip in the walkthrough and promo
   style. The three projects are the extensions, the APK, and the server as seen through
   home's Grafana.

**Prototype D** (`d-show/index.html`, one self-contained file with relative images and no
scripts). Screens:

- `shots/contact-sheet-round2.png`: desktop, phone, and phone full page;
- `shots/d-show-motion.png`: the clips at three moments, and the server clip zoomed to each
  panel;
- `shots/d-show-{desktop,phone}[-full].png`.

**Why C's shape.** C is the only one of the three whose layout already has a media frame per
project, so a clip replaces a picture and nothing moves. Its header band has room for a
photo beside the name. B's sidebar could hold the photo, but its narrow cards make a clip
small. A has no place for media.

**What D is.**

- The header: photo, name, role, résumé, email and GitHub.
- Three cards (extensions, the Android app, the server), each opening on its clip.
- Experience, now listing WIS (2024 to now) and Natera (2019 to 2020) beside CABA Design.
- Skills and education.

Both kinds of slot are named in the markup and take one asset key:

- `<figure data-slot="photo" data-asset="photo/portrait.webp">` holds the mochi, drawn from
  `castNodes("mochi")` (`packages/some-styles/src/brand/cast.ts`), until the photo exists.
- `<figure data-slot="clip" data-asset="clips/<project>.mp4">`, one per card.

Until the clips are rendered, CSS plays placeholder frames in each slot:

- **Extensions:** Suspender Ledger's real walk. I ran `motion walk suspender-ledger` here on
  paulgsc/testing's `promo/suspender-ledger/0.3.1/sample.json`, and the tap rings sit
  where and when `walk.json` puts them.
- **The Android app:** APK screens from paulgsc/testing's clips and video-render's
  phone-card snip.
- **The server:** a mock-up of the four panels, labelled as one. It is drawn in CSS and is
  not a capture.

Reduced motion shows the first frame.

### Grafana: the panels, and what is in them

An outsider asks: is it OK, what runs, where work flows, and how much. The four panels that
answer that, from paulgsc/server `infra/grafana/dashboards` at `3d3739d`:

1. **HEALTH verdicts**, the file_host dashboard's top row (`lib/health-panels.libsonnet`):
   DEPS, ERRORS, REFUSALS, LOOPS, SIGNAL. Verdict tiles that are never "green by default"
   (`docs/dashboard-honesty.md`).
2. **SERVICES: up, and when they weren't** (`lib/overview-panels.libsonnet`): each service's
   uptime as a state timeline.
3. **PIPELINES**, one process as a node graph (`pipelines.jsonnet`,
   `lib/pipeline-panels.libsonnet`). Each node is a stage, coloured by the alerts firing on
   it. The weekly call is a good one to show.
4. **Request Rate by Outcome** (`lib/health-panels.libsonnet`): traffic, with refused work
   kept apart from successes.
   - Optional fifth: **HTTP Latency by Route (P95)**.

**Personal data.** None should be in these panels, since they are aggregates. What could
leak, and how the capture prevents it:

- **Legends with an `instance` (a LAN IP and port, or a hostname):** hide the legend or
  relabel it.
- **Grafana's own chrome (user avatar, org name, URL):** `?kiosk`, with a viewer service
  account.
- **The time axis, which shows when the owner uses home:** a fixed, dated window, read as
  "a week of home".
- **A node's `detail__*` fields:** these show only on click, so a still capture never
  includes them.

HTTP route labels are path templates with bounded cardinality, so they carry no ids. As a
guard, the capture can refuse a region whose text matches an IP or a hostname.

**How the capture is made.** It runs on home, since Grafana is home-only. The render
service's Playwright headless shell opens the dashboard in kiosk mode over the fixed
window. It measures each chosen panel's box and writes a `some-ui.screens/1` record: the
picture, plus regions named by panel title. That record is exactly what `screen-zoom`
(RR31) takes. `zoomPicture` then turns it and the four region names into the composition,
in the card series below.

### The build, as members of families that already exist

None of this is a new pipeline:

1. **Web clips: a new `series` case for the walks' cut lists (WALK, #3282; HYPER).**
   - Walks already exist: Suspender Ledger walks on the `sandbox` stage, and Jobs walks on
     the `apk` stage inside Snips Capture's emulator. `walkthrough` and `promo` make cut
     lists of `promo-feature` scenes.
   - The web card needs a different frame. Today the only series is `series/vertical`
     (1080×1920 with sound). The card needs, say, `series/card`: 1200×900, no sound, a short
     loop. The cut list is `promo-feature` scenes only, with no hook or close.
   - `motion video` already writes `video.mp4`.
   - The other four extensions have no walk yet. Their clips wait on walks of their own,
     which are new cases of `Walk`, not new stages.
2. **The Grafana clip: a new capture source for `screen-zoom`'s `some-ui.screens/1`.** It is
   the capture above, run on home. `screen-zoom` and `zoomPicture` stay as they are. In
   `series/card`, the clip is the four panels, zoomed in turn.
3. **The photo slot: the brand cast's drawing as its default.** `cast.ts` already says "a
   page draws it with React and a composition can draw the same tree as a file". The
   landing draws it as a file until `photo/portrait.webp` exists.
4. **Assets bundled at build time** (the owner, 2026-11-22): "this is a Pages static web app,
   so we can bundle whatever static assets at build time." The photo, the three clips and the
   résumé PDFs are generated or fetched into the Pages artifact when `pages.yml` builds it, and
   are never committed to the repo. Pages needs no R2. (This replaces the earlier "served from
   R2" story; ASSETS6 is no longer part of the Pages story.) The clips are MP4: `motion video`
   already writes it, and Chrome on Android and desktop plays it with no second format.

### Correction to the round-1 prune list

**Snips Capture photographs the Pages build itself.** Its `web` surface walks every route the
Pages build offers (`docs/snips.md`; `apps/www/tests/snips/web.spec.ts`), and the essays name
snips by route. For example, video-render's phone-card sample uses
`web/phone/rust-rounds-sample-*.png`, and `/captions` and `/` are named too. So gating a route
off the Pages build also takes it out of what snips can photograph.

Before the prune lands, one of these has to happen:

- point Snips' web walk at a build that keeps every viewer route (a separate profile for the
  viewer's full set, beside a trimmed public one); or
- keep the routes on Pages but unlink and `noindex` them.

`/rust-rounds-sample` moves from "drop" to "keep until then". The size savings in the table
above hold only once Snips has its own build.

### Still to confirm with the owner

- "2024 to now" for independent work: it comes from the repo's first commit (2024-06-22),
  and the résumé gives no date. It is unanswered, so D keeps it.
- Whether the PIPELINES panel should show the weekly call or another process.
- The public AMO listing link for Suspender Ledger, if it has one. The repo names none.

## Round 2b: what I'm stuck on (Page Filter)

This is the owner's inclination, given as "not a directive": show the thing that is hard
beside the thing that ships, briefly and mostly visually.

**Recon.** Page Filter (`extensions/some-filter`) is meant to turn any bright site the same soft
dark, without ever leaving text unreadable and without a white flash while the page loads. What
blocks it is that a page is never finished or fully visible:

- it keeps changing after load;
- it draws parts inside components and frames the extension can't reliably see into.

So the filter can never be sure it caught everything. Its own canon proves that no algorithm
can certify a page has settled (`docs/canon/dom-state-estimation-canon.typ`).
`docs/legibility-paint-grammar.md` shows each gap arriving as a new counterexample (six review
rounds for one audit). Its last feature commit was 2026-09-23. Since then, about fifteen issues
are open:

- the budgeted rounds, SF-BUD1–6;
- the flash oracle and the e2e specs not yet running in CI: SF-CUT4/5, #1354;
- an "off" tab themed again: #3164;
- AMO review fixes waiting on a branch: #1787.

**The visual.** I loaded the extension's built `dist/` in Chromium, with and without it, on
public pages. The before/after is MDN's CSS `filter` page. With the filter, the page goes dark,
but the live example stays bright white. It is drawn inside the page's own `interactive-example`
component (a shadow root), which is the paint grammar's PG-SCOPE gap. It is a real capture, not
a mock-up.

- The fixture that the #741 failure used to show (dark text on a darkened card) is now
  repaired, so it no longer shows a failure.
- Limit: the screen shows MDN's page and the Firefox logo. For the published page, the
  same failure should be recaptured on a page we own: a fixture with a shadow-root widget.

**Two placements**, each a copy of D. Both are under `d-show/` and share `img/`:

- **Placement 1** (`d-show/stuck-inline.html`): inside the extensions card, as two halves.
  "Released: Suspender Ledger" (its walk) sits beside "Stuck on: Page Filter" (the before/after,
  with one line). The card spans the page, and the Android app and the server sit below it.
- **Placement 2** (`d-show/stuck-strip.html`): the three cards as in D, with "Released" on the
  extensions card. A strip under them holds the before/after, "Stuck on · Page Filter" and the
  same line.

Both link "What I'm working through" to #3387, the first open-question essay, until it is
rendered.

The line, the same in both: "Page Filter, the one I use most, turns bright sites dark. Parts a
page draws inside its own components or frames, like this live example, stay white: the filter
can't reliably see in, and pages keep changing after they load."

Screens: `shots/contact-sheet-stuck.png` (both, desktop and phone, full page) and
`shots/d-stuck-{inline,strip}-{desktop,phone}[-full].png`.

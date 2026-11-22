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

Later (epic #3399, ASSETS6): Pages' assets, the résumé PDFs included, come from an R2 bucket.
The landing should link PDFs by one resolver, so moving them is a one-line change.

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

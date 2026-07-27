# www

## 0.1.1

### Patch Changes

- www's build graph changed - the app itself or one of its workspace
  dependencies was touched since the last Docker publish. Most
  dependency bumps don't change www's actual behaviour, so this
  needs a human read of the diff: merge (squash) this PR to build
  and push an updated `paulgsc/www` image to Docker Hub, or close it
  if the change doesn't warrant a new image.

## 0.1.0

### Minor Changes

- [#796](https://github.com/paulgsc/some-ui/pull/796) [`abcd84f`](https://github.com/paulgsc/some-ui/commit/abcd84f4cbb0b5c302400e08b40a06276daabfe7) Thanks [@paulgsc](https://github.com/paulgsc)! - Rewrite the résumé to communicate what the work actually is, and give
  `apps/www` a mission page motivating the repo's high-level goals.

  **`@some-ui/resume` — STAR grammar, project-first.**

  The previous revision stated deliverables only, on the theory that a résumé
  is a pure evidence index. Read against the user stories behind these
  projects, that turned out to be an over-correction: stripped to deliverables,
  the work read like ordinary feature output, and nothing distinguished it from
  a ticket someone was handed. These projects are positions — a browser is an
  operating system and tabs are its processes; exposure should be opt-in;
  visual comfort is measurable; a curriculum should adapt to the learner — and
  omitting the position deletes the reason the artifact exists.

  `resume.typ` now leads each project with the premise it answers and then
  cashes that premise out in the mechanism implementing it, under an explicit
  rule: **a premise earns its place only if the next line names the mechanism.**
  "Suspension is virtualization, not cleanup" is followed by the native-discard
  behaviour and the absent `tabs.remove()`; "nothing earns attention by default"
  is followed by the `masked → meta → title → revealed` machine and the
  overloads that make an illegal transition a compile error.

  Also:

  - **Dropped the "Technical Skills" enumeration.** A comma-separated tool list
    communicates nothing verifiable. Every tool in it still appears in the
    résumé, attached to the thing it was used to build.
  - **Dropped the "Set in Typst from `packages/ui/resume/resume.typ`…"**
    colophon — a note about the document's own build pipeline on a page whose
    job is to be about the candidate. The pipeline stays documented in
    `README.md`.
  - **Corrected the workspace counts** (61 → 58 packages, "15+" → 12
    extensions); both are now derived rather than remembered, with the
    derivation recorded in `resume.meta.typ`.
  - `resume.meta.typ` gains a per-project provenance map (claim → the crate,
    package, or workflow backing it) and records the format reversal.

  **`www` — a `/mission` route.**

  `/` answers _what_ is deployed here and sends you to it; nothing answered why
  any of it exists. `/mission` is a visual statement page — not a journal or a
  blog, no dates and no posts — presenting each project as one refusal, one
  claim, and one mechanism, followed by the principles they share and the scale
  they ship at. Linked from `/` as a secondary text link so it doesn't compete
  with the three destination cards.

- [#781](https://github.com/paulgsc/some-ui/pull/781) [`c74c9af`](https://github.com/paulgsc/some-ui/commit/c74c9affdf692cbd295077249201af9f2fb29d3b) Thanks [@paulgsc](https://github.com/paulgsc)! - Ship the Typst résumé MVP and clear out unrelated dead weight around it.

  - `@some-ui/resume` is now a Typst workspace: `resume.typ` compiles to
    `dist/resume.pdf` via a self-fetching `typst` pipeline (no system
    dependency required). The package's previous, unreferenced React content
    (`video-resume`, `graveyard`) is removed.
  - The one component that _was_ live in the old `@some-ui/resume`
    (`TechnicalBlockAssessment`, wired into the content registry's
    `"assessment"` scene) moves to a new `@some-ui/assessment` package so it
    keeps working with zero behavior change.
  - `apps/www` gains a `/resume` route (sidebar-navigable) that previews the
    compiled PDF inline and offers a download, synced from
    `@some-ui/resume`'s build output as part of `www`'s own build/dev.
  - Removed the defunct `/overlays/youtube` demo route and the orphaned
    `@some-ui/overlays` package (all YouTube-chrome components with zero
    consumers) - both fully superseded by the real session player
    (`SessionViewport`, under `/sessions/$sessionId`).

### Patch Changes

- Updated dependencies [[`c74c9af`](https://github.com/paulgsc/some-ui/commit/c74c9affdf692cbd295077249201af9f2fb29d3b)]:
  - @some-ui/content-registry@1.0.2
  - @some-ui/honeycomb@0.1.1
  - wireframes@0.0.11

## 0.0.5

### Patch Changes

- www's build graph changed - the app itself or one of its workspace
  dependencies was touched since the last Docker publish. Most
  dependency bumps don't change www's actual behaviour, so this
  needs a human read of the diff: merge (squash) this PR to build
  and push an updated `paulgsc/www` image to Docker Hub, or close it
  if the change doesn't warrant a new image.

## 0.0.4

### Patch Changes

- www's build graph changed - the app itself or one of its workspace
  dependencies was touched since the last Docker publish. Most
  dependency bumps don't change www's actual behaviour, so this
  needs a human read of the diff: merge (squash) this PR to build
  and push an updated `paulgsc/www` image to Docker Hub, or close it
  if the change doesn't warrant a new image.

## 0.0.3

### Patch Changes

- www's build graph changed - the app itself or one of its workspace
  dependencies was touched since the last Docker publish. Most
  dependency bumps don't change www's actual behaviour, so this
  needs a human read of the diff: merge (squash) this PR to build
  and push an updated `paulgsc/www` image to Docker Hub, or close it
  if the change doesn't warrant a new image.

## 0.0.2

### Patch Changes

- Updated dependencies []:
  - @some-ui/content-registry@1.0.1
  - wireframes@0.0.10
  - @some-ui/leetype@0.0.1
  - some-ui-utils@1.1.5
  - some-ui-shared@0.0.10
  - @some-ui/slideshow@0.0.10
  - @some-ui/interview@0.0.1

## 0.0.1

### Patch Changes

- www's build graph changed - the app itself or one of its workspace
  dependencies was touched since the last Docker publish. Most
  dependency bumps don't change www's actual behaviour, so this
  needs a human read of the diff: merge (squash) this PR to build
  and push an updated `paulgsc/www` image to Docker Hub, or close it
  if the change doesn't warrant a new image.

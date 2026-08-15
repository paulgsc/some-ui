# @some-ui/content-registry

## 1.0.7

### Patch Changes

- Updated dependencies []:
  - @some-ui/leetype@0.0.2

## 1.0.6

### Patch Changes

- Updated dependencies []:
  - @some-ui/leetype@0.0.2

## 1.0.5

### Patch Changes

- Updated dependencies []:
  - @some-ui/leetype@0.0.2

## 1.0.4

### Patch Changes

- Updated dependencies []:
  - @some-ui/leetype@0.0.2

## 1.0.3

### Patch Changes

- Updated dependencies []:
  - @some-ui/leetype@0.0.1

## 1.0.2

### Patch Changes

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

- Updated dependencies [[`c74c9af`](https://github.com/paulgsc/some-ui/commit/c74c9affdf692cbd295077249201af9f2fb29d3b)]:
  - @some-ui/assessment@0.1.0
  - @some-ui/honeycomb@0.1.1
  - wireframes@0.0.11

## 1.0.1

### Patch Changes

- Updated dependencies [[`513f8f6`](https://github.com/paulgsc/some-ui/commit/513f8f661f6aaed97ce07a004945672d54c096ee), [`bb7144a`](https://github.com/paulgsc/some-ui/commit/bb7144a60c19b6ca492e8779bf4d4901d8ee6703)]:
  - @some-ui/honeycomb@0.1.0
  - wireframes@0.0.10
  - @some-ui/leetype@0.0.1
  - some-ui-utils@1.1.5
  - @some-ui/chat@0.0.9
  - @some-ui/makjang@0.0.10
  - some-ui-neon-sign@0.0.10
  - some-ui-nfl@0.0.10
  - @some-ui/portfolio@0.0.10
  - @some-ui/resume@0.0.5
  - @some-ui/slideshow@0.0.10
  - @some-ui/stepper@0.0.10
  - @some-ui/topik@0.0.1
  - @some-ui/umag@0.0.10
  - @some-ui/interview@0.0.1

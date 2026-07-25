# www

## 0.1.0

### Minor Changes

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
  - wireframes@0.0.11

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

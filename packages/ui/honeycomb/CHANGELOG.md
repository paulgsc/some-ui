# some-ui-honeycomb

## 0.1.0

### Minor Changes

- [#771](https://github.com/paulgsc/some-ui/pull/771) [`513f8f6`](https://github.com/paulgsc/some-ui/commit/513f8f661f6aaed97ce07a004945672d54c096ee) Thanks [@paulgsc](https://github.com/paulgsc)! - Add multimodal word testing to the Hangul honeycomb game (epic #420): two new modes, `"vocabulary"` and `"vocabulary-endless"`, spawn multi-jamo word challenges cued by an icon (and, on struggle, TTS + romanization) instead of only a single jamo. Existing `"completion"`/`"endless"` single-jamo play is unaffected.

  - A word challenge reserves multiple hex cells at once, each a masked placeholder until its jamo is typed in order, sharing one countdown.
  - Backspace now corrects the in-progress key before it locks in.
  - A masked-word feedback overlay tracks progress through the current word, with a "Celebrate" reveal on completion.
  - A new corner-anchored Prompt/Concept Station overlay shows the active word's icon, escalating to TTS playback and a romanization caption the longer a player struggles.
  - A 20-word seed vocabulary (`@honeycomb/data`) ships with the package - open-syllable words only, icon + TTS stimuli, no bundled images.

### Patch Changes

- [#761](https://github.com/paulgsc/some-ui/pull/761) [`bb7144a`](https://github.com/paulgsc/some-ui/commit/bb7144a60c19b6ca492e8779bf4d4901d8ee6703) Thanks [@paulgsc](https://github.com/paulgsc)! - Fix `HexGrid` clipping in small or "hostile" viewports (#760). The SVG viewBox was previously set to the live container pixel size while hex geometry was generated at a fixed hex size, so any viewport smaller than the grid's natural extent silently clipped it.

  `HexGrid` now derives its viewBox from the grid's own exact geometric bounding box and lets the browser scale that box to fit the container (SVG `preserveAspectRatio`), so it never clips and resizes losslessly. A pure `fitHexGrid` negotiation engine (`utils/hex-grid-fit`) additionally enforces a legibility floor: below a minimum hex size it either reports `"impossible"` (default `shrink-only` strategy — safe for consumers like the Hangul game whose cell ids are meaningful beyond rendering) or, opt-in via `fitStrategy="shrink-then-reduce"`, negotiates down to a smaller canonical radius.

  Also fixes the Hangul honeycomb score card (`StatsPanel`) and the game-over "final score" modal, which were being silently clipped by their `overflow-hidden` ancestor on short/narrow viewports — both now cap their own size and scroll internally instead.

- Updated dependencies []:
  - @some-ui/hangul-game-core@0.0.5
  - @some-ui/some-hexagon@0.0.5
  - some-ui-utils@1.1.5
  - some-ui-shared@0.0.10

## 0.0.9

### Patch Changes

- Updated dependencies []:
  - @some-ui/hangul-game-core@0.0.4
  - @some-ui/some-hexagon@0.0.4
  - some-ui-utils@1.1.4
  - some-ui-shared@0.0.9

## 0.0.8

### Patch Changes

- Updated dependencies []:
  - @some-ui/hangul-game-core@0.0.3
  - @some-ui/some-hexagon@0.0.3
  - some-ui-utils@1.1.3
  - some-ui-shared@0.0.8

## 0.0.7

### Patch Changes

- Updated dependencies []:
  - @some-ui/hangul-game-core@0.0.2
  - @some-ui/some-hexagon@0.0.2
  - some-ui-utils@1.1.2
  - some-ui-shared@0.0.7

## 0.0.6

### Patch Changes

- Updated dependencies [[`90a1f6a`](https://github.com/paulgsc/some-ui/commit/90a1f6adf2b8a44eaff141046d2bb73c02e7458d)]:
  - @some-ui/fetch-kit@0.1.0
  - @some-ui/hangul-game-core@0.0.1
  - @some-ui/some-hexagon@0.0.1
  - some-ui-utils@1.1.1
  - some-ui-shared@0.0.6

## 0.0.5

### Patch Changes

- Updated dependencies [[`8735c83`](https://github.com/paulgsc/some-ui/commit/8735c839e4cea6d11d1047343c89e74408908f79)]:
  - some-ui-utils@1.1.0

## 0.0.4

### Patch Changes

- Updated dependencies []:
  - some-ui-utils@1.0.2

## 0.0.3

### Patch Changes

- Updated dependencies []:
  - some-ui-utils@1.0.1

## 0.0.2

### Patch Changes

- Updated dependencies [[`d79b146`](https://github.com/paulgsc/some-ui/commit/d79b146524a14d0977567b116e0ea716b17b6545)]:
  - some-ui-utils@1.0.0

## 0.0.1

### Patch Changes

- Updated dependencies []:
  - some-ui-utils@0.0.1

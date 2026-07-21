---
"@some-ui/honeycomb": patch
---

Fix `HexGrid` clipping in small or "hostile" viewports (#760). The SVG viewBox was previously set to the live container pixel size while hex geometry was generated at a fixed hex size, so any viewport smaller than the grid's natural extent silently clipped it.

`HexGrid` now derives its viewBox from the grid's own exact geometric bounding box and lets the browser scale that box to fit the container (SVG `preserveAspectRatio`), so it never clips and resizes losslessly. A pure `fitHexGrid` negotiation engine (`utils/hex-grid-fit`) additionally enforces a legibility floor: below a minimum hex size it either reports `"impossible"` (default `shrink-only` strategy — safe for consumers like the Hangul game whose cell ids are meaningful beyond rendering) or, opt-in via `fitStrategy="shrink-then-reduce"`, negotiates down to a smaller canonical radius.

Also fixes the Hangul honeycomb score card (`StatsPanel`) and the game-over "final score" modal, which were being silently clipped by their `overflow-hidden` ancestor on short/narrow viewports — both now cap their own size and scroll internally instead.

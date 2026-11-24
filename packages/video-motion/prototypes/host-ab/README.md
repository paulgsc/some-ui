# HOST-AB: Tin Bird as an essay host (prototype, never for main)

Ideation sketch from 2026-11-24 (owner's story: a lifelike host for the video essays).
Write-up, videos and live template sheet: https://claude.ai/artifact/AvUYK12xc17SSJuyiBU9YL (private to the owner).

- `gen.ts`: bakes cast.ts's `tin-owlet` nodes into a rig with named moving parts (adds lids, lower beak, two tin wings, a turning key bow, effect glyphs). Run from `packages/video-motion` with tsx: `npx tsx <copy of gen.ts> rig.svg`.
- `rig.js`: the pure rig: state = f(t, beats, seed). Six poses × six expressions, seeded blinks and glances.
- `index.tmpl.html` + `build.sh`: a HyperFrames composition (`host-v0`), `medium` svg (A) or sprite (B).
- `sheet.cjs`: bakes B's 1,440-cell sprite sheet (19.6 MB, deterministic; not kept here).
- `essay.py` + `series/landscape`: the sample essay's cut list; render with `pnpm motion video <folder> --series <series/landscape> [--prove]`.
- `host.ts.txt`: the proposed `host` burn-in kind (closed unions) for next week.
- `page.*`: the artifact page.

Paths inside the scripts point at the original session's scratchpad; adjust before rerunning.

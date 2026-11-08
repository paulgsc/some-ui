/**
 * Records and renders one week of Playoff Delta, said by home's Kokoro
 * speaker (FEED3 #2646): a still of each scene of the fill's format version,
 * its shape included (`lib/voiced` in `@some-ui/playoff-delta`), said in
 * `PD_VOICE`, and the renderer laying them together (`./voiced`). The
 * recording itself is `./playoff-delta-recording`'s, which a template's
 * preview (`./preview`) shares.
 *
 *   pnpm --filter www build
 *   pnpm --filter www record:playoff-delta --week 8 --narration SF-week-08.json [--voices kokoro|none] [--speaker http://127.0.0.1:8880] [--out out/playoff-delta]
 *   pnpm --filter www record:playoff-delta --app http://call-stage --season-file SF.json --week 8 --narration SF-week-08.json --voices kokoro [--brand /brand]
 *
 * `--narration` is the week's fill (`paulgsc/testing`'s
 * `playoff-delta/<season>/narration/`): it is checked against the season the
 * stage plays before anything is said, and drawn in the version it names,
 * which must be voiced (2 on). `--week 0` is the
 * legend. `--voices none` leaves it silent, each scene held for its words'
 * reading time.
 *
 * `--season-file` records from a season file, as home keeps it: the stage's
 * read of `paulgsc/testing`'s season is answered from that file alone, so
 * home's render worker needs no network. Otherwise the build must be one that
 * reads content, as the home network's does.
 *
 * It refuses a scene the frame can't hold, and takes each still with every
 * animation at rest, so the same week gives the same bytes. It serves the built app (never `vite dev`)
 * from `--dist`, relative to apps/www, or records the one served at `--app`.
 * Needs `ffmpeg` and `ffprobe` on `PATH`. Policy flags as `record:call`'s.
 */

import { parseArgs } from "node:util"

import { runCommand } from "./command"
import { PD_OPTIONS, recordPlayoffDelta } from "./playoff-delta-recording"

const { values } = parseArgs({
  options: {
    out: { type: "string", default: "out/playoff-delta" },
    ...PD_OPTIONS,
  },
})

await runCommand(() => recordPlayoffDelta(values))

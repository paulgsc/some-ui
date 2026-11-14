/**
 * Records and renders one weekly call (STUDIO ST29): a still of each scene
 * from the built app's `/call?record`, each scene's words said in its
 * section's voice, and the renderer (`@some-ui/video-render`) laying them
 * together.
 *
 *   pnpm --filter www build
 *   pnpm --filter www record:call [--week 2026-10-30] [--voices kokoro|none] [--speaker http://127.0.0.1:8880] [--out out/call]
 *   pnpm --filter www record:call --app http://call-stage --week-file week.json [--part 2] [--voices kokoro] [--brand /brand] [--out out/call]
 *
 * `--week` names the week by its first day (the newest `paulgsc/testing`
 * keeps by default, `sample` for the template's); the build must be one that
 * reads content, as the home network's does. `--voices kokoro` says each
 * scene in its section's voice (`CALL_VOICES`) through home's Kokoro speaker
 * at `--speaker` (paulgsc/server `infra/compose/kokoro.yml`), which gives the
 * same audio for the same words (ST36, #2635); `none` leaves the call
 * silent, each scene held for its words' reading time, which the frame shows
 * anyway.
 *
 * A week too long for one video is a series of parts (template version 5,
 * #2918; `render call-parts <file>` says how many): `--part <k>` records
 * part k into `<out>/<week>/part-<k>/call.mp4`, and a series refuses to
 * record without it. A week of one part records into `<out>/<week>/`.
 *
 * `--week-file` records a week from a file, as home keeps it (ST36): the
 * stage's reads of `paulgsc/testing`'s `call/` are answered from that file
 * alone, so a week the repository has let go still records the same.
 *
 * It refuses a scene the frame can't hold (`data-overflow`), since the
 * video would cut it off. It serves the built app (never `vite dev`: the dev
 * tools would be in the frame), from `--dist`, relative to apps/www, or
 * records the one already served at `--app` (home's render worker records
 * the published image, #2639). Needs `ffmpeg` and `ffprobe` on `PATH`.
 *
 * With a shape that has captions (version 2 on), it asks the speaker for
 * each take's words too (`/timed`) and keeps them beside it, and records
 * each scene's captions in the series' look from the app's burn-ins page
 * (`./burn-ins`), which `--app` serves too. A series that
 * names a music bed takes its file from `--brand`, home's folder of the
 * owner's files, never a repository.
 *
 * Policy (`RenderPolicy`, #2635): `--max-video-minutes` and `--max-video-mb`
 * cap the video, which is refused past either, by its words before anything
 * is said and exactly before anything is drawn; `--cache-mb` caps what one
 * week keeps in `<out>/<week>/cache/steps`, its takes and every ffmpeg step,
 * so a retry runs only what changed. A step past that budget runs uncached,
 * with a `cache warning:` line on stderr, which home's render worker reports.
 */

import { parseArgs } from "node:util"

import { CALL_OPTIONS, recordCall } from "./call-recording"
import { runCommand } from "./command"

const { values } = parseArgs({
  options: {
    week: { type: "string" },
    out: { type: "string", default: "out/call" },
    "week-file": { type: "string" },
    part: { type: "string" },
    ...CALL_OPTIONS,
  },
})

await runCommand(() => recordCall(values))

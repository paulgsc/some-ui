/**
 * Records and renders one weekly engagement report (ENG12 step 3, #2700): the
 * report written by code from home's own records (`reportWeek`, with no
 * writer and no model), a still of each scene from the built app's
 * `/report?record`, each scene's words said in the report's one voice
 * (`REPORT_VOICE`), and the renderer (`@some-ui/video-render`) laying them
 * together.
 *
 *   pnpm --filter www build
 *   pnpm --filter www record:report --report-file 2026-W46.json [--voices kokoro|none] [--speaker http://127.0.0.1:8880] [--out out/report]
 *   pnpm --filter www record:report --dist /opt/stage --report-file <file> --voices kokoro --brand /brand --out <dir>
 *
 * `--report-file` is home's answer to `GET /app-events/weeks/:week`
 * (paulgsc/server#819), as home keeps it (`report-weeks/<YYYY-Www>.json`):
 * four weeks of raw per-affordance counts. The recorder turns it into the
 * week's report (`reportWeeksOf`, then `reportWeek` with
 * `@some-ui/engagement`'s `PIPELINES`), which applies the public-safety rule
 * and writes every word, and answers the stage's read of the report
 * (`/engagement-reports/<week>.json`) with it alone. It refuses, before
 * anything is drawn, an answer that isn't home's weeks, a week still under
 * way, and edges other than the owner's Pacific week.
 *
 * It writes `<out>/<week>/report.mp4`, with `cut-list.json`, `report.json`
 * (the report as drawn) and `description.txt` (its chapters) beside it, and
 * keeps its stills, takes and step cache in `<out>/<week>`. The same file
 * gives the same report, the same words and the same video. The rest is
 * `record:call`'s (`./call` says how): the stage served from `--dist` or
 * `--app`, home's Kokoro speaker at `--speaker`, the music bed from
 * `--brand`, and the policy flags.
 */

import { parseArgs } from "node:util"

import { CALL_OPTIONS } from "./call-recording"
import { runCommand } from "./command"
import { recordReport } from "./report-recording"

const { values } = parseArgs({
  options: {
    out: { type: "string", default: "out/report" },
    "report-file": { type: "string" },
    ...CALL_OPTIONS,
  },
})

await runCommand(() => recordReport(values))

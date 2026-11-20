/**
 * Records and renders one essay, a Rust Rounds essay (RR16, #2691) or an
 * interview essay (IW6, #2937), whichever the file's `schema` names
 * (`some-ui.rust-essay/1` or `some-ui.interview-essay/1`): a still of each
 * scene from the built app's `/essay?record`, the tutor's words said by
 * home's Kokoro speaker in `ESSAY_VOICES`' voice, each answer the owner's
 * own take, played whole, and the renderer (`@some-ui/video-render`) laying
 * them together.
 *
 *   pnpm --filter www build
 *   pnpm --filter www record:essay --essay-file essay.json --takes <dir> [--voices kokoro|none] [--speaker http://127.0.0.1:8880] [--out out/essay]
 *   pnpm --filter www record:essay --app http://call-stage --essay-file essay.json --takes <dir> --voices kokoro --brand /brand --out <dir>
 *   pnpm --filter www record:essay --essay-file essay.json --takes <dir> --week-file week.json
 *
 * `--essay-file` is the essay's file as home keeps it: the stage's read of
 * the essay (`/rust-essays/<week>.json`, or `/interview-essays/<week>.json`
 * on `/essay?kind=interview`) is answered from it alone. `--takes` is the folder of the owner's takes, as home hands them
 * over: one audio file `<TICKET>.<ext>` (any audio ffmpeg reads) for each
 * ticket the owner answered, the take of their last send before the
 * deadline, and `<TICKET>.<n>.<ext>` for each speak-to point n (from 1)
 * answered by a take of its own (RR24, #3248), and beside each, where home
 * kept them, its word times (`<id>.words.json`,
 * `[{ text, startMs, endMs }]`); with none, the
 * captions spread the transcript over the take. An interview essay's folder
 * holds the same for each answered question, `<question>.<ext>`, and each
 * answered read, `read.<card>.<ext>` (`interviewEssayTakeFiles`). A take
 * missing, two for one answer, or one for an answer left silent is refused
 * before anything is drawn (`essayTakeFiles`).
 *
 * `--week-file`, a Rust Rounds essay's only, is its week as home serves it
 * (`GET /rust-weeks/<id>`, with rustc's runs): each ticket's card is then
 * photographed as the phone draws it into `<out>/<week>/screens/`
 * (`./screens`, RR31, #3288), for the essay's scenes to zoom into.
 *
 * It writes `<out>/<week>/essay.mp4`, with `cut-list.json`, `essay.json` and
 * `description.txt` (its chapters) beside it. The rest is `record:call`'s
 * (`./call` says how); with `--voices none` the owner's takes still play.
 */

import { parseArgs } from "node:util"

import { CALL_OPTIONS } from "./call-recording"
import { runCommand } from "./command"
import { recordEssay } from "./essay-recording"

const { values } = parseArgs({
  options: {
    out: { type: "string", default: "out/essay" },
    "essay-file": { type: "string" },
    takes: { type: "string" },
    "week-file": { type: "string" },
    ...CALL_OPTIONS,
  },
})

await runCommand(() => recordEssay(values))

/**
 * Records and renders one Rust Rounds essay (RR16, #2691): a still of each
 * scene from the built app's `/essay?record`, the tutor's words said by
 * home's Kokoro speaker in `ESSAY_VOICES`' voice, each answer the owner's
 * own take, played whole, and the renderer (`@some-ui/video-render`) laying
 * them together.
 *
 *   pnpm --filter www build
 *   pnpm --filter www record:essay --essay-file essay.json --takes <dir> [--voices kokoro|none] [--speaker http://127.0.0.1:8880] [--out out/essay]
 *   pnpm --filter www record:essay --app http://call-stage --essay-file essay.json --takes <dir> --voices kokoro --brand /brand --out <dir>
 *
 * `--essay-file` is a `some-ui.rust-essay/1` file as home keeps it: the
 * stage's read of the essay (`/rust-essays/<week>.json`) is answered from it
 * alone. `--takes` is the folder of the owner's takes, as home hands them
 * over: one audio file `<TICKET>.<ext>` (any audio ffmpeg reads) for each
 * ticket the owner answered, the take of their last send before the
 * deadline, and beside it, where home kept them, its word times
 * (`<TICKET>.words.json`, `[{ text, startMs, endMs }]`); with none, the
 * captions spread the transcript over the take. A take missing, two for one
 * ticket, or one for a ticket left silent is refused before anything is
 * drawn (`essayTakeFiles`).
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
    ...CALL_OPTIONS,
  },
})

await runCommand(() => recordEssay(values))

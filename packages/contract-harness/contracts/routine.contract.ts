/**
 * What the reflections routine left on home (paulgsc/server `routes::routine`
 * and `handlers/routine.rs`): its word sets and dramas, and a record of each
 * of its runs, through the Jobs mailbox. `apps/www/src/lib/routine-files` calls this for `@some-ui/topik`,
 * whose `adapter/routine-files` parses each file and `adapter/routine-runs`
 * each run.
 *
 * Hand-written, like every contract here: `FilesSchema` is the server's
 * `Files` (`files` and `runs` of `HeldFile`: folder, name, the file
 * verbatim; `at`, when home answered), checked by hand against it. Each file is pinned no deeper than an object: the
 * routine writes it, and topik's intake is what holds it.
 *
 * Per person, so `session` contracts. `routine.opened_refused` is the one
 * that writes (`apps/www/src/lib/home-link/routine.ts`'s `tellOpened`, the
 * server's `Opened`: `opened`, each `scene/<name>.json` or
 * `drama/<name>.json`, at most 100, and nothing else). It sends a name
 * that is no lesson's, so home files nothing: an accepted filing would
 * become the newest `opened` file, which the routine reads to count the
 * lessons still unopened.
 */

import { z } from "zod"

import { defineContract } from "../src/contract"

const FilesSchema = z.object({
  files: z
    .array(
      z.object({
        folder: z.enum(["scene", "drama"]),
        name: z.string().min(1),
        file: z.record(z.string(), z.unknown()),
      })
    )
    .max(20),
  runs: z
    .array(
      z.object({
        folder: z.literal("run"),
        name: z.string().min(1),
        file: z.record(z.string(), z.unknown()),
      })
    )
    .max(31),
  at: z.iso.datetime({ offset: true }),
})

export const contracts = [
  defineContract({
    id: "routine.files",
    module: "routine",
    session: true,
    method: "GET",
    path: "/routine/files",
    summary:
      "this subject's newest word sets and dramas from the reflections routine, at most 20, and its newest run records, at most 31, each verbatim with its folder and name, and when home answered",
    request: {},
    expect: { status: 200, schema: FilesSchema },
  }),

  defineContract({
    id: "routine.opened_refused",
    module: "routine",
    session: true,
    method: "PUT",
    path: "/routine/opened",
    summary:
      "a name that is not one of the routine's lessons is a 422, and nothing is filed for the mailbox",
    mutates: true,
    request: { body: { opened: ["brief/digest-2026-10-26.json"] } },
    expect: { status: 422 },
  }),
]

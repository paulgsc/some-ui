/**
 * What the reflections routine left on home (paulgsc/server `routes::routine`
 * and `handlers/routine.rs`): its word sets and dramas, through the Jobs
 * mailbox. `apps/www/src/lib/routine-files` calls this for `@some-ui/topik`,
 * whose `adapter/routine-files` parses each file.
 *
 * Hand-written, like every contract here: `FilesSchema` is the server's
 * `Files` (`files` of `HeldFile`: folder, name, the file verbatim), checked
 * by hand against it. Each file is pinned no deeper than an object: the
 * routine writes it, and topik's intake is what holds it.
 *
 * Per person, so a `session` contract. Read only: nothing to keep.
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
})

export const contracts = [
  defineContract({
    id: "routine.files",
    module: "routine",
    session: true,
    method: "GET",
    path: "/routine/files",
    summary:
      "this subject's newest word sets and dramas from the reflections routine, at most 20, each verbatim with its folder and name",
    request: {},
    expect: { status: 200, schema: FilesSchema },
  }),
]

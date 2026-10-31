/**
 * The LeetType session files home holds for the phone (paulgsc/server
 * `routes/leetype_files.rs` and `handlers/leetype_files.rs`, its
 * `docs/identity.md` invariant 27): the files the routine left in the Jobs
 * mailbox's `leetype` folder, which the `mailbox` poller keeps in
 * `mailbox_item` (#2026). The phone's picker will call these through the
 * app's home link (#1916); today `apps/www/src/lib/leetype-files` holds only
 * the files picked on the device.
 *
 * Hand-written: `SessionFilesSchema` is the server's `SessionFiles` (`files`
 * of `Listed`: name, the session file's own `title` and `oneLine`, its
 * version `sha256`, and `keptAt`, when home read it), checked by hand against
 * it. `GET /leetype/session-files/:name` answers the session file itself, the
 * body `@some-ui/leetype`'s `SessionFileSchema` takes, with `sha256` as its
 * `ETag` and a `304` on `If-None-Match`.
 *
 * Both routes are per person and read only, so nothing here writes. Only the
 * `mailbox` poller writes `mailbox_item`, so the server's contract run seeds
 * it (paulgsc/server `scripts/seed_contract_run.py`, paulgsc/server#590): a held file for
 * the signed-in subject, named by `$CONTRACT_LEETYPE_FILE` with its version
 * in `$CONTRACT_LEETYPE_FILE_SHA256`, and one for another subject, named by
 * `$CONTRACT_LEETYPE_OTHER_FILE`. The contracts that fetch them are skipped
 * by name against a server nobody seeded (`readSeeds`).
 */

import { z } from "zod"

import { defineContract } from "../src/contract"
import { readSeeds } from "../src/seeds"

/** `handlers::leetype_files::FILES_LISTED`. */
const FILES_LISTED = 200

const SessionFilesSchema = z.object({
  files: z
    .array(
      z.object({
        name: z.string().min(1),
        title: z.string().min(1),
        oneLine: z.string().min(1),
        sha256: z.string().min(1),
        keptAt: z.iso.datetime({ offset: true }),
      })
    )
    .max(FILES_LISTED),
})

/**
 * The served body, as the phone reads it: a copy of `SessionFileSchema`
 * (`packages/ui/leetype/src/types/session-file.ts`) at the level the server
 * is answerable for. The server serves the session file inside the held
 * item verbatim, never the item (`{ schema, file }`), and checks only its
 * title and one line; the screens are the routine's, so each is checked for
 * a kind the phone plays and the start for naming one, and the rest of the
 * screen grammar is left to the phone's picker, which parses every file it
 * takes with the full schema. Its optional `variant` and `glossary` are left
 * out, so a seeded file without them raises no phantom-field warning, and
 * one with them reads as an unknown field rather than failing.
 */
const ServedSessionFileSchema = z
  .object({
    title: z.string().min(1),
    oneLine: z.string().min(1),
    session: z.strictObject({
      kind: z.string().min(1),
      budgetMinutes: z.number().positive(),
    }),
    start: z.string().min(1),
    screens: z.record(
      z.string().min(1),
      z.looseObject({
        type: z.enum(["info", "choice", "record", "reading", "end"]),
      })
    ),
  })
  .refine((file) => Object.hasOwn(file.screens, file.start), {
    path: ["start"],
    message: "start is not a screen",
  })

const seeded = readSeeds([
  "CONTRACT_LEETYPE_FILE",
  "CONTRACT_LEETYPE_FILE_SHA256",
  "CONTRACT_LEETYPE_OTHER_FILE",
])
const HELD_FILE = seeded.values.CONTRACT_LEETYPE_FILE ?? ""
const HELD_ETAG = `"${seeded.values.CONTRACT_LEETYPE_FILE_SHA256 ?? ""}"`
const OTHER_FILE = seeded.values.CONTRACT_LEETYPE_OTHER_FILE ?? ""

/** A name in the mailbox's own form that no routine writes. */
const ABSENT_FILE = "t999-99-contract-harness-absent.json"

export const contracts = [
  defineContract({
    id: "leetype-files.list",
    module: "leetype_files",
    session: true,
    method: "GET",
    path: "/leetype/session-files",
    summary: `this subject's session files home holds, newest first, at most ${FILES_LISTED}: each by name, its title and one line, its version and when home read it`,
    expect: { status: 200, schema: SessionFilesSchema },
  }),

  defineContract({
    id: "leetype-files.list_signed_out",
    module: "leetype_files",
    method: "GET",
    path: "/leetype/session-files",
    summary: "the list is per person: without a session it is a 401",
    expect: { status: 401 },
  }),

  defineContract({
    id: "leetype-files.file_absent",
    module: "leetype_files",
    session: true,
    method: "GET",
    path: "/leetype/session-files/:name",
    summary: "a name home holds no session file under is a 404",
    request: { path: { name: ABSENT_FILE } },
    expect: { status: 404 },
  }),

  defineContract({
    id: "leetype-files.file_absent_conditional",
    module: "leetype_files",
    session: true,
    method: "GET",
    path: "/leetype/session-files/:name",
    summary:
      "asking with a version the phone holds is still a 404 when home holds no such file, never a 304",
    request: {
      path: { name: ABSENT_FILE },
      headers: { "If-None-Match": '"contract-harness-held-version"' },
    },
    expect: { status: 404 },
  }),

  defineContract({
    id: "leetype-files.file_signed_out",
    module: "leetype_files",
    method: "GET",
    path: "/leetype/session-files/:name",
    summary: "one file is per person: without a session it is a 401",
    request: { path: { name: ABSENT_FILE } },
    expect: { status: 401 },
  }),

  defineContract({
    id: "leetype-files.list_held",
    module: "leetype_files",
    session: true,
    skip: seeded.skip,
    method: "GET",
    path: "/leetype/session-files",
    summary:
      "the list names the subject's held file with its version, and never another subject's",
    expect: {
      status: 200,
      schema: SessionFilesSchema.refine(
        ({ files }) =>
          files.some(
            (file) =>
              file.name === HELD_FILE && `"${file.sha256}"` === HELD_ETAG
          ) && !files.some((file) => file.name === OTHER_FILE),
        {
          message:
            "the held file is not listed with its version, or another subject's file is",
        }
      ),
    },
  }),

  defineContract({
    id: "leetype-files.file_held",
    module: "leetype_files",
    session: true,
    skip: seeded.skip,
    method: "GET",
    path: "/leetype/session-files/:name",
    summary:
      "a held file is the session file the phone plays, with its version as its ETag",
    request: { path: { name: HELD_FILE } },
    expect: {
      status: 200,
      schema: ServedSessionFileSchema,
      headers: { etag: HELD_ETAG },
    },
  }),

  defineContract({
    id: "leetype-files.file_held_not_modified",
    module: "leetype_files",
    session: true,
    skip: seeded.skip,
    method: "GET",
    path: "/leetype/session-files/:name",
    summary:
      "asking for a held file with the version the phone holds is a 304, with that ETag",
    request: {
      path: { name: HELD_FILE },
      headers: { "If-None-Match": HELD_ETAG },
    },
    expect: { status: 304, headers: { etag: HELD_ETAG } },
  }),

  defineContract({
    id: "leetype-files.file_other_subject",
    module: "leetype_files",
    session: true,
    skip: seeded.skip,
    method: "GET",
    path: "/leetype/session-files/:name",
    summary: "another subject's file is a 404, as if home held none",
    request: { path: { name: OTHER_FILE } },
    expect: { status: 404 },
  }),
]

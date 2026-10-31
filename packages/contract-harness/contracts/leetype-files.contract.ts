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
 * Both routes are per person and read only, so nothing here writes. What CI's
 * throwaway run cannot reach: nothing puts a file in `mailbox_item` for the
 * run's subject (only the poller writes it, from the mailbox), so there the
 * list comes back empty and no file can be fetched (paulgsc/server#590). The served file, its `ETag` and the
 * `304` are held by the server's own handler tests, as is another subject's
 * file being a `404`: the run signs in as one subject.
 */

import { z } from "zod"

import { defineContract } from "../src/contract"

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
]

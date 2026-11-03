/**
 * The subject's own reads (paulgsc/server `routes/subjects.rs` and
 * `handlers/subjects.rs`).
 *
 * Hand-written. What home keeps for good of the caller's record
 * (`GET /subjects/me/kept`, MD2b some-ui#2519): My data asks for it on its
 * overview, in the same run as what home keeps of the recordings
 * (`apps/www/src/lib/home-link/kept-read.ts`, read by `lib/my-data/record`).
 * It is a paired phone's route (`subject::Paired`), as the voice reads are:
 * no session is a `401`, a browser's cookie session a `403`, and a paired
 * contract runs only with `--phone-token`. The contract run's paired phone
 * keeps no record, so its `200` is the empty answer, which the harness probes
 * for its shape; each kind's count is held by the server's own tests
 * (`storage_repo::kept`, `handlers::subjects`).
 */

import { z } from "zod"

import { defineContract } from "../src/contract"

/**
 * The phone's read of home's count (`lib/my-data/record.ts`'s `Kept`): each
 * kind home holds any of, how many and since when. The phone leaves out a
 * kind it doesn't name.
 */
const KeptSchema = z.object({
  kinds: z.array(
    z.object({
      kind: z.string(),
      count: z.number().int(),
      since: z.string(),
    })
  ),
})

export const contracts = [
  defineContract({
    id: "subjects.kept_signed_out",
    module: "subjects",
    method: "GET",
    path: "/subjects/me/kept",
    summary:
      "what home keeps for good is a paired phone's: without a session it is a 401",
    request: {},
    expect: { status: 401 },
  }),
  defineContract({
    id: "subjects.kept_browser",
    module: "subjects",
    session: true,
    method: "GET",
    path: "/subjects/me/kept",
    summary:
      "what home keeps for good is a paired phone's: a browser's cookie session is a 403",
    request: {},
    expect: { status: 403 },
  }),
  defineContract({
    id: "subjects.kept",
    module: "subjects",
    paired: true,
    method: "GET",
    path: "/subjects/me/kept",
    summary:
      "how many of each kind of record home keeps for good for the caller, and since when",
    request: {},
    expect: { status: 200, schema: KeptSchema, unknownFields: "reject" },
  }),
]

/**
 * What home is rendering, for Studio › Renders (paulgsc/server
 * `routes/renders.rs`, `handlers/renders.rs`, `feeds/renders.rs`; SFEED13,
 * #2761). The phone reads it with `GET /renders`
 * (`apps/www/src/lib/home-link/renders.ts`) through the app's home link.
 *
 * Hand-written. The route is a paired phone's only (`Paired`): without a
 * session it is a `401`, and a browser's cookie session, which is what a
 * `session` contract carries, is a `403`. So both contracts here pin the
 * refusals, and the board's shape (`now`, `waiting`, `failed`, `done`,
 * `coming`), which only a paired phone's bearer reaches, is held by the
 * server's own handler test (`only_a_paired_phone_reads_what_home_is_rendering`)
 * and by the phone's reader (`apps/www/src/lib/renders/model.ts`).
 */

import { defineContract } from "../src/contract"

export const contracts = [
  defineContract({
    id: "renders.get_signed_out",
    module: "renders",
    method: "GET",
    path: "/renders",
    summary:
      "what home is rendering is a paired phone's: without a session it is a 401",
    expect: { status: 401 },
  }),

  defineContract({
    id: "renders.get_browser",
    module: "renders",
    session: true,
    method: "GET",
    path: "/renders",
    summary: "a browser's session is not a paired phone's: it is a 403",
    expect: { status: 403 },
  }),
]

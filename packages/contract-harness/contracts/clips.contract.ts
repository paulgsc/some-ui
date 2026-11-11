/**
 * A clip's frame, for Studio's clip pages on the phone (paulgsc/server
 * `routes/clips.rs`, `handlers/clips.rs`; the owner's decisions of
 * 2026-11-11). The phone reads each frame with
 * `GET /clips/:id/:side/:file` (`apps/www/src/lib/home-link/clips.ts`),
 * through the app's home link, naming the frame by its file name within its
 * side.
 *
 * Hand-written. The route is a paired phone's only (`Paired`): without a
 * session it is a `401`, and a browser's cookie session, which is what a
 * `session` contract carries, is a `403`. So the contracts here pin the
 * refusals. The frame itself, which only a paired phone's bearer reaches, is
 * held by the server's handler tests and by the phone's reader
 * (`apps/www/src/lib/studio-clips/frames.ts`).
 */

import { defineContract } from "../src/contract"

const FRAME = "/clips/:id/:side/:file"

const A_FRAME = {
  path: { id: "studio-release-promo", side: "after", file: "01-templates.png" },
}

export const contracts = [
  defineContract({
    id: "clips.frame_signed_out",
    module: "clips",
    method: "GET",
    path: FRAME,
    request: A_FRAME,
    summary:
      "a clip's frame is a paired phone's: without a session it is a 401",
    expect: { status: 401 },
  }),

  defineContract({
    id: "clips.frame_browser",
    module: "clips",
    session: true,
    method: "GET",
    path: FRAME,
    request: A_FRAME,
    summary: "a browser's session is not a paired phone's: it is a 403",
    expect: { status: 403 },
  }),
]

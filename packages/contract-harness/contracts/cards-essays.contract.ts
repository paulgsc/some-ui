/**
 * A cards essay's video, for its page on the phone (paulgsc/server
 * `routes/cards_essays.rs`, `handlers/cards_essays.rs`, `cards_essays.rs`;
 * CARDS7, #2979). The phone brings it over with
 * `GET /cards-essays/:key/video` (`apps/www/src/lib/home-link/cards-essays.ts`),
 * through the app's home link; which essays there are comes from the
 * Renders board (`renders.contract.ts`).
 *
 * Hand-written. The route is a paired phone's only (`Paired`): without a
 * session it is a `401`, and a browser's cookie session, which is what a
 * `session` contract carries, is a `403`. So the contracts here pin the
 * refusals; the video itself, which only a paired phone's bearer reaches, is
 * held by the server's handler tests and the phone's runtime tests.
 */

import { defineContract } from "../src/contract"

const VIDEO = "/cards-essays/:key/video"

const ESSAY = { path: { key: "rust-scratchpad-2026-11-14" } }

export const contracts = [
  defineContract({
    id: "cards_essays.video_signed_out",
    module: "cards_essays",
    method: "GET",
    path: VIDEO,
    request: ESSAY,
    summary:
      "a cards essay's video is a paired phone's: without a session it is a 401",
    expect: { status: 401 },
  }),

  defineContract({
    id: "cards_essays.video_browser",
    module: "cards_essays",
    session: true,
    method: "GET",
    path: VIDEO,
    request: ESSAY,
    summary: "a browser's session is not a paired phone's: it is a 403",
    expect: { status: 403 },
  }),
]

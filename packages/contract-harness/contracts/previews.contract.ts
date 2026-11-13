/**
 * A template's preview, for the Preview part of a template's page on the
 * phone (paulgsc/server `routes/previews.rs`, `handlers/previews.rs`,
 * `previews.rs`; SFEED12, #2757). The phone asks for one with
 * `POST /previews/:template`, reads the newest with `GET /previews/:template`
 * and brings its video over with `GET /previews/:template/:id/video`
 * (`apps/www/src/lib/home-link/previews.ts`), through the app's home link.
 *
 * Hand-written. Every route is a paired phone's only (`Paired`): without a
 * session it is a `401`, and a browser's cookie session, which is what a
 * `session` contract carries, is a `403`. So the contracts here pin the
 * refusals. The answers' shapes, which only a paired phone's bearer reaches,
 * are held by the server's handler and `previews` tests and by the phone's
 * reader (`apps/www/src/lib/template-preview/model.ts`).
 */

import { defineContract } from "../src/contract"

const TEMPLATE = "/previews/:template"
const VIDEO = "/previews/:template/:id/video"

const CALL = { path: { template: "conference-call" } }
const CALL_VIDEO = {
  path: { template: "conference-call", id: "conference-call-20261108T074500Z" },
}

export const contracts = [
  defineContract({
    id: "previews.post_signed_out",
    module: "previews",
    method: "POST",
    path: TEMPLATE,
    request: CALL,
    summary:
      "asking for a preview is a paired phone's: without a session it is a 401, and nothing is asked",
    mutates: true,
    expect: { status: 401 },
  }),

  defineContract({
    id: "previews.get_signed_out",
    module: "previews",
    method: "GET",
    path: TEMPLATE,
    request: CALL,
    summary:
      "a template's preview is a paired phone's: without a session it is a 401",
    expect: { status: 401 },
  }),

  defineContract({
    id: "previews.get_browser",
    module: "previews",
    session: true,
    method: "GET",
    path: TEMPLATE,
    request: CALL,
    summary: "a browser's session is not a paired phone's: it is a 403",
    expect: { status: 403 },
  }),

  defineContract({
    id: "previews.video_signed_out",
    module: "previews",
    method: "GET",
    path: VIDEO,
    request: CALL_VIDEO,
    summary:
      "a preview's video is a paired phone's: without a session it is a 401",
    expect: { status: 401 },
  }),
]

/**
 * KPLAY's shop on home: the phrases a hunch finds (paulgsc/server
 * `routes/phrases.rs`, `handlers/phrases.rs`, `phrases.rs`; KP4, #2853,
 * server#1265). The phone asks with `POST /phrases/lookup` of
 * `{ words, hunch }` (`apps/www/src/lib/home-link/phrase-lookup.ts`, and the
 * drain's `home-link/hunches.ts` for one home didn't answer), through the
 * app's home link.
 *
 * Hand-written. The route is a paired phone's only (`Paired`): without a
 * session it is a `401`, and a browser's cookie session, which is what a
 * `session` contract carries, is a `403`. So both contracts here pin the
 * refusals, and nothing is kept. The answer's shape (`hit` with the phrases,
 * closest first, or `kept`), which only a paired phone's bearer reaches, is
 * held by the server's handler tests (`handlers/phrases/tests.rs`) and by the
 * phone's reader (`apps/www/src/lib/shop-home`).
 */

import { defineContract } from "../src/contract"

const LOOKUP = "/phrases/lookup"
const HUNCH = { body: { words: "where's my phone", hunch: "contract-1" } }

export const contracts = [
  defineContract({
    id: "phrases.lookup_signed_out",
    module: "phrases",
    method: "POST",
    path: LOOKUP,
    request: HUNCH,
    summary:
      "looking a hunch up is a paired phone's: without a session it is a 401, and nothing is kept",
    mutates: true,
    expect: { status: 401 },
  }),

  defineContract({
    id: "phrases.lookup_browser",
    module: "phrases",
    session: true,
    method: "POST",
    path: LOOKUP,
    request: HUNCH,
    summary:
      "a browser's session is not a paired phone's: it is a 403, and nothing is kept",
    mutates: true,
    expect: { status: 403 },
  }),
]

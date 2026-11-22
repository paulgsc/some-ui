/**
 * A game's moment log (GWB14 D15, paulgsc/some-ui#3039; paulgsc/server#1101,
 * `routes/games.rs`, `handlers/games.rs`): every play home kept of the game,
 * in its order, as the scenarios it was, each entry the shape `/ws/game-week`'s
 * `justHappened` sends, with the quarter and clock of its snap. The phone
 * reads it in Takes filtered to a game (`apps/www/src/lib/home-link/game-moments`)
 * and reads it with `@some-ui/game-week`'s `readMoments`.
 *
 * **Who may call.** A paired phone only (`subject::Paired`), as the live
 * socket: no session is a `401`, a browser's cookie session a `403`.
 *
 * **What it holds of the person: nothing.** Only ESPN's public game data read
 * through the engine, so a probe keeps and changes nothing. A game home kept
 * no play of, or an id ESPN could not have given, is a `404`.
 */

import { z } from "zod"

import { defineContract, pairedPhoneOnly } from "../src/contract"

/** NE at CHI, 2026-10-22: the game GWB2 recorded, and every fixture replays. */
const RECORDED_GAME = "401873010"

/** An id of ESPN's form that names no game home has kept a play of. */
const ABSENT_GAME = "1"

/** What a bite of a play is about by default (#3049, catalog v2's `units`). */
const Unit = z.enum(["offense", "defense", "special-teams", "coaching"])

/** A big play by the algebra (#3048): its size and kind as the catalog lists them. */
const BigPlay = z.object({
  size: z.string(),
  kind: z.string(),
  by: z.string(),
  yards: z.number().int(),
  scored: z.boolean(),
  good: z.boolean().nullable(),
})

/** One entry: "just happened"'s, field for field, and where its play sits. */
const Moment = z.object({
  id: z.string(),
  playId: z.string(),
  line: z.string(),
  at: z.iso.datetime({ offset: true }),
  bigPlay: BigPlay.optional(),
  unit: Unit.nullable(),
  unitSide: z.string().nullable(),
  period: z.number().int().positive().nullable(),
  clock: z.string().nullable(),
})

const MomentLogSchema = z.object({
  gameId: z.string(),
  engineVersion: z.number().int().positive(),
  catalogVersion: z.number().int().positive(),
  final: z.boolean(),
  moments: z.array(Moment),
})

export const contracts = [
  defineContract({
    id: "games.moments",
    module: "games",
    paired: true,
    method: "GET",
    path: "/games/:id/moments",
    summary:
      "a game's moment log: every play home kept of it, in its order, as the scenarios it was, each with its quarter and clock, and whether the game is final; a 404 where home kept no play of it",
    request: { path: { id: RECORDED_GAME } },
    expect: { status: [200, 404], schemaFor: 200, schema: MomentLogSchema },
  }),
  defineContract({
    id: "games.moments_absent",
    module: "games",
    paired: true,
    method: "GET",
    path: "/games/:id/moments",
    summary: "a game home kept no play of has no moment log: a 404",
    request: { path: { id: ABSENT_GAME } },
    expect: { status: 404 },
  }),
  ...pairedPhoneOnly(
    "games",
    "games.moments",
    "GET",
    "/games/:id/moments",
    "a game's moment log",
    { path: { id: RECORDED_GAME } }
  ),
]

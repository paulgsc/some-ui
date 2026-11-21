/**
 * What the Jobs wing offers and where in it the owner is, in ENGAGE's
 * vocabulary (`@some-ui/engagement`'s registry, pipeline `jobs`), for the
 * walkthrough's honest friction (WALK5, C861): Today's pick and the others
 * it lists are offers a visit counts; a pick's steps, the Record tab and the
 * interview week's pages are places (`createPlaces`), so home reads time in
 * each and where a visit stopped.
 *
 * An offer's key names the pick on screen so a visit counts it once; no key
 * leaves the phone, since an event carries only the pipeline, the affordance
 * and the surface. Pure.
 */
import type { Offer, PlaceOf } from "@some-ui/engagement"

import type { JobsState } from "./model"
import { nextPick } from "./today"

/** The two ways a pick is offered: Today's own, or another it lists. */
export type PickAffordance = "todays-pick" | "other-pick"

/** A pick's steps as places, in its step bar's order (`words.steps`). */
export const PICK_PLACES = [
  "read",
  "decide",
  "resume",
  "apply",
  "ending",
] as const

export type PickPlace = (typeof PICK_PLACES)[number]

const placeOf = (affordance: string): PlaceOf => ({
  pipeline: "jobs",
  affordance,
  surface: "apk",
})

/** `affordance`'s offer of the pick `pickId` of `day`. */
export const pickOffer = (
  affordance: PickAffordance,
  day: string,
  pickId: string
): Offer => ({
  ...placeOf(affordance),
  key: `jobs:${affordance}:${day}:${pickId}`,
})

/** Which offer a pick is, by whether Today opens on it (`nextPick`). */
export function pickAffordanceOf(
  state: JobsState,
  today: string,
  day: string,
  pickId: string
): PickAffordance {
  const next = nextPick(state, today)
  return next?.day === day && next.pick.id === pickId
    ? "todays-pick"
    : "other-pick"
}

/** A pick's steps, as the affordance it was offered as. */
export const pickPlaces = (affordance: PickAffordance): PlaceOf =>
  placeOf(affordance)

/** The place a pick's step bar is on, by its index; none past its last. */
export const pickPlaceAt = (index: number): PickPlace | null =>
  PICK_PLACES[index] ?? null

/** The Record tab, as a place. */
export const RECORD_PLACES = placeOf("record")

/** The interview week's pages, as places (`lib/interview-week/places`). */
export const INTERVIEW_PLACES = placeOf("interview-week")

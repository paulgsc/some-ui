/**
 * The Cast wing (HOST8), as the phone draws it, for `../cast-fit.spec.ts`:
 * each character's grid of looks, its last page, and one look in the
 * largest and the smallest shot, each the wing's own screen under a router
 * of its own.
 */
import type { JSX } from "react"

import type { Look } from "@/lib/cast"
import { lookOf } from "@/lib/cast"
import { CastHome, CastLook } from "@/components/cast"

import { routed } from "./my-data"

const noop = (): void => undefined

/** `who`'s look `id`, which the fixture names on purpose. */
const look = (who: Look["character"], id: string): Look => {
  const found = lookOf(who, id)
  if (found === undefined) throw new Error(`${who} has no look ${id}`)
  return found
}

const home = (who: Look["character"], page: number): (() => JSX.Element) => {
  const Home = (): JSX.Element => (
    <CastHome who={who} page={page} onWho={noop} onPage={noop} />
  )
  return Home
}

export const CAST_FIXTURES = {
  "cast-mochi": routed(home("mochi", 0), "/cast"),
  "cast-tin-bird": routed(home("tin-owlet", 0), "/cast"),
  "cast-mochi-last": routed(home("mochi", 99), "/cast"),
  "cast-look-close-up": routed(
    () => (
      <CastLook
        look={look("mochi", "hesitation")}
        shot="close-up"
        placement="center"
        onShot={noop}
        onPlacement={noop}
      />
    ),
    "/cast/look"
  ),
  "cast-look-long": routed(
    () => (
      <CastLook
        look={look("mochi", "nfl-celebration")}
        shot="long"
        placement="bottom-left"
        onShot={noop}
        onPlacement={noop}
      />
    ),
    "/cast/look"
  ),
}

export type CastId = keyof typeof CAST_FIXTURES

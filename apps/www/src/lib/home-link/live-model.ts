/**
 * The game day's live socket, the app's half (GWB4, #2078): where it is,
 * when to try again, home's clock against the phone's, and the week kept on
 * the phone. Pure; `./live` is the runtime that owns the socket and the
 * timers, and the messages themselves are `@some-ui/game-week`'s
 * (`readHome`, `helloText`, `pingText`).
 */
import { isRecord, jsonOf } from "@some-ui/core-utils"
import type { FeedLink, Game } from "@some-ui/game-week"

/** Where the socket is, under the paired home's origin. */
const LIVE_PATH = "/ws/game-week"

const isString = (value: unknown): value is string => typeof value === "string"

/**
 * Home's clock against the phone's from one pong: home's reading taken
 * halfway through the round trip. `null` for a pong of no ping this phone
 * could have sent (from its future).
 */
export function clockSample(
  phoneAt: number,
  homeAt: number,
  receivedAt: number
): { readonly offsetMs: number; readonly roundTripMs: number } | null {
  if (phoneAt > receivedAt) return null
  const roundTripMs = receivedAt - phoneAt
  return { offsetMs: homeAt - (phoneAt + roundTripMs / 2), roundTripMs }
}

/** How the phone stands with home once the socket closed with `code`. */
export function linkAfterClose(code: number): FeedLink {
  if (code === 4426) return "update"
  if (code === 4401) return "unpaired"
  return "away"
}

/** Whether, after a close that left the phone at `link`, it tries again. */
export function triesAgain(link: FeedLink): boolean {
  return link === "away"
}

/** How long to wait before the `attempt`th try again: 1 s doubling to 30 s. */
export function retryDelayMs(attempt: number): number {
  return Math.min(30_000, 1_000 * 2 ** Math.min(attempt, 5))
}

/**
 * The socket's address under a paired home's API base (`https://host/api/v1`,
 * or under a path): `wss:` only, `null` for a base that is not `https:`.
 */
export function liveUrl(base: string): string | null {
  let url: URL
  try {
    url = new URL(base)
  } catch {
    return null
  }
  if (url.protocol !== "https:") return null
  const path = url.pathname.replace(/\/+$/, "").replace(/\/api\/v1$/, "")
  return `wss://${url.host}${path}${LIVE_PATH}`
}

/** The week this phone last had from home, as kept, or null for none. */
export function parseWeek(raw: string): ReadonlyArray<Game> | null {
  const value = jsonOf(raw)
  if (!Array.isArray(value)) return null
  const games: Array<Game> = []
  for (const each of value) {
    if (
      !isRecord(each) ||
      !isString(each.id) ||
      !isString(each.label) ||
      !isString(each.want) ||
      !isString(each.kickoff)
    ) {
      return null
    }
    games.push({
      id: each.id,
      label: each.label,
      want: each.want,
      kickoff: each.kickoff,
    })
  }
  return games
}

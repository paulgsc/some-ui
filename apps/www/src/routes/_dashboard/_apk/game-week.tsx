import type { JSX } from "react"
import type { GameWeekPorts } from "@some-ui/game-week"
import {
  awayFeed,
  fixtureFeed,
  GameWeek,
  storedPrefs,
} from "@some-ui/game-week"
import { createFileRoute } from "@tanstack/react-router"

import { phoneBitePorts } from "@/lib/game-bites"
import { gameOutbox } from "@/lib/home-link/voice"
import { browserLocalStorage } from "@/lib/tenant/storage"

/**
 * Game day: tap what is happening and say it (GWB6, #2080). Home's offers
 * reach the phone later (GWB3, GWB4); until then a development build shows a
 * made-up Sunday, and the Android app is as away from home: no offers. Every
 * bite waits on the phone until home holds it.
 */
function gameWeekPorts(): GameWeekPorts {
  return {
    ...phoneBitePorts(),
    feed: import.meta.env.DEV ? fixtureFeed() : awayFeed,
    prefs: storedPrefs(browserLocalStorage),
  }
}

/**
 * The phone's alone: the flag is read inline, so other builds drop the
 * recorder's storage and the voice lane (vite-env.d.ts, VITE_DEVICE_BACKEND).
 */
const GameWeekRoute = (): JSX.Element | null =>
  import.meta.env.VITE_DEVICE_BACKEND === "true" ? (
    // Read once, on mount: the recorder owns these for as long as it shows.
    <GameWeek ports={gameWeekPorts()} outbox={gameOutbox} />
  ) : null

export const Route = createFileRoute("/_dashboard/_apk/game-week")({
  component: GameWeekRoute,
})

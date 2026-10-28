import type { JSX } from "react"
import { useState } from "react"
import type { GameWeekPorts } from "@some-ui/game-week"
import {
  fixtureFeed,
  GameWeek,
  noGamesFeed,
  storedPrefs,
} from "@some-ui/game-week"
import { createFileRoute } from "@tanstack/react-router"

import { phoneBitePorts } from "@/lib/game-bites"
import { gameOutbox } from "@/lib/home-link/voice"
import { browserLocalStorage } from "@/lib/tenant/storage"

/**
 * Game day: tap what is happening and say it (GWB6, #2080). Home's week of
 * games and its offers reach the phone later (GWB3, GWB4); until then a
 * development build shows a made-up Sunday, and the Android app has no games
 * yet, so its screen says recording opens once home sends them, and lists
 * every scenario meanwhile. Every bite waits on the phone until home holds it.
 */
function gameWeekPorts(): GameWeekPorts {
  return {
    ...phoneBitePorts(),
    feed: import.meta.env.DEV ? fixtureFeed() : noGamesFeed,
    prefs: storedPrefs(browserLocalStorage),
  }
}

/** The recorder, with the ports it owns for as long as it shows. */
const PhoneGameWeek = (): JSX.Element => {
  // Made once per mount: the recorder reads them once.
  const [ports] = useState(() => gameWeekPorts())
  return <GameWeek ports={ports} outbox={gameOutbox} />
}

/**
 * The phone's alone: the flag is read inline, so other builds drop the
 * recorder's storage and the voice lane (vite-env.d.ts, VITE_DEVICE_BACKEND).
 */
const GameWeekRoute = (): JSX.Element | null =>
  import.meta.env.VITE_DEVICE_BACKEND === "true" ? <PhoneGameWeek /> : null

export const Route = createFileRoute("/_dashboard/_apk/game-week")({
  component: GameWeekRoute,
})

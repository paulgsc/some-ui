import type { JSX } from "react"
import { useState } from "react"
import type { GameWeekPorts } from "@some-ui/game-week"
import {
  fixtureFeed,
  GameWeek,
  helloText,
  pingText,
  readHome,
  storedPrefs,
} from "@some-ui/game-week"
import { createFileRoute } from "@tanstack/react-router"

import { phoneBitePorts } from "@/lib/game-bites"
import { gameDayFeed } from "@/lib/home-link/live"
import { gameOutbox } from "@/lib/home-link/voice"
import { browserLocalStorage } from "@/lib/tenant/storage"

/**
 * Game day: tap what is happening and say it (GWB6, #2080). The week's
 * games and home's offers come over the game day's live socket to the
 * paired home (GWB4, `lib/home-link/live`, LA16) while this screen shows;
 * away from home it says so, keeps the week it last had, and still lets a
 * bite be said first or picked from every scenario. A development build
 * shows a made-up Sunday instead. Every bite waits on the phone until home
 * holds it.
 */
function gameWeekPorts(): GameWeekPorts {
  return {
    ...phoneBitePorts(),
    feed: import.meta.env.DEV
      ? fixtureFeed()
      : gameDayFeed({ read: readHome, hello: helloText, ping: pingText }),
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

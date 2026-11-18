/**
 * The ports Studio's Takes hands `TakeLibrary` (ST32, TAKES2, TAKES3): home
 * and a player, this phone's own takes with no scene, where each take stands
 * on the conveyor, and what each was said for, over the stores the route
 * hands in (`AboutStores`). Made once, for every page of Takes, in the
 * Android app alone (`build.paths.ts`); null elsewhere.
 */
import type { ComponentProps } from "react"
import type { TakeLibrary } from "@some-ui/soundbites"
import { audioPlayer } from "@some-ui/voice-capture"

import { libraryTakes } from "@/lib/library-takes"
import { screenRefreshers } from "@/lib/pull-refresh/refreshers"
import type { AboutStores } from "@/lib/take-about"
import { takeAbout } from "@/lib/take-about"
import { libraryStations } from "@/lib/take-conveyor"

import { phoneOnlyTakes, takesHome } from "./index"
import { takeNames } from "./names"

type Ports = ComponentProps<typeof TakeLibrary>["ports"]

let ports: Ports | null = null

/** Takes' ports over `stores`, made on first use. */
export function takePorts(stores: AboutStores): Ports {
  ports ??= {
    home: takesHome,
    player: audioPlayer,
    phone: libraryTakes(),
    stations: libraryStations(),
    about: takeAbout(stores),
    onPhone: phoneOnlyTakes(),
    names: takeNames,
    refresh: screenRefreshers.register,
  }
  return ports
}

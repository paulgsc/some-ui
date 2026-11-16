/**
 * The ports Studio's Takes hands `TakeLibrary` (ST32, TAKES2, TAKES3): home
 * and a player, this phone's own takes with no scene, where each take stands
 * on the conveyor, and what each was said for. Made once for every page of
 * Takes, in the Android app alone (`build.paths.ts`); null elsewhere.
 */
import type { ComponentProps } from "react"
import type { TakeLibrary } from "@some-ui/soundbites"
import { audioPlayer } from "@some-ui/voice-capture"

import { libraryTakes } from "@/lib/library-takes"
import { takeAbout } from "@/lib/take-about"
import { libraryStations } from "@/lib/take-conveyor"

import { takesHome } from "./index"

export const takePorts: ComponentProps<typeof TakeLibrary>["ports"] | null =
  import.meta.env.VITE_DEVICE_BACKEND === "true"
    ? {
        home: takesHome,
        player: audioPlayer,
        phone: libraryTakes(),
        stations: libraryStations(),
        about: takeAbout(),
      }
    : null

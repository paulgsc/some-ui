/**
 * The ports Studio's Takes › Needs your attention hands `TakeReconcile`
 * and its way in (HEARD3, #3075): home, a player, and what My data's delete
 * path deleted (`hearDeletes`, LA19), so a take deleted for good leaves the
 * list. The Android app's alone (`build.paths.ts`).
 */
import type { ComponentProps } from "react"
import type { TakeReconcile } from "@some-ui/soundbites"
import { audioPlayer } from "@some-ui/voice-capture"

import { hearDeletes } from "@/lib/my-data"
import { screenRefreshers } from "@/lib/pull-refresh/refreshers"

import { reconcileHome } from "./index"

type Ports = ComponentProps<typeof TakeReconcile>["ports"]

let ports: Ports | null = null

/**
 * The page's ports, made on first use. Each route reads the build's flag
 * itself before calling this, so the bundler drops the call from the web
 * builds (`check:bundle-paths`).
 */
export function reconcilePorts(): Ports {
  ports ??= {
    home: reconcileHome,
    player: audioPlayer,
    deletes: hearDeletes,
    refresh: screenRefreshers.register,
  }
  return ports
}

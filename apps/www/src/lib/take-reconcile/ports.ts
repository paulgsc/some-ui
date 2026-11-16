/**
 * The ports Studio's Takes › Needs your attention hands `TakeReconcile`
 * (HEARD3, #3075): home, a player, and what My data's delete path deleted
 * (`hearDeletes`, LA19), so a take deleted for good leaves the list. Made
 * once, in the Android app alone (`build.paths.ts`).
 */
import type { ComponentProps } from "react"
import type { TakeReconcile } from "@some-ui/soundbites"
import { audioPlayer } from "@some-ui/voice-capture"

import { hearDeletes } from "@/lib/my-data"

import { reconcileHome } from "./index"

type Ports = ComponentProps<typeof TakeReconcile>["ports"]

let ports: Ports | null = null

/** The page's ports, made on first use. */
export function reconcilePorts(): Ports {
  ports ??= { home: reconcileHome, player: audioPlayer, deletes: hearDeletes }
  return ports
}

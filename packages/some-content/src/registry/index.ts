import type { ComponentRegistry } from "some-types-utils"
import { lazyWithPreload } from "some-ui-utils"

type RegistryKey =
  | "cube"
  | "hangul"
  | "leetype"
  | "scheduled"
  | "music"
  | "voice"
  | "neon"
  | "cdrama-header"
  | "cdrama-metrics"
  | "cdrama-emoji"
  | "cdrama-ost"

export const componentRegistry: ComponentRegistry<RegistryKey> = {
  cube: lazyWithPreload(
    () => import("@content/components/overlay/cube-content")
  ),
  hangul: lazyWithPreload(() => import("some-ui-honeycomb"), "HangulHexGrid"),
  leetype: lazyWithPreload(() => import("some-ui-input"), "Leetype"),
  music: lazyWithPreload(() => import("umag"), "NowPlayingCard"),
  voice: lazyWithPreload(() => import("umag"), "VoiceAvatar"),
  neon: lazyWithPreload(() => import("some-ui-neon-sign"), "Headline"),
  "cdrama-header": lazyWithPreload(() => import("makjang"), "DramaHeader"),
  "cdrama-metrics": lazyWithPreload(() => import("makjang"), "MetricsPanel"),
  "cdrama-emoji": lazyWithPreload(() => import("makjang"), "EmojiTimeline"),
  "cdrama-ost": lazyWithPreload(() => import("makjang"), "OSTPanel"),
  scheduled: lazyWithPreload(
    () => import("some-ui-slideshow"),
    "ActiveLifetimesPanel"
  ),
  // ...
}

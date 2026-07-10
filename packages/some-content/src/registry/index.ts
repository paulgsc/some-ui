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
  | "topik"
  | "assessment"
  | "interview"
  | "cdrama-header"
  | "cdrama-couple"
  | "cdrama-metrics"
  | "cdrama-emoji"
  | "cdrama-ost"

export const componentRegistry: ComponentRegistry<RegistryKey> = {
  cube: lazyWithPreload(
    () => import("@content/components/overlay/cube-content")
  ),
  hangul: lazyWithPreload(() => import("@some-ui/honeycomb"), "HangulHexGrid"),
  leetype: lazyWithPreload(() => import("some-ui-input"), "Leetype"),
  music: lazyWithPreload(() => import("@some-ui/umag"), "NowPlayingCard"),
  voice: lazyWithPreload(() => import("@some-ui/umag"), "VoiceAvatar"),
  neon: lazyWithPreload(() => import("some-ui-neon-sign"), "Headline"),
  topik: lazyWithPreload(() => import("@some-ui/chat"), "KoreanStudyPage"),
  assessment: lazyWithPreload(
    () => import("@some-ui/resume"),
    "TechnicalBlockAssessment"
  ),
  interview: lazyWithPreload(() => import("@some-ui/chat"), "InterviewApp"),
  "cdrama-header": lazyWithPreload(
    () => import("@some-ui/makjang"),
    "DramaHeader"
  ),
  "cdrama-couple": lazyWithPreload(
    () => import("@some-ui/makjang"),
    "CoupleRating"
  ),
  "cdrama-metrics": lazyWithPreload(
    () => import("@some-ui/makjang"),
    "MetricsPanel"
  ),
  "cdrama-emoji": lazyWithPreload(
    () => import("@some-ui/makjang"),
    "EmojiTimeline"
  ),
  "cdrama-ost": lazyWithPreload(() => import("@some-ui/makjang"), "OSTPanel"),
  scheduled: lazyWithPreload(
    () => import("@some-ui/slideshow"),
    "ActiveLifetimesPanel"
  ),
  // ...
}

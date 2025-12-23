import type { ComponentRegistry } from "some-types-utils"
import { lazyWithPreload } from "some-ui-utils"

type RegistryKey =
  | "cube"
  | "hangul"
  | "leetype"
  | "scheduled"
  | "music"
  | "neon"

export const componentRegistry: ComponentRegistry<RegistryKey> = {
  cube: lazyWithPreload(
    () => import("@content/components/overlay/cube-content")
  ),
  hangul: lazyWithPreload(() => import("some-ui-honeycomb"), "HangulHexGrid"),
  leetype: lazyWithPreload(() => import("some-ui-input"), "Leetype"),
  neon: lazyWithPreload(() => import("some-ui-neon-sign"), "NeonText"),
  scheduled: lazyWithPreload(
    () => import("some-ui-slideshow"),
    "ActiveLifetimesPanel"
  ),
  // ...
}

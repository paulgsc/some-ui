import type { ComponentType } from "react"
import { lazyWithPreload } from "@some-ui/content-registry/registry/lazy-with-preload"
import type { ComponentRegistry } from "@some-ui/types"

import { hasAudience } from "@/lib/build-profile"

/**
 * The web surface's door (`doors` in build.profiles.ts): the one place
 * outside a gated route that may import a "web"-audience workspace, today
 * `@some-ui/honeycomb`. The desktop web and the Android app are separate
 * surfaces, each built for what its device affords; what only the web has
 * reaches shared code (the session player, the extensions page) through
 * here, and the Android app's build gets nothing.
 *
 *   A4  every export hands out a gated workspace only behind the guard
 *       below, and something inert otherwise
 *       (packages/some-vite-config/AUDIENCES.md)
 *
 * The guard reads `VITE_DEVICE_BACKEND` inline, at each branch, so the
 * Android app's bundle drops the `import()` before chunking rather than
 * writing a chunk nothing loads (AUDIENCES.md, "Paths"); `hasAudience` keeps
 * a profile without "web" (a `mobile` dev server without the flag) from
 * reaching the stubs.
 */

/** The panels only the web surface binds, beside the shared registry's. */
export type WebPanelKey = "hangul"

export const WEB_PANELS: Partial<ComponentRegistry<WebPanelKey>> =
  import.meta.env.VITE_DEVICE_BACKEND !== "true" && hasAudience("web")
    ? {
        hangul: lazyWithPreload(() => import("./hangul/panel"), "HangulPanel"),
      }
    : {}

const Nothing = (): null => null

/** The extensions tour's comb; nothing where the build has no web surface. */
export const ExtensionsComb: ComponentType =
  import.meta.env.VITE_DEVICE_BACKEND !== "true" && hasAudience("web")
    ? lazyWithPreload(() => import("@some-ui/honeycomb"), "ExtensionsComb")
        .Component
    : Nothing

import type { ComponentRegistry } from "@some-ui/types"
import { lazyWithPreload } from "some-ui-utils"

/**
 * Every panel identity this app can bind, known at compile time. Exported so
 * a host can build a statically-checked per-key map (e.g. apps/www's
 * scene-props adapter, which associates fetched content with the exact keys
 * that consume it instead of merging one bag onto every panel).
 */
export type RegistryKey = "hangul" | "leetype" | "topik"

/**
 * ## The contract every entry here owes its hosts
 *
 * An entry must render **with no props and no ambient React context**.
 * A host binds a key to a panel and renders whatever comes back; it has no
 * way to know that one particular applet wants a provider mounted above it,
 * and `RegistryEntry`'s props are typed `any`, so nothing tells it. A
 * context requirement therefore fails at runtime, inside a lazy chunk, in a
 * viewport - and the host cannot fix it without learning that applet's
 * internals, which is exactly what this indirection exists to prevent.
 *
 * Configuration comes in as optional props with package-owned defaults:
 * honeycomb defaults `words` to its bundled seed, `KoreanStudyPage` builds
 * its own repositories and provides its own session context. Genuinely page-wide state (the
 * speech session) is read through an *optional* accessor, so an applet
 * degrades rather than throws where the host has mounted none.
 */
export const componentRegistry: ComponentRegistry<RegistryKey> = {
  hangul: lazyWithPreload(() => import("@some-ui/honeycomb"), "HangulHexGrid"),
  leetype: lazyWithPreload(() => import("@some-ui/leetype"), "Leetype"),
  topik: lazyWithPreload(() => import("@some-ui/topik"), "KoreanStudyPage"),
}

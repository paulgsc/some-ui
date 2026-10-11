import type { ComponentRegistry } from "@some-ui/types"

import { lazyWithPreload } from "./lazy-with-preload"

/**
 * Every panel identity every build can bind, known at compile time. Exported
 * so a host can build a statically-checked per-key map (e.g. apps/www's
 * scene-props adapter, which associates fetched content with the exact keys
 * that consume it instead of merging one bag onto every panel).
 *
 * Only the panels both surfaces play. One that belongs to a single surface
 * (Hangul Honeycomb, a desktop keyboard game) is bound by that surface's
 * host instead (apps/www's `src/lib/web-surface`), so the other never ships
 * it.
 */
export type RegistryKey = "leetype" | "topik"

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
 * `KoreanStudyPage` builds its own repositories and provides its own session
 * context. Genuinely page-wide state (the
 * speech session) is read through an *optional* accessor, so an applet
 * degrades rather than throws where the host has mounted none.
 */
export const componentRegistry: ComponentRegistry<RegistryKey> = {
  leetype: lazyWithPreload(() => import("@some-ui/leetype"), "Leetype"),
  topik: lazyWithPreload(() => import("@some-ui/topik"), "KoreanStudyPage"),
}

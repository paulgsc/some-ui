/**
 * Ambient typing for the two globals `scope-registry-harness.ts` injects
 * into a bare test page (`inline-module.ts`'s compiled output assigns to
 * `window[SCOPE_REGISTRY_GLOBAL]`/`window[CUSTODY_PRIMITIVE_GLOBAL]`) — so
 * `page.evaluate()` bodies in SF-RG's (#1265) own specs type-check against
 * the real module shape instead of reaching for `any`. Side-effect-only:
 * these are type imports, erased at compile time, and this file is never
 * itself injected into a page.
 */

import type * as CustodyPrimitiveModule from "@filter/adapter/custody-primitive"
import type * as ScopeRegistryModule from "@filter/adapter/scope-registry"

declare global {
  // eslint-disable-next-line @typescript-eslint/consistent-type-definitions -- declaration merging into the global Window requires `interface`; `type` cannot merge.
  interface Window {
    ScopeRegistryModule: typeof ScopeRegistryModule
    CustodyPrimitiveModule: typeof CustodyPrimitiveModule
  }
}

export {}

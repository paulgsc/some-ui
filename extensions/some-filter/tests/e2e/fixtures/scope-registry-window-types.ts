/**
 * Ambient typing for the two globals `scope-registry-harness.ts` injects
 * (`window[SCOPE_REGISTRY_GLOBAL]`/`window[CUSTODY_PRIMITIVE_GLOBAL]`), so
 * `page.evaluate()` bodies type-check against the real module shape. Type
 * imports only; never injected into a page.
 */

import type * as CustodyPrimitiveModule from "@filter/adapter/custody-primitive"
import type * as ScopeRegistryModule from "@filter/adapter/scope-registry"

declare global {
  // eslint-disable-next-line @typescript-eslint/consistent-type-definitions -- declaration merging into the global Window requires `interface`; `type` cannot merge.
  interface Window {
    ScopeRegistryModule: typeof ScopeRegistryModule
    CustodyPrimitiveModule: typeof CustodyPrimitiveModule
    // Test scaffolding: the registry must survive across the
    // captureFrames() call boundary (see scope-registry-handoff.spec.ts).
    __sfHandoffRegistry?: ScopeRegistryModule.ScopeRegistry<string>
  }
}

export {}

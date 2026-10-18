/**
 * Test-only helpers: resource-lifetime probes (Charter §7/§8), a fake
 * `storage.local`, and the colours of a screenshot for e2e specs.
 * Import from "@some-extension/common/testing" in tests — never from
 * shipped code: the probe replaces globals.
 */
export * from "./resource-probe"
export * from "./animation-gate"
export * from "./fake-storage"
export * from "./screen-colors"

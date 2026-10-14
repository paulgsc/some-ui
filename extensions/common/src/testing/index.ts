/**
 * Test-only helpers: resource-lifetime probes (Charter §7/§8) and a fake
 * `storage.local`.
 * Import from "@some-extension/common/testing" in unit tests — never from
 * shipped code: the probe replaces globals.
 */
export * from "./resource-probe"
export * from "./animation-gate"
export * from "./fake-storage"

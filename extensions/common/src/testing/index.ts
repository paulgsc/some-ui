/**
 * Test-only helpers for asserting resource lifetimes (Charter §7/§8).
 * Import from "@some-extension/common/testing" in unit tests — never from
 * shipped code: the probe replaces globals.
 */
export * from "./resource-probe"
export * from "./animation-gate"

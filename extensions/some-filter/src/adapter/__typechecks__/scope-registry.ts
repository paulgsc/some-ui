/**
 * Type-only fixture (SF3, #1359): the compile-time half of "DISCOVERED_UNHELD
 * is unreachable as a resting state." The runtime half — exact reachability
 * of Σ's six resting kinds via BFS — lives in
 * `../__tests__/scope-registry.test.ts`; that file no longer restates this
 * half as a runtime `it()`.
 *
 * Deliberately not named `*.test.ts`/`*.spec.ts`, so Vitest's default
 * include pattern never discovers it. `tsc --noEmit` picks it up on its own
 * via tsconfig.json's "src" include — no additional project wiring needed
 * (see also that config's own `include` list).
 *
 * `scope-registry.ts`'s `RestingScopeState` (Definition D.5's Σ) has no
 * "DISCOVERED_UNHELD" member by construction — assigning one below is a
 * compile-time rejection, not an unexercised runtime branch. If this ever
 * stops being a type error (e.g. `DISCOVERED_UNHELD` is added back to
 * `RestingScopeState`), `tsc --noEmit` fails here with "Unused
 * '@ts-expect-error' directive", not silently.
 */
import type { RestingScopeState } from "@filter/adapter/scope-registry"

// prettier-ignore
// @ts-expect-error — RestingScopeState has no "DISCOVERED_UNHELD" member.
export const discoveredUnheldIsUnreachable: RestingScopeState = { kind: "DISCOVERED_UNHELD" }

/**
 * Resource lifetimes (Good-Citizen Charter §7/§8).
 *
 * The idiom: a resource is held only while the thing consuming it is active.
 * Acquire through a {@link Disposables}; acquire what should run only while
 * visible inside an {@link ActiveScope}'s `start`; decide "showing" with
 * {@link watchPageShowing}. The lint rules `require-named-lifetime` and
 * `require-scoped-lifetime`, and `@some-extension/common/testing`, enforce
 * what can be enforced.
 *
 * What they cannot is written as review invariants L1–L8 in GOOD_CITIZEN.md
 * ("Resource lifetimes: what is enforced, and what is not"): each a claim,
 * the hunk that falsifies it, and its scope, so a review checks one diff
 * against it without exploring states the diff does not touch.
 *
 *   L1  repeating resources (`.interval`, `.loop`, `spawn*`) acquire on the
 *       scope `ActiveScope.start` receives
 *   L2  every hold name appears in an `it(` title in the lifetime suite
 *   L3  every lifetime-rule exemption has a `Lifetime:` line directly above
 *   L4  observers, sockets and `browser.*.onX` listeners outside entry
 *       modules register their release with `<life>.add(` (or L3)
 *   L5  infinite animations sit under the overlay's dormant gate or are
 *       created in `start`; `.animate(` only in `start`
 *   L6  `visibilityState` / `hidden` / `fullscreenElement` are read only via
 *       `isPageShowing` / `watchPageShowing`
 *   L7  (not reviewable) this package's suite runs on trunk only
 *   L8  a page listener or frame loop in a shape `require-scoped-lifetime`
 *       does not read (an alias, a computed member, options through a
 *       variable) still has a definite signal, `once`, or a `Lifetime:` line
 */
export * from "./disposables"
export * from "./active-scope"
export * from "./page-showing"

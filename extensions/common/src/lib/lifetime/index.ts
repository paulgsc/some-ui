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
 * What they cannot — named so it is changed knowingly, and defended in full in
 * GOOD_CITIZEN.md, "Resource lifetimes: what is enforced, and what is not":
 *
 *   1. whether an owner ends on every transition it should (a design
 *      question; the answer is not at the call site),
 *   2. transitions no lifetime suite drives,
 *   3. exemptions, which pass with any comment,
 *   4. resources the rules do not recognise (observers, sockets,
 *      `browser.*.onX`, non-page targets, aliased calls) — acquire them
 *      through a `Disposables` anyway,
 *   5. CSS the harness cannot see (JS-started animations, unmounted
 *      elements, non-`infinite` loops),
 *   6. what only a real browser does (occluded windows, back/forward cache),
 *   7. coverage that depends on CI wiring (this package's own suite runs on
 *      trunk only).
 */
export * from "./disposables"
export * from "./active-scope"
export * from "./page-showing"

/**
 * Type-level proof that `apiUrl`'s generic surface does what some-ui#1040
 * asks for: a path the server doesn't have, an unbound `:name`, or an extra
 * binding are all `tsc` errors, not runtime 404s discovered three days
 * later. Same convention as `apps/www/src/lib/intent/__type-fixtures__` (and
 * `@some-ui/intent-kit`'s own `src/__type-fixtures__`): part of the ordinary
 * `tsc --noEmit` run (excluded from `tsconfig.build.json`, so none of this
 * ships), not something vitest executes. Every `@ts-expect-error` below has
 * to be lying about a real error one line down, or TypeScript's own "unused
 * '@ts-expect-error' directive" diagnostic turns red - which is the actual
 * enforcement mechanism, same as the precedent this file follows.
 */

import { apiUrl, unversionedApiUrl } from ".."

// Static path, no params - compiles.
const staticPath = apiUrl("/api/v1/mood_events/stats")
void staticPath

// Parameterized path, the one placeholder bound - compiles.
const withParam = apiUrl("/api/v1/mood_events/:id", { id: "123" })
void withParam

// Two placeholders in one template, both bound - compiles.
const withTwoParams = apiUrl("/api/v1/sessions/:id/duplicate", { id: "123" })
void withTwoParams

// Typo'd path - not a member of ServerRoute at all.
// @ts-expect-error - "/api/v1/mood_evnts/:id" is not a ServerRoute
const typoPath = apiUrl("/api/v1/mood_evnts/:id", { id: "123" })
void typoPath

// Missing param - ":id" is a required placeholder, "{}" doesn't bind it.
// @ts-expect-error - missing the required "id" binding
const missingParam = apiUrl("/api/v1/mood_events/:id", {})
void missingParam

// Extra param - "extra" isn't a placeholder anywhere in the template.
const extraParam = apiUrl("/api/v1/mood_events/:id", {
  id: "123",
  // @ts-expect-error - "extra" is not a placeholder in "/api/v1/mood_events/:id"
  extra: "nope",
})
void extraParam

// Static path - a params argument is rejected outright (Params<P> is
// `never`, so the static-path signature takes no such argument at all).
// @ts-expect-error - "/api/v1/mood_events/stats" has no placeholder to bind
const staticWithParams = apiUrl("/api/v1/mood_events/stats", { id: "123" })
void staticWithParams

// Versioned/unversioned split: apiUrl only accepts ServerRoute.
// @ts-expect-error - "/health" is an UnversionedRoute, not a ServerRoute
const healthViaApiUrl = apiUrl("/health")
void healthViaApiUrl

// ...and unversionedApiUrl only accepts UnversionedRoute, symmetrically.
const health = unversionedApiUrl("/health")
void health

// @ts-expect-error - "/api/v1/sessions" is a ServerRoute, not an UnversionedRoute
const sessionsViaUnversioned = unversionedApiUrl("/api/v1/sessions")
void sessionsViaUnversioned

/**
 * The query definitions behind `hooks.ts`, factored out so a route `loader`
 * can start a fetch that a component will later read.
 *
 * ## Why this file exists at all
 *
 * Every route in this app used to fetch from inside its component body, so a
 * navigation was: render -> mount -> effect -> fetch. Nested levels
 * serialized, because a child's request could not start until its parent had
 * rendered. `defaultPreload: "intent"` preloaded route *code* and nothing
 * else, since there were no loaders for it to run.
 *
 * A loader needs the queryKey and the queryFn without a React render, and a
 * hook needs the same pair. Writing them twice is a cache that silently stops
 * updating the first time one copy drifts - the same reason `settingsKey` was
 * already exported for its optimistic writer. So the pairs live here once, as
 * `queryOptions` objects, and both callers spend them.
 *
 * The repository singletons live here too rather than in `hooks.ts`: they are
 * what the queryFns close over, and one module-scope instantiation is the
 * point (`sessions-backend.ts` runs a one-time migration on construction).
 */

import { queryOptions } from "@tanstack/react-query"

import { createProfileRepository } from "./profile-repository"
import { createSessionsBackend } from "./sessions-backend"
import type { SessionsStore } from "./sessions-repository"
import { createSettingsRepository } from "./settings-repository"
import type { SessionRecord, UserProfile, UserSettings } from "./types"

export const profileRepository = createProfileRepository()
export const settingsRepository = createSettingsRepository()
/**
 * `localStorage` on the Pages build, `file_host` everywhere else — and
 * nothing above this line knows which. That is the seam #923 swapped;
 * see `sessions-backend.ts`.
 */
export const sessionsRepository: SessionsStore = createSessionsBackend()

export const profileKey = ["tenant", "profile"] as const
/**
 * Exported so an optimistic writer (the audio indicator) can update the
 * cache in place rather than re-deriving this literal - a duplicated key
 * that drifts is a cache that silently stops updating.
 */
export const settingsKey = ["tenant", "settings"] as const
export const sessionsKey = ["tenant", "sessions"] as const
export const sessionKey = (id: string): readonly [string, string, string] =>
  ["tenant", "sessions", id] as const

/**
 * The three key-less queries are plain values rather than factories: there is
 * nothing to parameterise, so a `() =>` would only oblige every call site to
 * remember the parens. `sessionQuery` below takes an id and so stays a
 * function.
 */
export const profileQuery = queryOptions({
  queryKey: profileKey,
  queryFn: (): Promise<UserProfile> => profileRepository.get(),
})

export const settingsQuery = queryOptions({
  queryKey: settingsKey,
  queryFn: (): Promise<UserSettings> => settingsRepository.get(),
})

export const sessionsQuery = queryOptions({
  queryKey: sessionsKey,
  queryFn: (): Promise<Array<SessionRecord>> => sessionsRepository.list(),
  // Sessions are mutated from routes other than /sessions (composer,
  // live player), so an invalidated-but-inactive query has no observer
  // to pick up the refetch. Override the app-wide refetchOnMount:false
  // default here so navigating back to the list always shows the latest
  // data instead of requiring a hard refresh.
  //
  // This does not undo the prefetch a loader does: `refetchOnMount: true`
  // refetches a *stale* query, and the app-wide staleTime is 15 minutes, so
  // data a loader put in the cache a moment ago is read straight from it.
  refetchOnMount: true,
})

/**
 * Spelled out because the lint rule wants a return type and `queryOptions`'
 * own is branded (it carries the key type, which is how `getQueryData` infers
 * its result). Restating the branding by hand would defeat the point, so it is
 * derived from `queryOptions` itself.
 */
type SessionQueryOptions = ReturnType<
  typeof queryOptions<
    SessionRecord | null,
    Error,
    SessionRecord | null,
    ReturnType<typeof sessionKey>
  >
>

export const sessionQuery = (id: string): SessionQueryOptions =>
  queryOptions({
    queryKey: sessionKey(id),
    queryFn: (): Promise<SessionRecord | null> => sessionsRepository.get(id),
    enabled: id.length > 0,
    refetchOnMount: true,
  })

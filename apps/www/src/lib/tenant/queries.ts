/**
 * The query definitions behind `hooks.ts`, as `queryOptions` objects, so a
 * route `loader` can start a fetch a component later reads. One copy of each
 * key and queryFn: two copies drift into a cache that stops updating.
 *
 * The repository singletons live here too: the queryFns close over them.
 */

import { queryOptions } from "@tanstack/react-query"

import { createProfileRepository } from "./profile-repository"
import { createSessionsBackend } from "./sessions-backend"
import type { SessionsStore } from "./sessions-repository"
import type { TransferPreview } from "./sessions-transfer"
import { previewDeviceTransfer } from "./sessions-transfer"
import { createSettingsRepository } from "./settings-repository"
import type { SessionRecord, UserProfile, UserSettings } from "./types"

export const profileRepository = createProfileRepository()
export const settingsRepository = createSettingsRepository()
/**
 * `localStorage` on the Pages build, `file_host` everywhere else; see
 * `sessions-backend.ts`.
 */
export const sessionsRepository: SessionsStore = createSessionsBackend()

export const profileKey = ["tenant", "profile"] as const
/**
 * Exported so an optimistic writer (the audio indicator) can update the cache
 * in place rather than duplicating this key.
 */
export const settingsKey = ["tenant", "settings"] as const
export const sessionsKey = ["tenant", "sessions"] as const
export const sessionKey = (id: string): readonly [string, string, string] =>
  ["tenant", "sessions", id] as const

/**
 * The key-less queries are plain values, not factories: nothing to
 * parameterise. `sessionQuery` takes an id and so stays a function.
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
  // Sessions are mutated from other routes (composer, live player), where an
  // invalidated-but-inactive query has no observer, so override the app-wide
  // refetchOnMount:false. A loader's fresh prefetch is still read from cache
  // (staleTime is 15 minutes).
  refetchOnMount: true,
})

/**
 * Spelled out because the lint rule wants a return type, derived from
 * `queryOptions` to keep its key branding (how `getQueryData` infers).
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

export const transferPreviewKey = ["tenant", "transfer-preview"] as const

type TransferPreviewQueryOptions = ReturnType<
  typeof queryOptions<
    TransferPreview | null,
    Error,
    TransferPreview | null,
    readonly ["tenant", "transfer-preview", number]
  >
>

/**
 * What a press of "copy to my account" would send. Keyed by the authority's
 * epoch, so another account's answer is never shown, and never kept.
 */
export function transferPreviewQuery(
  epoch: number
): TransferPreviewQueryOptions {
  return queryOptions({
    queryKey: [...transferPreviewKey, epoch] as const,
    queryFn: (): Promise<TransferPreview | null> => previewDeviceTransfer(),
    staleTime: 0,
    gcTime: 0,
  })
}

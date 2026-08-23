import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import type { UseMutationResult, UseQueryResult } from "@tanstack/react-query"

import { useHasDecorativeSession } from "@/lib/auth-session"
import { reportSessionTransition } from "@/lib/study-nudge/signals"

import {
  profileKey,
  profileQuery,
  profileRepository,
  sessionKey,
  sessionQuery,
  sessionsKey,
  sessionsQuery,
  sessionsRepository,
  settingsKey,
  settingsQuery,
  settingsRepository,
} from "./queries"
import type {
  CreateSessionInput,
  UpdateSessionInput,
} from "./sessions-repository"
import type {
  SessionRecord,
  SessionStatus,
  UserProfile,
  UserSettings,
} from "./types"

// The queryKey/queryFn pairs these hooks read now live in `queries.ts`, so a
// route loader can start the same fetch before a component exists to ask for
// it. Everything below spends those definitions rather than restating them.
export { settingsKey } from "./queries"

/**
 * Every read hook below is `enabled` on this, not just the query options a
 * loader prefetches. A route loader never runs before the router's own
 * `beforeLoad` guard clears a location, so it needs no gate of its own - but
 * these hooks can also be called from outside the routed tree entirely (a
 * provider mounted above the router, a future one nobody has written yet),
 * where there is no route guard to rely on. Gating the read here, once,
 * means any caller gets it for free instead of each one having to remember
 * to ask "is there a session" before it fetches.
 *
 * This is a waste guard, not a security one: a `useQuery` that never fires
 * is a request this tab never had to make (and, upstream of that, a
 * provider that skips mounting the expensive thing this data feeds - see
 * `providers/index.tsx` and `providers/tts.tsx`). Whether the request would
 * have been *allowed* is the server's question, not this one.
 */
function useTenantQueriesEnabled(): boolean {
  return useHasDecorativeSession()
}

export function useProfile(): UseQueryResult<UserProfile> {
  const enabled = useTenantQueriesEnabled()
  return useQuery({ ...profileQuery, enabled })
}

export function useUpdateProfile(): UseMutationResult<
  UserProfile,
  Error,
  UserProfile
> {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (profile: UserProfile) => profileRepository.save(profile),
    onSuccess: (profile) => {
      queryClient.setQueryData(profileKey, profile)
    },
  })
}

export function useSettings(): UseQueryResult<UserSettings> {
  const enabled = useTenantQueriesEnabled()
  return useQuery({ ...settingsQuery, enabled })
}

export function useUpdateSettings(): UseMutationResult<
  UserSettings,
  Error,
  UserSettings
> {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (settings: UserSettings) => settingsRepository.save(settings),
    onSuccess: (settings) => {
      queryClient.setQueryData(settingsKey, settings)
    },
  })
}

export function useSessions(): UseQueryResult<Array<SessionRecord>> {
  const enabled = useTenantQueriesEnabled()
  return useQuery({ ...sessionsQuery, enabled })
}

export function useSession(id: string): UseQueryResult<SessionRecord | null> {
  const hasSession = useTenantQueriesEnabled()
  return useQuery({
    ...sessionQuery(id),
    enabled: hasSession && id.length > 0,
  })
}

export function useCreateSession(): UseMutationResult<
  SessionRecord,
  Error,
  CreateSessionInput
> {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateSessionInput) => sessionsRepository.create(input),
    onSuccess: (session) => {
      void queryClient.invalidateQueries({ queryKey: sessionsKey })
      // A new session is the opportunity a reminder can point at. See
      // `lib/study-nudge/signals` for why this is emitted here and not in
      // the repository.
      reportSessionTransition(session)
    },
  })
}

export function useUpdateSession(): UseMutationResult<
  SessionRecord,
  Error,
  { id: string; patch: UpdateSessionInput },
  { previous: SessionRecord | undefined }
> {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, patch }) => sessionsRepository.update(id, patch),
    // Captured before the write, because after it the cache holds the new
    // record and the transition is unrecoverable. Only a *change* of status
    // is a behaviour worth reporting: without the before, renaming a
    // running session would report "they sat down" all over again and
    // silently inflate the engagement the server is measuring.
    onMutate: ({ id }) => ({
      previous: queryClient.getQueryData<SessionRecord>(sessionKey(id)),
    }),
    onSuccess: (session, _variables, context) => {
      void queryClient.invalidateQueries({ queryKey: sessionsKey })
      queryClient.setQueryData(sessionKey(session.id), session)
      // No `previous` means the single-session query was never populated —
      // an update from a list view. Reporting a provisioning for it would
      // be wrong, so `signalForTransition` is only given what is known.
      if (context.previous) {
        reportSessionTransition(session, context.previous)
      }
    },
  })
}

export function useDeleteSession(): UseMutationResult<void, Error, string> {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => sessionsRepository.remove(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: sessionsKey })
    },
  })
}

export function useDuplicateSession(): UseMutationResult<
  SessionRecord,
  Error,
  string
> {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => sessionsRepository.duplicate(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: sessionsKey })
    },
  })
}

export function useDeleteManySessions(): UseMutationResult<
  void,
  Error,
  ReadonlyArray<string>
> {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (ids: ReadonlyArray<string>) =>
      sessionsRepository.removeMany(ids),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: sessionsKey })
    },
  })
}

export function useUpdateStatusManySessions(): UseMutationResult<
  Array<SessionRecord>,
  Error,
  { ids: ReadonlyArray<string>; status: SessionStatus }
> {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ ids, status }) =>
      sessionsRepository.updateStatusMany(ids, status),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: sessionsKey })
      // Deliberately silent. A bulk status change is housekeeping from the
      // list view - marking six drafts as scheduled is not six people
      // sitting down - and reporting it would put behaviour the server
      // trusts on an administrative action.
    },
  })
}

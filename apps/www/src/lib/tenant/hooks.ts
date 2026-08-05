import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import type { UseMutationResult, UseQueryResult } from "@tanstack/react-query"

import { reportSessionTransition } from "../study-nudge/signals"
import { createProfileRepository } from "./profile-repository"
import { createSessionsBackend } from "./sessions-backend"
import type {
  CreateSessionInput,
  UpdateSessionInput,
} from "./sessions-repository"
import { createSettingsRepository } from "./settings-repository"
import type {
  SessionRecord,
  SessionStatus,
  UserProfile,
  UserSettings,
} from "./types"

const profileRepository = createProfileRepository()
const settingsRepository = createSettingsRepository()
/**
 * `localStorage` on the Pages build, `file_host` everywhere else — and
 * nothing above this line knows which. That is the seam #923 swapped;
 * see `sessions-backend.ts`.
 */
const sessionsRepository = createSessionsBackend()

const profileKey = ["tenant", "profile"] as const
/**
 * Exported so an optimistic writer (the audio indicator) can update the
 * cache in place rather than re-deriving this literal - a duplicated key
 * that drifts is a cache that silently stops updating.
 */
export const settingsKey = ["tenant", "settings"] as const
const sessionsKey = ["tenant", "sessions"] as const
const sessionKey = (id: string): readonly [string, string, string] =>
  ["tenant", "sessions", id] as const

export function useProfile(): UseQueryResult<UserProfile> {
  return useQuery({
    queryKey: profileKey,
    queryFn: () => profileRepository.get(),
  })
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
  return useQuery({
    queryKey: settingsKey,
    queryFn: () => settingsRepository.get(),
  })
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
  return useQuery({
    queryKey: sessionsKey,
    queryFn: () => sessionsRepository.list(),
    // Sessions are mutated from routes other than /sessions (composer,
    // live player), so an invalidated-but-inactive query has no observer
    // to pick up the refetch. Override the app-wide refetchOnMount:false
    // default here so navigating back to the list always shows the latest
    // data instead of requiring a hard refresh.
    refetchOnMount: true,
  })
}

export function useSession(id: string): UseQueryResult<SessionRecord | null> {
  return useQuery({
    queryKey: sessionKey(id),
    queryFn: () => sessionsRepository.get(id),
    enabled: id.length > 0,
    refetchOnMount: true,
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

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import type { UseMutationResult, UseQueryResult } from "@tanstack/react-query"

import { useAuthority } from "@/lib/authority"
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
  transferPreviewKey,
  transferPreviewQuery,
} from "./queries"
import type {
  CreateSessionInput,
  UpdateSessionInput,
} from "./sessions-repository"
import type { TransferNotices, TransferPreview } from "./sessions-transfer"
import { copyDeviceSessionsAndRefresh } from "./sessions-transfer"
import type {
  SessionRecord,
  SessionStatus,
  UserProfile,
  UserSettings,
} from "./types"

// The queryKey/queryFn pairs live in `queries.ts`, shared with route loaders.
export { settingsKey } from "./queries"

/**
 * Every read hook is `enabled` on this: loaders run behind `beforeLoad`
 * guards, but these hooks can be called outside the routed tree.
 *
 * It waits for the data authority to be *decided* (`lib/authority`): a
 * returning account user's is undecided until their session is checked, and
 * reading before then would flash the wrong store. A waste guard, not a
 * security one.
 */
function useTenantQueriesEnabled(): boolean {
  return useAuthority().kind !== "pending"
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
      // A new session is the opportunity a reminder can point at
      // (`lib/study-nudge/signals`).
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
    // Captured before the write: afterwards the transition is lost. Only a
    // *change* of status is reported, or renaming a running session would
    // report "they sat down" again.
    onMutate: ({ id }) => ({
      previous: queryClient.getQueryData<SessionRecord>(sessionKey(id)),
    }),
    onSuccess: (session, _variables, context) => {
      void queryClient.invalidateQueries({ queryKey: sessionsKey })
      queryClient.setQueryData(sessionKey(session.id), session)
      // No `previous`: the single-session query was never populated (an
      // update from a list view), so no provisioning is reported.
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
      // Deliberately silent: a bulk status change is list-view housekeeping,
      // not behaviour.
    },
  })
}

/**
 * How many of this device's sessions are not yet in the account in use, for the
 * screen that offers to copy them. Asks nothing while learning on the device.
 */
export function useTransferPreview(): UseQueryResult<TransferPreview | null> {
  const { kind, epoch } = useAuthority()
  return useQuery({
    ...transferPreviewQuery(epoch),
    enabled: kind === "account",
  })
}

/**
 * The action behind the "copy to my account" confirmation: copy, refresh what
 * the screens read, and say what happened. The one place the transfer is
 * started from (invariant LA2), and called only by that button.
 */
export function useCopyDeviceSessions(): (
  notices: TransferNotices
) => Promise<void> {
  const queryClient = useQueryClient()
  return (notices) =>
    copyDeviceSessionsAndRefresh(
      () =>
        Promise.all([
          queryClient.invalidateQueries({ queryKey: sessionsKey }),
          queryClient.invalidateQueries({ queryKey: transferPreviewKey }),
        ]),
      notices
    )
}

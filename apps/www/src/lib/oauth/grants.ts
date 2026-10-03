/**
 * Settings → Connected AI services: the services this account allowed, and
 * disconnecting one, which ends its tokens on the server at once.
 *
 * The client is made per call, not once: its transport is the account's and
 * is issued under the authority current when it is made
 * (`createFileHostTransport`). With no account to ask, the list is empty.
 */
import type { UseMutationResult, UseQueryResult } from "@tanstack/react-query"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import type { ConnectedService } from "./client"
import { createGrantsClient } from "./client"

const grantsKey = ["oauth", "grants"] as const

const NONE: ReadonlyArray<ConnectedService> = []

export function useConnectedServices(): UseQueryResult<
  ReadonlyArray<ConnectedService>
> {
  return useQuery({
    queryKey: grantsKey,
    queryFn: () => createGrantsClient()?.list() ?? Promise.resolve(NONE),
  })
}

export function useDisconnectService(): UseMutationResult<void, Error, string> {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (grant: string) =>
      createGrantsClient()?.disconnect(grant) ?? Promise.resolve(),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: grantsKey })
    },
  })
}

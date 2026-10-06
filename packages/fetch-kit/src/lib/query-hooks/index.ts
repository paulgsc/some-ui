/**
 * @module api-hooks
 *
 * Type-safe query/mutation hook factory for standard 1:1 REST patterns
 * (one endpoint -> one hook).
 *
 * Not a fit for two cases; reach for `useQuery`/`useMutation` directly instead:
 * 1. Client-side projection — `queryKey` is derived from *all* params, so
 *    passing a param that isn't part of the URL (e.g. an array index) creates
 *    redundant cache entries and extra fetches.
 * 2. Shared cache / derived views — no `select` support, so several hooks that
 *    need the same underlying data can't share a stable `queryKey`.
 *
 * See ADR "TanStack Query Integration Strategy" (2026-02-13).
 */

import type { FetchClient, HttpMethod } from "@fkit/lib/fetch-client"
import { apiClient } from "@fkit/lib/fetch-client"
import type {
  DefaultOptions,
  UseMutationOptions,
  UseMutationResult,
  UseQueryOptions,
  UseQueryResult,
} from "@tanstack/react-query"
import { useMutation, useQuery } from "@tanstack/react-query"
import type { z } from "zod"

type QueriesDefaultOptions<TData, TError> = DefaultOptions<TError>["queries"] &
  Omit<UseQueryOptions<TData, TError>, "queryKey" | "queryFn">

type QueryHookFactory = {
  createQueryHook: <TData, TError = unknown>(
    endpoint: URL,
    schema: z.ZodType<TData>,
    method?: HttpMethod,
    defaultOptions?: QueriesDefaultOptions<TData, TError>
  ) => (
    params?: Record<string, string | number>,
    options?: Omit<UseQueryOptions<TData, TError>, "queryKey" | "queryFn">
  ) => UseQueryResult<TData, TError>

  createMutationHook: <TData, TVariables, TError = unknown>(
    endpoint: URL,
    schema: z.ZodType<TData>,
    method?: HttpMethod,
    defaultOptions?: Omit<
      UseMutationOptions<TData, TError, TVariables>,
      "mutationFn"
    >
  ) => (
    params?: Record<string, string | number>,
    options?: Omit<UseMutationOptions<TData, TError, TVariables>, "mutationFn">
  ) => UseMutationResult<TData, TError, TVariables>
}

export const createApiHooks = (
  client: FetchClient = apiClient
): QueryHookFactory => {
  return {
    createQueryHook: <TData, TError = unknown>(
      endpoint: URL,
      schema: z.ZodType<TData>,
      method: HttpMethod = "GET",
      defaultOptions: Omit<
        UseQueryOptions<TData, TError>,
        "queryKey" | "queryFn"
      > = {}
    ) => {
      return (
        params: Record<string, string | number> = {},
        options: Omit<
          UseQueryOptions<TData, TError>,
          "queryKey" | "queryFn"
        > = {}
      ) => {
        // A copy, so the shared URL is not mutated.
        const url = new URL(endpoint.toString())
        const pathParams: Record<string, string> = {}

        Object.entries(params).forEach(([key, value]) => {
          const placeholder = `:${key}`
          const pathTemplate = url.pathname

          if (pathTemplate.includes(placeholder)) {
            url.pathname = pathTemplate.replace(placeholder, String(value))
            pathParams[key] = String(value)
          } else {
            url.searchParams.append(key, String(value))
          }
        })

        // The key couples the cache to every param, so a param not in the URL
        // still causes extra fetches (see the module doc).
        const queryKey = [endpoint.toString(), params]

        return useQuery<TData, TError>({
          queryKey,
          queryFn: async () => {
            const response = await client.createQueryFn<TData>(
              url,
              method,
              {},
              schema
            )()
            return response
          },
          ...defaultOptions,
          ...options,
        })
      }
    },

    createMutationHook: <TData, TVariables, TError = unknown>(
      endpoint: URL,
      schema: z.ZodType<TData>,
      method: HttpMethod = "POST",
      defaultOptions: Omit<
        UseMutationOptions<TData, TError, TVariables>,
        "mutationFn"
      > = {}
    ) => {
      return (
        params: Record<string, string | number> = {},
        options: Omit<
          UseMutationOptions<TData, TError, TVariables>,
          "mutationFn"
        > = {}
      ) => {
        // A copy, so the shared URL is not mutated.
        const url = new URL(endpoint.toString())

        Object.entries(params).forEach(([key, value]) => {
          const placeholder = `:${key}`
          if (url.pathname.includes(placeholder)) {
            url.pathname = url.pathname.replace(placeholder, String(value))
          }
        })

        return useMutation<TData, TError, TVariables>({
          mutationFn: async (variables: TVariables) => {
            return client.createMutationFn<TData, TVariables>(
              url,
              method,
              {},
              schema
            )(variables)
          },
          ...defaultOptions,
          ...options,
        })
      }
    },
  }
}

export const apiHooks = createApiHooks()

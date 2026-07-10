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

import type {
  DefaultOptions,
  UseMutationOptions,
  UseMutationResult,
  UseQueryOptions,
  UseQueryResult,
} from "@tanstack/react-query"
import { useMutation, useQuery } from "@tanstack/react-query"
import type { z } from "zod"

import type { FetchClient, HttpMethod } from "./fetch-client"
import { apiClient } from "./fetch-client"

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
    /**
     * Create a type-safe hook for data fetching with React Query
     */
    createQueryHook: <TData, TError = unknown>(
      endpoint: URL,
      schema: z.ZodType<TData>,
      method: HttpMethod = "GET",
      defaultOptions: Omit<
        UseQueryOptions<TData, TError>,
        "queryKey" | "queryFn"
      > = {}
    ) => {
      // Actual hook function that consumers will use
      return (
        params: Record<string, string | number> = {},
        options: Omit<
          UseQueryOptions<TData, TError>,
          "queryKey" | "queryFn"
        > = {}
      ) => {
        // Clone the URL to avoid modifying the original
        const url = new URL(endpoint.toString())
        const pathParams: Record<string, string> = {}

        // Process path parameters and query parameters
        Object.entries(params).forEach(([key, value]) => {
          const placeholder = `:${key}`
          const pathTemplate = url.pathname

          if (pathTemplate.includes(placeholder)) {
            // Handle path parameters
            url.pathname = pathTemplate.replace(placeholder, String(value))
            pathParams[key] = String(value)
          } else {
            // Handle query parameters
            url.searchParams.append(key, String(value))
          }
        })

        /**
         * ⚠️ REFACTOR NOTE:
         * The queryKey below couples the cache to EVERY parameter.
         * If 'params' contains values not used in the URL, this hook
         * will trigger unnecessary network requests.
         */
        // Create query key based on endpoint and params
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

    /**
     * Create a type-safe hook for data mutations with React Query
     */
    createMutationHook: <TData, TVariables, TError = unknown>(
      endpoint: URL,
      schema: z.ZodType<TData>,
      method: HttpMethod = "POST",
      defaultOptions: Omit<
        UseMutationOptions<TData, TError, TVariables>,
        "mutationFn"
      > = {}
    ) => {
      // Actual hook function that consumers will use
      return (
        params: Record<string, string | number> = {},
        options: Omit<
          UseMutationOptions<TData, TError, TVariables>,
          "mutationFn"
        > = {}
      ) => {
        // Clone the URL to avoid modifying the original
        const url = new URL(endpoint.toString())

        // Replace URL parameters in the pathname
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

// Export default hooks factory using the default API client
export const apiHooks = createApiHooks()

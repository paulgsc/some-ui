import type {
  UseMutationOptions,
  UseMutationResult,
  UseQueryOptions,
  UseQueryResult,
} from "@tanstack/react-query"
import { useMutation, useQuery } from "@tanstack/react-query"
import type { z } from "zod"

import type { FetchClient, HttpMethod } from "./fetch-client"
import { apiClient } from "./fetch-client"

/**
 * Type-safe generic fetch hook creator for React Query
 */
type QueryHookFactory = {
  createQueryHook: <TData, TError = unknown>(
    endpoint: string,
    schema: z.ZodType<TData>,
    method?: HttpMethod,
    defaultOptions?: Omit<
      UseQueryOptions<TData, TError>,
      "queryKey" | "queryFn"
    >
  ) => (
    params?: Record<string, string | number>,
    options?: Omit<UseQueryOptions<TData, TError>, "queryKey" | "queryFn">
  ) => UseQueryResult<TData, TError>

  createMutationHook: <TData, TVariables, TError = unknown>(
    endpoint: string,
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
      endpoint: string,
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
        // Replace URL parameters (e.g., /users/:id -> /users/123)
        let url = endpoint
        const queryParams: Record<string, string> = {}

        // Process params, separating path params from query params
        Object.entries(params).forEach(([key, value]) => {
          const placeholder = `:${key}`
          if (url.includes(placeholder)) {
            url = url.replace(placeholder, String(value))
          } else {
            queryParams[key] = String(value)
          }
        })

        // Add query string if there are query parameters
        if (Object.keys(queryParams).length > 0) {
          const searchParams = new URLSearchParams()
          Object.entries(queryParams).forEach(([key, value]) => {
            searchParams.append(key, value)
          })
          url = `${url}?${searchParams.toString()}`
        }

        // Create query key based on endpoint and params
        const queryKey = [endpoint, params]

        return useQuery<TData, TError>({
          queryKey,
          queryFn: async () => {
            const response = await client.createQueryFn<TData>(
              new URL(url),
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
      endpoint: string,
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
        // Replace URL parameters (e.g., /users/:id -> /users/123)
        let url = endpoint

        Object.entries(params).forEach(([key, value]) => {
          const placeholder = `:${key}`
          if (url.includes(placeholder)) {
            url = url.replace(placeholder, String(value))
          }
        })

        return useMutation<TData, TError, TVariables>({
          mutationFn: async (variables: TVariables) => {
            return client.createMutationFn<TData, TVariables>(
              new URL(url),
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

import type {
  UseMutationOptions,
  UseMutationResult,
  UseQueryOptions,
  UseQueryResult,
} from "@tanstack/react-query"
import { useMutation, useQuery } from "@tanstack/react-query"
import type { z } from "zod"

import type { FetchClient, FetchOptions, HttpMethod } from "./fetch-client"
import { apiClient } from "./fetch-client"

type QueryHookFactory = {
  createQueryHook: <TData, TError = unknown>(
    endpoint: URL,
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

  createStreamHook: (
    endpoint: URL,
    options?: Omit<
      FetchOptions,
      "method" | "body" | "onData" | "chunkSchema"
    > & {
      onData: (chunk: Uint8Array) => void
      chunkSchema?: z.ZodType
    }
  ) => () => void
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

    createStreamHook: (
      endpoint: URL,
      options: Omit<
        FetchOptions,
        "method" | "body" | "onData" | "chunkSchema"
      > & {
        onData: (chunk: Uint8Array) => void
        chunkSchema?: z.ZodType
      }
    ) => {
      return () => {
        const { onData, chunkSchema, ...fetchOptions } = options

        // Use a unique query key for the stream
        const queryKey = [endpoint.toString(), "stream"]

        //  Use useQuery, but we're not returning data in the traditional sense.
        useQuery<void, ApiError, void>({
          // TData is void, we're handling data via onData
          queryKey,
          queryFn: async () => {
            // Call the stream method from the client
            try {
              await client.stream(endpoint, {
                ...fetchOptions,
                onData,
                chunkSchema,
              })
              // The stream method doesn't return a value, so we return undefined
              return undefined
            } catch (error) {
              //  Important:  Wrap non-ApiError errors.
              if (error instanceof ApiError) {
                throw error //  Don't wrap ApiErrors, re-throw them.
              }
              throw new ApiError(
                error instanceof Error ? error.message : "Stream failed",
                500, //  Use a generic server error code.
                undefined,
                false,
                false
              )
            }
          },
          //  Set these to prevent retries and caching.  Streaming is typically a
          //  real-time operation, not something you want to retry or cache.
          retry: false,
          cacheTime: 0,
          staleTime: 0,
          //  Override any user-provided values for these.
          ...{
            retry: false,
            cacheTime: 0,
            staleTime: 0,
          },
        })
      }
    },
  }
}

// Export default hooks factory using the default API client
export const apiHooks = createApiHooks()

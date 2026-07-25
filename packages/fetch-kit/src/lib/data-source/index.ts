/**
 * @module data-source
 *
 * A resource that can live in two places depending on how the app is
 * running: bundled as a static asset (a GitHub Pages release, no backend)
 * or served by a local companion server (a localhost dev session). Callers
 * ask for the resource once, through one API - `DataSource` picks the
 * right URL internally and the caller never branches on, or is told,
 * which mode answered the request. Errors surface as the same `ApiError`
 * shape either way, so nothing about the underlying mode leaks into UI
 * copy or error handling.
 */

import { apiClient } from "@fkit/lib/fetch-client"
import type { FetchClient, FetchOptions } from "@fkit/lib/fetch-client"
import type { RuntimeMode, RuntimeModeOptions } from "@fkit/lib/runtime-mode"
import { resolveRuntimeMode } from "@fkit/lib/runtime-mode"
import type {
  QueryKey,
  UseQueryOptions,
  UseQueryResult,
} from "@tanstack/react-query"
import { useQuery } from "@tanstack/react-query"
import type { z } from "zod"

export type ResourceLocator<TParams> = (params: TParams) => URL

/** One URL builder per mode - the only place mode-specific detail lives. */
export type DataSourceEndpoints<TParams> = Record<
  RuntimeMode,
  ResourceLocator<TParams>
>

export type DataSourceOptions = RuntimeModeOptions & {
  client?: FetchClient
  fetchOptions?: Omit<FetchOptions, "method" | "body">
}

export type DataSource<TParams, TData, TError = unknown> = {
  /** The mode this data source resolved to, for diagnostics only - not meant for UI branching. */
  mode: RuntimeMode
  fetch: (params: TParams, schema?: z.ZodType<TData>) => Promise<TData>
  useResource: (
    queryKey: QueryKey,
    params: TParams,
    schema?: z.ZodType<TData>,
    options?: Omit<UseQueryOptions<TData, TError>, "queryKey" | "queryFn">
  ) => UseQueryResult<TData, TError>
}

/**
 * Creates a mode-aware data source. `endpoints` supplies one URL builder per
 * mode; everything else about fetching (retries, timeouts, zod validation,
 * error shape) is identical across modes because both paths go through the
 * same `FetchClient`.
 *
 * The query-hook side takes an explicit `queryKey` rather than deriving one
 * from `params`, matching this package's stance (see `query-hooks.ts`) that
 * shared-cache/derived-view domains shouldn't use a params-derived key.
 */
export function createDataSource<TParams, TData, TError = unknown>(
  endpoints: DataSourceEndpoints<TParams>,
  options: DataSourceOptions = {}
): DataSource<TParams, TData, TError> {
  const mode = resolveRuntimeMode(options)
  const client = options.client ?? apiClient
  const locate = endpoints[mode]

  const fetchResource = (
    params: TParams,
    schema?: z.ZodType<TData>
  ): Promise<TData> =>
    client.get<TData>(locate(params), options.fetchOptions, schema)

  return {
    mode,
    fetch: fetchResource,
    useResource: (queryKey, params, schema, queryOptions = {}) =>
      useQuery<TData, TError>({
        queryKey,
        queryFn: () => fetchResource(params, schema),
        ...queryOptions,
      }),
  }
}

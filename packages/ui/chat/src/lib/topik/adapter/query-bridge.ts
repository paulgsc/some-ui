/**
 * Query Bridge - Connects FSM to TanStack Query
 *
 * This adapter allows the FSM to trigger queries and observe their state
 * without owning the fetch lifecycle
 */

import type {
  ConversationBatch,
  IQueryBridge,
  TopikManifestFile,
} from "@chat/lib/topik"
import type { QueryClient } from "@tanstack/react-query"

import { metadataKeys } from "./topik-metadata-queries"
import { topikKeys } from "./topik-queries"

export class QueryBridge implements IQueryBridge {
  constructor(
    private readonly queryClient: QueryClient,
    private readonly catalogQueryFn: () => Promise<TopikManifestFile>,
    private readonly topikQueryFn: (
      key: string
    ) => Promise<Array<ConversationBatch>>
  ) {}

  triggerCatalogQuery() {
    const state = this.queryClient.getQueryState(metadataKeys.manifest())

    // If not fetching, trigger fetch
    if (!state?.fetchStatus || state.fetchStatus === "idle") {
      this.queryClient.prefetchQuery({
        queryKey: metadataKeys.manifest(),
        queryFn: this.catalogQueryFn,
      })
    }

    return {
      isLoading: state?.fetchStatus === "fetching",
      isError: state?.status === "error",
      error: state?.error as Error | null,
    }
  }

  triggerTopikQuery(key: string) {
    const queryKey = topikKeys.detail(key)
    const state = this.queryClient.getQueryState(queryKey)

    // If not fetching, trigger fetch
    if (!state?.fetchStatus || state.fetchStatus === "idle") {
      this.queryClient.prefetchQuery({
        queryKey,
        queryFn: () => this.topikQueryFn(key),
      })
    }

    return {
      isLoading: state?.fetchStatus === "fetching",
      isError: state?.status === "error",
      error: state?.error as Error | null,
      data: state?.data as Array<ConversationBatch> | undefined,
    }
  }

  getCachedTopik(key: string): Array<ConversationBatch> | undefined {
    return this.queryClient.getQueryData<Array<ConversationBatch>>(
      topikKeys.detail(key)
    )
  }
}

export function createQueryBridge(
  queryClient: QueryClient,
  catalogQueryFn: () => Promise<TopikManifestFile>,
  topikQueryFn: (key: string) => Promise<Array<ConversationBatch>>
): IQueryBridge {
  return new QueryBridge(queryClient, catalogQueryFn, topikQueryFn)
}

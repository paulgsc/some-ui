/**
 * Query Bridge - Connects FSM to TanStack Query
 *
 * Model 1: FSM owns lifecycle, TanStack provides cache + dedupe
 * Bridge executes fetches and returns promises - no state inspection
 */

import type { QueryClient } from "@tanstack/react-query"
import type {
  ConversationBatch,
  IQueryBridge,
  TopikManifestFile,
} from "@topik/lib/topik"

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

  /**
   * Execute catalog fetch
   * Returns promise that resolves with data or rejects with error
   */
  async fetchCatalog(): Promise<TopikManifestFile> {
    return this.queryClient.fetchQuery({
      queryKey: metadataKeys.manifest(),
      queryFn: this.catalogQueryFn,
    })
  }

  /**
   * Execute topik fetch
   * Returns promise that resolves with data or rejects with error
   */
  async fetchTopik(key: string): Promise<Array<ConversationBatch>> {
    return this.queryClient.fetchQuery({
      queryKey: topikKeys.detail(key),
      queryFn: () => this.topikQueryFn(key),
    })
  }

  /**
   * Get cached topik data (read-only accessor)
   * Used by selectors, not for flow control
   */
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

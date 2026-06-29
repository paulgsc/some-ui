/**
 * Topik Query Hooks - TanStack Query Integration
 *
 */

import type { ConversationBatch, ITopikRepository } from "@chat/lib/topik"
import type {
  QueryClient,
  UseQueryOptions,
  UseQueryResult,
} from "@tanstack/react-query"
import { useQuery, useQueryClient } from "@tanstack/react-query"

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export type BatchMetadata = {
  id: number
  messageCount: number
  questionCount: number
}

// ═══════════════════════════════════════════════════════════════════════════
// QUERY KEYS
// ═══════════════════════════════════════════════════════════════════════════

export const topikKeys = {
  all: ["topik"] as const,
  detail: (key: string) => ["topik", key] as const,
}

// ═══════════════════════════════════════════════════════════════════════════
// HOOKS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Load topik batches with caching and deduplication
 *
 * INVARIANTS ENFORCED BY TANSTACK QUERY:
 * - V5: Idempotent hydration (automatic)
 * - V6: Remount stability (queryKey-based)
 * - V8: Race safety (built-in deduplication)
 * - V12: Memory boundedness (gcTime config)
 */
export function useTopikBatches(
  repository: ITopikRepository,
  key: string,
  options?: Omit<
    UseQueryOptions<Array<ConversationBatch>>,
    "queryKey" | "queryFn"
  >
): UseQueryResult<Array<ConversationBatch>> {
  return useQuery<Array<ConversationBatch>>({
    queryKey: topikKeys.detail(key),
    queryFn: () => repository.load(key),
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes (formerly cacheTime)
    retry: 2,
    ...options,
  })
}

/**
 * Get batch metadata without full content
 * V13: Lazy materialization via select
 */
export function useTopikBatchMetadata(
  repository: ITopikRepository,
  key: string,
  batchIndex: number,
  options?: Omit<
    UseQueryOptions<Array<ConversationBatch>, Error, BatchMetadata | null>,
    "queryKey" | "queryFn" | "select"
  >
): UseQueryResult<BatchMetadata | null> {
  return useQuery<Array<ConversationBatch>, Error, BatchMetadata | null>({
    queryKey: topikKeys.detail(key),
    queryFn: () => repository.load(key),
    select: (batches: Array<ConversationBatch>) => {
      const batch = batches[batchIndex]
      if (!batch) return null

      return {
        id: batch.id, // ensure type matches BatchMetadata
        messageCount: batch.messages.length,
        questionCount: batch.questions.length,
      }
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    ...options,
  })
}

/**
 * Get current batch by index
 * V13: O(1) access via select projection
 */
export function useTopikCurrentBatch(
  repository: ITopikRepository,
  key: string,
  batchIndex: number,
  options?: Omit<
    UseQueryOptions<Array<ConversationBatch>, Error, ConversationBatch | null>,
    "queryKey" | "queryFn" | "select"
  >
): UseQueryResult<ConversationBatch | null> {
  return useQuery<Array<ConversationBatch>, Error, ConversationBatch | null>({
    queryKey: topikKeys.detail(key),
    queryFn: () => repository.load(key),
    select: (batches: Array<ConversationBatch>) => batches[batchIndex] ?? null,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    ...options,
  })
}

/**
 * Prefetch topik data (for preloading)
 *
 * Usage:
 * const prefetch = usePrefetchTopik(repository)
 * await prefetch("topik-key")
 */
export function usePrefetchTopik(repository: ITopikRepository) {
  const queryClient = useQueryClient()

  return async (key: string) => {
    await queryClient.prefetchQuery({
      queryKey: topikKeys.detail(key),
      queryFn: () => repository.load(key),
      staleTime: 5 * 60 * 1000,
    })
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// IMPERATIVE API (for non-hook contexts)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get cached batches synchronously
 * Returns undefined if not in cache
 *
 * WARNING: Only use in contexts where hooks cannot be used
 */
export function getCachedTopikBatches(
  queryClient: QueryClient,
  key: string
): Array<ConversationBatch> | undefined {
  return queryClient.getQueryData<Array<ConversationBatch>>(
    topikKeys.detail(key)
  )
}

/**
 * Invalidate topik cache
 * Triggers refetch on next access
 */
export function invalidateTopik(
  queryClient: QueryClient,
  key?: string
): Promise<void> {
  if (key) {
    return queryClient.invalidateQueries({
      queryKey: topikKeys.detail(key),
    })
  }

  return queryClient.invalidateQueries({
    queryKey: topikKeys.all,
  })
}

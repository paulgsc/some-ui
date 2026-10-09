/** TanStack Query hooks for topik batches. */

import type { UseQueryOptions, UseQueryResult } from "@tanstack/react-query"
import { useQuery } from "@tanstack/react-query"
import type { ConversationBatch, ITopikRepository } from "@topik/lib/topik"

// TYPES

export type BatchMetadata = {
  id: number
  messageCount: number
  questionCount: number
}

// QUERY KEYS

export const topikKeys = {
  all: ["topik"] as const,
  detail: (key: string) => ["topik", key] as const,
}

// HOOKS

/** V13: batch metadata without full content, via select. */
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
    select: (batches) => {
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

/** V13: O(1) access to one batch via select projection. */
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
    select: (batches) => batches[batchIndex] ?? null,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    ...options,
  })
}

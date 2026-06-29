/**
 * Topik Metadata Query Hooks
 *
 * TanStack Query integration for metadata listing.
 * These hooks are ONLY for React components that need reactive query state.
 * The FSM accesses data via QueryClient directly (see session-selectors.ts).
 */

import type {
  ITopikMetadataRepository,
  TopikManifest,
  TopikMetadata,
} from "@chat/lib/topik"
import type { UseQueryOptions, UseQueryResult } from "@tanstack/react-query"
import { useQuery } from "@tanstack/react-query"

// ═══════════════════════════════════════════════════════════════════════════
// QUERY KEYS
// ═══════════════════════════════════════════════════════════════════════════

export const metadataKeys = {
  all: ["topik-metadata"] as const,
  manifest: () => [...metadataKeys.all, "manifest"] as const,
}

// ═══════════════════════════════════════════════════════════════════════════
// HOOKS (React Components Only)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Load topik manifest with metadata for all available topiks
 *
 * NOTE: The FSM does NOT use this hook. It accesses cached data via
 * getAvailableTopiks(queryClient) in session-selectors.ts.
 *
 * Use this hook in React components that need:
 * - Loading states
 * - Error states
 * - Automatic refetching
 */
export function useTopikManifest(
  repository: ITopikMetadataRepository,
  options?: Omit<UseQueryOptions<TopikManifest>, "queryKey" | "queryFn">
): UseQueryResult<TopikManifest> {
  return useQuery<TopikManifest>({
    queryKey: metadataKeys.manifest(),
    queryFn: () => repository.loadCatalog(),
    staleTime: 10 * 60 * 1000, // 10 minutes
    gcTime: 30 * 60 * 1000, // 30 minutes
    retry: 2,
    ...options,
  })
}

/**
 * Get sorted list of topik metadata items
 *
 * Convenience hook that transforms manifest into sorted array.
 * Useful for selection UI components.
 */
export function useTopikMetadataList(
  repository: ITopikMetadataRepository,
  options?: Omit<
    UseQueryOptions<TopikManifest, Error, Array<TopikMetadata>>,
    "queryKey" | "queryFn" | "select"
  >
): UseQueryResult<Array<TopikMetadata>> {
  return useQuery<TopikManifest, Error, Array<TopikMetadata>>({
    queryKey: metadataKeys.manifest(),
    queryFn: () => repository.loadCatalog(),
    select: (manifest: TopikManifest) =>
      [...manifest.topiks].sort((a, b) =>
        a.displayName.localeCompare(b.displayName)
      ),
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    retry: 2,
    ...options,
  })
}

/**
 * Get metadata for specific topik
 *
 * Useful for detail views or validation.
 * Returns undefined if topik not found in manifest.
 */
export function useTopikMetadata(
  repository: ITopikMetadataRepository,
  key: string,
  options?: Omit<
    UseQueryOptions<TopikManifest, Error, TopikMetadata | undefined>,
    "queryKey" | "queryFn" | "select"
  >
): UseQueryResult<TopikMetadata | undefined> {
  return useQuery<TopikManifest, Error, TopikMetadata | undefined>({
    queryKey: metadataKeys.manifest(),
    queryFn: () => repository.loadCatalog(),
    select: (manifest: TopikManifest) => manifest.topiks.find((t: TopikMetadata) => t.key === key),
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    retry: 2,
    ...options,
  })
}

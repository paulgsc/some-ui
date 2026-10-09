/**
 * TanStack Query hooks for the metadata listing, for React components that
 * need reactive query state; the FSM does not use them.
 */

import type { UseQueryOptions, UseQueryResult } from "@tanstack/react-query"
import { useQuery } from "@tanstack/react-query"
import type {
  ITopikMetadataRepository,
  TopikManifest,
  TopikMetadata,
} from "@topik/lib/topik"

// QUERY KEYS

export const metadataKeys = {
  all: ["topik-metadata"] as const,
  manifest: () => [...metadataKeys.all, "manifest"] as const,
}

// HOOKS (React Components Only)

/** The manifest's items, sorted, for selection UIs. */
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
    select: (manifest) =>
      [...manifest.topiks].sort((a, b) =>
        a.displayName.localeCompare(b.displayName)
      ),
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    retry: 2,
    ...options,
  })
}

/** One topik's metadata, or undefined when the manifest lacks it. */
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
    select: (manifest) => manifest.topiks.find((t) => t.key === key),
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    retry: 2,
    ...options,
  })
}

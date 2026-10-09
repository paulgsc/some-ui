/**
 * TanStack Query hooks for the handheld's feed of served scene trees
 * (`adapter/tree-feed`). Only the handheld calls them, so the desktop
 * session never requests the feed.
 */

import type { UseQueryResult } from "@tanstack/react-query"
import { useQuery } from "@tanstack/react-query"
import type { TopikMetadata } from "@topik/lib/topik"
import type { TreeFeed } from "@topik/lib/topik/adapter/tree-feed"
import type { TreeIntake } from "@topik/lib/topik/generation/tree-intake"

const treeFeedKeys = {
  all: ["tree-feed"] as const,
  list: () => [...treeFeedKeys.all, "list"] as const,
  detail: (key: string) => [...treeFeedKeys.all, "tree", key] as const,
}

/** The served trees; idle where the host serves none. */
export function useTreeFeed(
  feed: TreeFeed | undefined
): UseQueryResult<Array<TopikMetadata>> {
  return useQuery({
    queryKey: treeFeedKeys.list(),
    queryFn: () => (feed ? feed.list() : []),
    enabled: feed !== undefined,
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    retry: 2,
  })
}

/** One served tree through both audits; idle while `key` is null. */
export function useServedTree(
  feed: TreeFeed | undefined,
  key: string | null
): UseQueryResult<TreeIntake> {
  return useQuery({
    queryKey: treeFeedKeys.detail(key ?? ""),
    queryFn: (): Promise<TreeIntake> | TreeIntake =>
      feed && key !== null
        ? feed.load(key)
        : { status: "absent", error: "No tree is chosen." },
    enabled: feed !== undefined && key !== null,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    retry: 2,
  })
}

/**
 * LeetType's way to the session files the paired home holds, in the
 * Android app (#1916, LA15, docs/learner-data-authority.md): a port only
 * while the phone is paired, keyed by the pairing, so a new pairing starts
 * with nothing listed. Phone-only (`build.paths.ts`); `session-viewport.tsx`
 * reaches it only in the device build.
 */
import { useMemo } from "react"
import type { HomeSessionFiles } from "@some-ui/leetype"

import { useHomeLink } from "@/lib/home-link"
import { leetypeFileReads } from "@/lib/home-link/leetype-files"

export function useHomeLeetypeFiles(): HomeSessionFiles | undefined {
  const { link } = useHomeLink()
  const reads = leetypeFileReads()
  const key = link.kind === "paired" ? link.id : null
  return useMemo(
    () =>
      key === null
        ? undefined
        : {
            key,
            list: () => reads.list(),
            fetch: (name: string) => reads.fetch(name),
          },
    [key, reads]
  )
}

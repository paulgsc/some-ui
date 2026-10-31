/**
 * A concern's limits on its Settings page (`lib/limits`, SM2): each limit,
 * where it stands now, and what happens at it. Device build only, like
 * `lib/limits` (`build.paths.ts`): render it behind an inline
 * `import.meta.env.VITE_DEVICE_BACKEND === "true"`.
 */
import type { JSX } from "react"
import { useEffect, useSyncExternalStore } from "react"

import type { LimitConcern, LimitReading, LimitRow } from "@/lib/limits"
import { limits, rowsOf, standingOf } from "@/lib/limits"
import { LIMITS_WORDS, WHAT_HAPPENS } from "@/lib/limits/words"
import { SettingsBlock } from "@/components/settings/settings-page"

const standing = (row: LimitRow, reading: LimitReading | undefined): string => {
  if (reading === undefined || reading.kind === "counting") {
    return LIMITS_WORDS.counting
  }
  return reading.kind === "unread"
    ? LIMITS_WORDS.unread
    : standingOf(row, reading.count)
}

export const DeviceLimits = ({
  concern,
}: {
  concern: LimitConcern
}): JSX.Element => {
  const snapshot = useSyncExternalStore(limits.subscribe, limits.getSnapshot)
  useEffect(() => {
    void limits.refresh(concern)
  }, [concern])
  return (
    <SettingsBlock title={LIMITS_WORDS.title}>
      <p className="text-muted-foreground text-sm">{LIMITS_WORDS.lead}</p>
      <ul className="space-y-3">
        {rowsOf(concern).map((row) => (
          <li key={row.id} className="space-y-0.5">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-sm font-medium">{row.words.what}</span>
              <span className="text-muted-foreground shrink-0 text-xs">
                {WHAT_HAPPENS[row.words.atLimit]}
              </span>
            </div>
            <p className="text-sm">{standing(row, snapshot[row.id])}</p>
            <p className="text-muted-foreground text-xs">{row.words.then}</p>
          </li>
        ))}
      </ul>
    </SettingsBlock>
  )
}

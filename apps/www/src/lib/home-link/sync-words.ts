/**
 * Every word the sync from home ends with, in Settings: what came to this
 * phone, and why it ended early, in the person's terms. Pure, and the one
 * place those words live, so no request, status code, address or state
 * name reaches the screen (`__tests__/sync-words.test.ts`).
 */
import { assertNever } from "@some-ui/core-utils"

import type { SyncReport } from "@/lib/device-backend/home-sync"

/** How a sync ended, as its line says it. */
export type SyncEnd =
  | { readonly kind: "done"; readonly report: SyncReport }
  | { readonly kind: "stopped" }
  /** Home answered `429`. */
  | { readonly kind: "busy" }
  | { readonly kind: "unreachable" }
  /** The phone's own storage, in its words. */
  | { readonly kind: "storage"; readonly summary: string }
  /**
   * Anything else: an answer from home this phone couldn't read, or a fault
   * on the phone, which goes to the native log.
   */
  | { readonly kind: "other" }

function describe(report: SyncReport): string {
  const { lessons, trees, rounds, failed } = report
  const parts = [
    `${lessons.listed} TOPIK lesson${lessons.listed === 1 ? "" : "s"} (${lessons.added} new, ${lessons.updated} updated)`,
    `${trees.listed} drama${trees.listed === 1 ? "" : "s"} (${trees.added} new, ${trees.updated} updated)`,
    `${rounds.added + rounds.updated} Leetype round${rounds.added + rounds.updated === 1 ? "" : "s"} refreshed`,
  ]
  const removed = lessons.removed + trees.removed + rounds.removed
  if (removed > 0) parts.push(`${removed} home no longer lists removed`)
  const skipped = lessons.skipped + trees.skipped + rounds.skipped
  if (skipped > 0) parts.push(`${skipped} not added: this phone is full`)
  if (failed.length > 0) parts.push(`${failed.length} could not be fetched`)
  return parts.join(" · ")
}

/** `end`, as the line Settings shows. */
export function syncLine(end: SyncEnd): string {
  switch (end.kind) {
    case "done": {
      return describe(end.report)
    }
    case "stopped": {
      return "Stopped. What came from home before that stays on this phone."
    }
    case "busy": {
      return "Home is busy right now. What came before that stays on this phone; try again in a minute."
    }
    case "unreachable": {
      return "Couldn't reach home. Are you on the home network?"
    }
    case "storage": {
      return `${end.summary} What came before that stays on this phone.`
    }
    case "other": {
      return "Couldn't copy the lessons from home this time."
    }
    default: {
      return assertNever(end)
    }
  }
}

/**
 * The shelf half of "Send to home" (`./send`): what this phone kept, copied
 * to the paired home's shelf (paulgsc/server `handlers/shelf.rs`), one PUT
 * per item (LA8). Phone to home only: nothing is read back, nothing on home
 * is deleted, and the phone keeps its own: kept items are for studying
 * again, not an archive.
 *
 * Home's answers are counted, never retried: a full shelf (`409`) and a
 * refused item (`422`) are counted and the send goes on; a `401` (home no
 * longer knows this phone) or no answer ends it there. Stop, or the app
 * going to the background, ends it before the next item.
 */
import { stringFieldOf } from "@/lib/device-backend/common"
import type { Kept } from "@/lib/device-backend/handlers/shelf"
import { SyncStoppedError } from "@/lib/device-backend/home-sync"

import type { HomeSend } from "./runtime"

/** How a send went, item by item; filled as it goes, so a stop keeps it. */
export type SendReport = {
  sent: number
  kept: number
  replaced: number
  unchanged: number
  /** Activities whose shelf on home was full, and how many did not fit. */
  full: Map<string, number>
  refused: number
  other: number
  /** Home answered `401`: it no longer knows this phone. */
  forgotten: boolean
  /** A request got no answer; nothing after it was sent. */
  unreachable: boolean
}

export function emptyReport(): SendReport {
  return {
    sent: 0,
    kept: 0,
    replaced: 0,
    unchanged: 0,
    full: new Map(),
    refused: 0,
    other: 0,
    forgotten: false,
    unreachable: false,
  }
}

/** PUTs `items` through `send`, once each, into `report`. */
export async function sendKept(
  items: ReadonlyArray<Kept>,
  send: HomeSend,
  report: SendReport
): Promise<void> {
  for (const item of items) {
    let status: number
    let body: string
    try {
      ;({ status, body } = await send(
        "PUT",
        `/shelf/${item.activity}/${encodeURIComponent(item.key)}`,
        item.body
      ))
    } catch (error) {
      if (error instanceof SyncStoppedError) throw error
      report.unreachable = true
      return
    }
    if (status === 401) {
      report.forgotten = true
      return
    }
    if (status === 409) {
      report.full.set(item.activity, (report.full.get(item.activity) ?? 0) + 1)
      continue
    }
    if (status === 422) {
      report.refused += 1
      continue
    }
    const change = status === 200 ? stringFieldOf(body, "change") : null
    if (change === "kept") report.kept += 1
    else if (change === "replaced") report.replaced += 1
    else if (change === "unchanged") report.unchanged += 1
    else {
      report.other += 1
      continue
    }
    report.sent += 1
  }
}

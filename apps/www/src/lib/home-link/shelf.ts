/**
 * "Send shelf to home": what this phone kept, copied to the paired home's
 * shelf (paulgsc/server `handlers/shelf.rs`), one PUT per item, after a tap
 * and a confirm that names the count and the host (LA8). Phone to home
 * only: nothing is read back, and nothing on home is deleted.
 *
 * Home's answers are said, never retried: a full shelf (`409`) and a refused
 * item (`422`) are counted and the send goes on; a `401` (home no longer
 * knows this phone) or no answer ends it there. Stop, or the app going to
 * the background, ends it before the next item.
 */
import { deviceBackend } from "@/lib/device-backend/boot"
import { isRecord } from "@/lib/device-backend/common"
import type { Kept } from "@/lib/device-backend/handlers/shelf"
import { everyKept } from "@/lib/device-backend/handlers/shelf"
import { SyncStoppedError } from "@/lib/device-backend/home-sync"

import { hostOf } from "./address"
import { homeLink } from "./index"
import { remember, remembered } from "./remembered"
import type { HomePut } from "./runtime"
import type { SyncResult } from "./sync"

const LAST_SEND_KEY = "some-ui.device.last-shelf-send.v1"

const NAMES: Record<string, string> = { topik: "TOPIK", leetype: "Leetype" }

const nameOf = (activity: string): string => NAMES[activity] ?? activity

/** What a send would carry, for its confirm. */
export type ShelfCount = { total: number; parts: string }

/** Reads the phone's own shelf; sends nothing. */
export async function keptOnPhone(): Promise<ShelfCount> {
  const { context } = await deviceBackend()
  const items = await everyKept(context.db)
  const by = new Map<string, number>()
  for (const { activity } of items)
    by.set(activity, (by.get(activity) ?? 0) + 1)
  const parts = [...by].map(([activity, n]) => `${n} ${nameOf(activity)}`)
  return { total: items.length, parts: parts.join(", ") }
}

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

function changeOf(body: string): string | null {
  try {
    const parsed: unknown = JSON.parse(body)
    return isRecord(parsed) && typeof parsed.change === "string"
      ? parsed.change
      : null
  } catch {
    return null
  }
}

/**
 * Sends `items` through `put`, once each, into `report`. Ends early on a
 * `401` or no answer; a stop rejects with `SyncStoppedError`.
 */
export async function sendKept(
  items: ReadonlyArray<Kept>,
  put: HomePut,
  report: SendReport
): Promise<void> {
  for (const item of items) {
    let status: number
    let body: string
    try {
      ;({ status, body } = await put(
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
    const change = status === 200 ? changeOf(body) : null
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

/** The report in the block's words. */
export function describeSend(
  report: SendReport,
  host: string,
  total: number
): string {
  if (report.unreachable && report.sent === 0) {
    return `Couldn't reach ${host}. Are you on the home network? Nothing was sent.`
  }
  const parts = [
    `Sent ${report.sent} of ${total} to ${host}: ${report.kept} new, ${report.replaced} replaced, ${report.unchanged} already there.`,
  ]
  for (const [activity, n] of report.full) {
    parts.push(
      `${n} didn't fit: the ${nameOf(activity)} shelf on ${host} is full.`
    )
  }
  if (report.refused > 0) parts.push(`${report.refused} refused by ${host}.`)
  if (report.other > 0) {
    parts.push(`${report.other} got an answer this app doesn't know.`)
  }
  if (report.forgotten) {
    parts.push(
      `${host} no longer knows this phone, so nothing more was sent: unpair, then pair again.`
    )
  }
  if (report.unreachable) {
    parts.push(`Lost ${host} there, so nothing more was sent.`)
  }
  return parts.join(" ")
}

/** "time · host · what happened" for the last send, or "". */
export function lastSend(): string {
  return remembered(LAST_SEND_KEY)
}

/**
 * Sends everything kept on this phone to the paired `base`. Never throws:
 * a failure is a line.
 */
export async function sendShelfTo(base: string): Promise<SyncResult> {
  const host = hostOf(base)
  const report = emptyReport()
  try {
    const { context } = await deviceBackend()
    const items = await everyKept(context.db)
    const total = items.length
    const outcome = await homeLink().send((put) => sendKept(items, put, report))
    if (outcome === null) return { ok: false, line: "" }
    const line =
      outcome.kind === "stopped"
        ? `Stopped. ${report.sent} of ${total} sent to ${host} before that.`
        : describeSend(report, host, total)
    remember(LAST_SEND_KEY, `${new Date().toLocaleString()} · ${line}`)
    const clean =
      outcome.kind === "done" &&
      report.sent === total &&
      !report.forgotten &&
      !report.unreachable
    return { ok: clean, line }
  } catch (error) {
    return { ok: false, line: `Send failed: ${String(error)}` }
  }
}

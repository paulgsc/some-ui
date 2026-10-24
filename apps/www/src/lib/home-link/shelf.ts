/**
 * The shelf half of "Send to home" (`./send`): what this phone kept, copied
 * to the paired home's shelf (paulgsc/server `handlers/shelf.rs`), one PUT
 * per item (LA8). Phone to home only: nothing is read back, nothing on home
 * is deleted, and the phone keeps its own: kept items are for studying
 * again, not an archive.
 *
 * Home's answers are counted, never retried: a full shelf (`409`) and a
 * refused item (`422`) are counted and the send goes on; a `401` (home no
 * longer knows this phone), home being busy (`429`) or no answer ends it
 * there. Stop, or the app
 * going to the background, ends it before the next item.
 */
import type { HomeAnswer, HomeCall } from "@some-ui/core-utils"

import { stringFieldOf } from "@/lib/device-backend/common"
import type { Kept } from "@/lib/device-backend/handlers/shelf"

import { unanswered } from "./runtime"

/**
 * A shelf send found no answer from home, or home busy (`unreachable`).
 * Not `home-sync`'s `HomeUnreachableError`, which is the lessons sync's.
 */
export class HomeUnansweredError extends Error {
  constructor() {
    super("home did not answer the shelf send")
    this.name = "HomeUnansweredError"
  }
}

/** How a send ended early, as the shelf's and LeetType's reports say it. */
export type EndedReport = {
  /** Home answered `401`: it no longer knows this phone. */
  forgotten: boolean
  /** A request got no answer, or home was busy; nothing after it was sent. */
  unreachable: boolean
}

/**
 * `send`'s answer, or null once the send is over: no answer, home busy
 * (`429`) or a `401`, each said in `report`. A fault on this phone is
 * thrown as it came.
 */
export async function answerOrEnd(
  send: HomeCall,
  report: EndedReport,
  method: "GET" | "PUT",
  path: string,
  body?: string
): Promise<HomeAnswer | null> {
  let answer: HomeAnswer
  try {
    answer = await send(method, path, body)
  } catch (error) {
    if (!unanswered(error)) throw error
    report.unreachable = true
    return null
  }
  if (answer.status === 401) report.forgotten = true
  else if (answer.status === 429) report.unreachable = true
  else return answer
  return null
}

/** How a send went, item by item; filled as it goes, so a stop keeps it. */
export type SendReport = EndedReport & {
  sent: number
  kept: number
  replaced: number
  unchanged: number
  /** Activities whose shelf on home was full, and how many did not fit. */
  full: Map<string, number>
  refused: number
  other: number
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

/**
 * PUTs `items` through `send`, once each, into `report`; `heard` hears each
 * item home answered for with its copy (`held`) or refused (`refused`).
 */
export async function sendKept(
  items: ReadonlyArray<Kept>,
  send: HomeCall,
  report: SendReport,
  heard: (item: Kept, answer: "held" | "refused") => void = () => undefined
): Promise<void> {
  for (const item of items) {
    const answer = await answerOrEnd(
      send,
      report,
      "PUT",
      `/shelf/${item.activity}/${encodeURIComponent(item.key)}`,
      item.body
    )
    if (answer === null) return
    const { status, body } = answer
    if (status === 409) {
      report.full.set(item.activity, (report.full.get(item.activity) ?? 0) + 1)
      continue
    }
    if (status === 422) {
      report.refused += 1
      heard(item, "refused")
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
    heard(item, "held")
  }
}

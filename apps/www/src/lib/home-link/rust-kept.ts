/**
 * What Rust Rounds keeps that goes home for good (RR14, #2689;
 * paulgsc/server#763): each week sent, each paste kept and each sitting of
 * the card-era log (`@some-ui/rust-rounds`' `keptGoing`), one PUT each
 * through `sendEach`, after the rounds and the weeks in the Rust Rounds lane
 * (`./rust-rounds`). A week or a paste counts as home's once home's answer
 * carries it exactly as sent, a sitting once it reads back the same; each is
 * remembered under the pairing (`./sent`), so another home is sent all of it
 * again. A refusal counts in the run and goes again with the next, as the
 * drain's log parts do. The phone lets go of nothing here.
 */
import type { HomeCall, HomeExchanged, KeyedStorage } from "@some-ui/core-utils"
import { canonicalJson, isRecord, jsonOf } from "@some-ui/core-utils"
import type { KeptItem } from "@some-ui/rust-rounds"
import { exchangeRustRounds, keptGoing } from "@some-ui/rust-rounds"

import { phoneRounds, phoneWeeks } from "@/lib/rust-rounds"
import { browserLocalStorage } from "@/lib/tenant/storage"

import type { EachSent } from "./leetype-log"
import { emptyLogReport, sendEach } from "./leetype-log"
import type { Sent } from "./sent"
import { fingerprintOf, readSent, rememberSent } from "./sent"
import { answerOrEnd, endedPart } from "./shelf"

/** Whether `sent` says home holds `item` as it is now. */
const heldNow = (sent: Sent, item: KeptItem): boolean =>
  sent[item.kind][item.id] === fingerprintOf(item.wire)

/** Of each kind, how many home holds as they are now, and how many wait. */
export function keptCounts(
  going: ReadonlyArray<KeptItem>,
  sent: Sent | null
): Record<KeptItem["kind"], number> & { waiting: number } {
  const counts = { rustWeeks: 0, rustPastes: 0, roundLog: 0, waiting: 0 }
  for (const item of going) {
    if (sent !== null && heldNow(sent, item)) counts[item.kind] += 1
    else counts.waiting += 1
  }
  return counts
}

/** The key home's answer to a PUT holds the item under, where it echoes one. */
const ECHO = { rustWeeks: "sent", rustPastes: "paste" } as const

/**
 * Sends each item of `going` home does not hold as it is now (the module's
 * rules). Throws `HomeUnansweredError` when home does not answer.
 */
export async function sendRustKept(
  send: HomeCall,
  going: ReadonlyArray<KeptItem>,
  storage: KeyedStorage | null,
  pairing: string
): Promise<HomeExchanged> {
  const sent = readSent(storage, pairing)
  const waiting = going.filter((item) => !heldNow(sent, item))
  const report = emptyLogReport()
  const keyOf = (item: KeptItem): string => `${item.kind}/${item.id}`
  const byKey = new Map(waiting.map((item) => [keyOf(item), item]))
  const held: Partial<Record<KeptItem["kind"], Record<string, string>>> = {}
  const each: EachSent<KeptItem> = {
    path: (item) => item.path,
    body: (item) => item.wire,
    heldAs: async (item, text, body) => {
      if (item.kind === "roundLog") {
        const back = await answerOrEnd(send, report, "GET", item.path)
        if (back?.status !== 200) return null
        if (canonicalJson(jsonOf(back.body)) !== text) return null
      } else {
        const answer = jsonOf(body)
        if (!isRecord(answer)) return null
        if (canonicalJson(answer[ECHO[item.kind]]) !== text) return null
      }
      return [keyOf(item), fingerprintOf(item.wire)]
    },
  }
  try {
    await sendEach(waiting, each, send, report, (key, digest) => {
      const item = byKey.get(key)
      if (item !== undefined) (held[item.kind] ??= {})[item.id] = digest
    })
  } finally {
    rememberSent(storage, sent, held)
  }
  const ended = endedPart(report)
  if (ended !== null) return ended
  return report.refused + report.other + report.differs > 0
    ? { kind: "failed", why: "refused" }
    : { kind: "synced" }
}

/**
 * The Rust Rounds lane's run (`./rust-rounds`): the rounds and the weeks
 * (`exchangeRustRounds`), then, once they are synced, what goes home for
 * good, under `pairing`.
 */
export async function exchangeRustRoundsLane(
  send: HomeCall,
  pairing: string
): Promise<HomeExchanged> {
  const done = await exchangeRustRounds(phoneRounds(), phoneWeeks(), send)
  if (done.kind !== "synced") return done
  return sendRustKept(
    send,
    keptGoing(browserLocalStorage),
    browserLocalStorage,
    pairing
  )
}

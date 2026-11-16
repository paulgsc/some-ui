/**
 * The interview week's half of the Jobs lane (IW5, `./jobs`): after the Jobs
 * record, the weeks home holds come to this phone
 * (`lib/interview-week/home`'s `exchangeInterviewWeeks`), then the latest send
 * of each open week goes home, one `PUT /interview-weeks/:id/sent` each
 * through `sendEach`. A send counts as home's once home's answer carries it
 * exactly as sent (`{change, sent}`, paulgsc/server#847), remembered under the
 * pairing (`./sent`), so another home is sent it again. A refusal counts in
 * the run and goes again with the next. The phone lets go of nothing here.
 */
import type { HomeCall, HomeExchanged } from "@some-ui/core-utils"
import { canonicalJson, isRecord, jsonOf } from "@some-ui/core-utils"

import { phoneInterviews } from "@/lib/interview-week"
import type { InterviewGoing } from "@/lib/interview-week/home"
import {
  exchangeInterviewWeeks,
  interviewGoing,
} from "@/lib/interview-week/home"
import type { InterviewSent } from "@/lib/interview-week/spec"
import { sendKey } from "@/lib/interview-week/spec"
import { phoneJobs } from "@/lib/jobs"
import { exchangeJobs } from "@/lib/jobs/home"
import { browserLocalStorage } from "@/lib/tenant/storage"

import { homeLink, pairingOf } from "./index"
import type { EachSent } from "./leetype-log"
import { emptyLogReport, sendEach } from "./leetype-log"
import type { Sent } from "./sent"
import { fingerprintOf, readSent, rememberSent } from "./sent"
import { endedPart } from "./shelf"

/** Whether `memory` says home holds `sent`, one send of a week, as it is. */
const holdsInterviewSend = (
  memory: Sent | null,
  sent: InterviewSent
): boolean =>
  memory !== null &&
  memory.interviewWeeks[sendKey(sent)] === fingerprintOf(sent)

/** `holdsInterviewSend` under the pairing this phone holds now: the week's port. */
export const homeHoldsInterviewSend = (sent: InterviewSent): boolean => {
  const pairing = pairingOf()
  return holdsInterviewSend(
    pairing === null ? null : readSent(browserLocalStorage, pairing),
    sent
  )
}

/** Calls `listener` each time the link changes, when what home holds may have. */
export const onHomeHoldsInterviewSend = (listener: () => void): (() => void) =>
  homeLink().subscribe(listener)

/** Of the sends going now, how many home holds as they are, and how many wait. */
export function interviewCounts(
  going: ReadonlyArray<InterviewGoing>,
  memory: Sent | null
): { readonly held: number; readonly waiting: number } {
  const held = going.filter((item) => holdsInterviewSend(memory, item.wire))
  return { held: held.length, waiting: going.length - held.length }
}

/** Sends each of `going` home does not hold as it is now (the module's rules). */
async function sendInterviews(
  send: HomeCall,
  going: ReadonlyArray<InterviewGoing>,
  pairing: string
): Promise<HomeExchanged> {
  const memory = readSent(browserLocalStorage, pairing)
  const waiting = going.filter((item) => !holdsInterviewSend(memory, item.wire))
  const report = emptyLogReport()
  const held: Record<string, string> = {}
  const each: EachSent<InterviewGoing> = {
    path: (item) => item.path,
    body: (item) => item.wire,
    heldAs: (item, text, body) => {
      const answer = jsonOf(body)
      return Promise.resolve(
        isRecord(answer) && canonicalJson(answer.sent) === text
          ? ([item.id, fingerprintOf(item.wire)] as const)
          : null
      )
    },
  }
  try {
    await sendEach(waiting, each, send, report, (key, digest) => {
      held[key] = digest
    })
  } finally {
    rememberSent(browserLocalStorage, memory, { interviewWeeks: held })
  }
  const ended = endedPart(report)
  if (ended !== null) return ended
  return report.refused + report.other + report.differs > 0
    ? { kind: "failed", why: "refused" }
    : { kind: "synced" }
}

/** The interview week's run, under `pairing`: its weeks, then its sends. */
async function exchangeInterview(
  send: HomeCall,
  pairing: string
): Promise<HomeExchanged> {
  const done = await exchangeInterviewWeeks(phoneInterviews(), send)
  if (done.kind !== "synced") return done
  return sendInterviews(
    send,
    interviewGoing(browserLocalStorage, Date.now()),
    pairing
  )
}

/** The Jobs lane's run (`./jobs`): the Jobs record, then, once synced, the interview week. */
export async function exchangeJobsLane(
  send: HomeCall,
  pairing: string
): Promise<HomeExchanged> {
  const done = await exchangeJobs(phoneJobs().keeping, send)
  return done.kind === "synced" ? exchangeInterview(send, pairing) : done
}

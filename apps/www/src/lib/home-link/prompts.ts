/**
 * The drama-prompts part of the one drain (`./drain`, LA18,
 * docs/learner-data-authority.md): each ask for the next scene this phone
 * keeps (`lib/scene-ask`) that home does not hold, one PUT each
 * (paulgsc/server `routes::routine`, `PUT /routine/prompts/:stamp`,
 * docs/identity.md invariant 31), its stamp and markdown only, counted as
 * home's only once home answers with it exactly as sent. Home keeps it for
 * good and hands it to the reflections routine through the Jobs mailbox. The
 * scene notes it names went home as voice notes (LA13).
 *
 * What home holds lets the phone let the ask go, and the notes it named
 * (`heldPrompts`, the store's `held`, scene voice's `prompted`).
 */
import type { HomeCall } from "@some-ui/core-utils"
import { canonicalJson, fnv1a, isRecord, jsonOf } from "@some-ui/core-utils"

import type { AskedPrompt } from "@/lib/scene-ask"

import type { LogReport } from "./leetype-log"
import { bucketOf } from "./leetype-log"
import type { Sent } from "./sent"
import { answerOrEnd } from "./shelf"

/** What goes home of an ask: its stamp and its markdown, nothing else. */
const wireOf = ({
  stamp,
  text,
}: AskedPrompt): { stamp: string; text: string } => ({ stamp, text })

/**
 * `sent.prompts`' entry for what went of an ask: a fingerprint, its
 * canonical JSON's length and FNV-1a, as `./sent`'s digests are.
 */
function digestOf(wire: unknown): string {
  const json = canonicalJson(wire)
  return `${String(json.length)}:${String(fnv1a(json))}`
}

/** The asks in `kept` home does not hold as they are now. */
export function promptsToSend(
  kept: ReadonlyArray<AskedPrompt>,
  sent: Sent
): Array<AskedPrompt> {
  return kept.filter(
    (prompt) => sent.prompts[prompt.stamp] !== digestOf(wireOf(prompt))
  )
}

/** The asks in `kept` home holds as they are, not yet marked held. */
export function heldPrompts(
  kept: ReadonlyArray<AskedPrompt>,
  sent: Sent
): Array<AskedPrompt> {
  return kept.filter(
    (prompt) =>
      prompt.held !== true &&
      sent.prompts[prompt.stamp] === digestOf(wireOf(prompt))
  )
}

/** Home's answer holds `prompt` exactly as it was sent. */
function holds(prompt: AskedPrompt, body: string): boolean {
  const parsed = jsonOf(body)
  return (
    isRecord(parsed) &&
    isRecord(parsed.prompt) &&
    digestOf(parsed.prompt) === digestOf(wireOf(prompt))
  )
}

/**
 * Sends `going` through `send`, one PUT each, into `report` (a refusal or
 * an answer that does not hold what was sent is counted, and that ask stays
 * on the phone, to go again with the next run); `held` hears each one home
 * holds as sent, with its fingerprint.
 */
export async function sendPrompts(
  going: ReadonlyArray<AskedPrompt>,
  send: HomeCall,
  report: LogReport,
  held: (stamp: string, digest: string) => void
): Promise<void> {
  for (const prompt of going) {
    const answer = await answerOrEnd(
      send,
      report,
      "PUT",
      `/routine/prompts/${encodeURIComponent(prompt.stamp)}`,
      JSON.stringify(wireOf(prompt))
    )
    if (answer === null) return
    const bucket = bucketOf(answer.status)
    if (bucket !== "held") {
      report[bucket] += 1
    } else if (holds(prompt, answer.body)) {
      report.held += 1
      held(prompt.stamp, digestOf(wireOf(prompt)))
    } else {
      report.differs += 1
    }
  }
}

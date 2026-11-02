/**
 * The drama-prompts part of the one drain (`./drain`, LA18,
 * docs/learner-data-authority.md): each ask for the next scene this phone
 * keeps (`lib/scene-ask`) that home does not hold, one PUT each
 * (paulgsc/server `routes::routine`, `PUT /routine/prompts/:stamp`,
 * docs/identity.md invariant 31), its stamp and markdown only, counted as
 * home's only once home answers with it exactly as sent. Home keeps it for
 * good and hands it to the reflections routine through the Jobs mailbox. The
 * scene notes it names went home as voice notes (LA13).
 */
import type { HomeCall } from "@some-ui/core-utils"

import type { AskedPrompt, PendingAsk } from "@/lib/scene-ask"

import type { LogReport, WholeLane } from "./leetype-log"
import { heldBy, sendWhole } from "./leetype-log"
import type { Sent } from "./sent"

/** What goes home of an ask: its stamp and its markdown, nothing else. */
const PROMPTS: WholeLane<PendingAsk> = {
  path: "/routine/prompts",
  wire: ({ stamp, text }) => ({ stamp, text }),
  key: "prompt",
  id: (prompt) => prompt.stamp,
}

const isPending = (prompt: AskedPrompt): prompt is PendingAsk =>
  prompt.held !== true

/**
 * The asks in `kept` home does not hold as they are now. One the store
 * marked held is never sent again, under this pairing or another.
 */
export function promptsToSend(
  kept: ReadonlyArray<AskedPrompt>,
  sent: Sent
): Array<PendingAsk> {
  const held = heldBy(PROMPTS, sent.prompts)
  return kept.filter(isPending).filter((prompt) => !held(prompt))
}

/** The asks in `kept` home holds as they are, not yet marked held. */
export function heldPrompts(
  kept: ReadonlyArray<AskedPrompt>,
  sent: Sent
): Array<PendingAsk> {
  return kept.filter(isPending).filter(heldBy(PROMPTS, sent.prompts))
}

/** `sendWhole` over the asks (`./drain`'s prompts part). */
export const sendPrompts = (
  going: ReadonlyArray<PendingAsk>,
  send: HomeCall,
  report: LogReport,
  held: (stamp: string, fingerprint: string) => void
): Promise<void> => sendWhole(PROMPTS, going, send, report, held)

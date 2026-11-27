/**
 * A spoken hunch heard by home (KP4, C1607): once the voice lane has taken
 * the take home (`lib/hunch-takes`), the shop asks home to hear it next
 * (`home-link/fast-track`), then reads its words (`home-link/heard`) every
 * few seconds until home has heard it, for a few minutes at most, and not
 * once the screen is gone. A take not heard in time is `held` when home
 * said it holds it, else `going`: not yet known on home, which a home busy
 * throughout is read as too. A home that can't give its words is `held`
 * once it said it holds the take, and rejects before; the take stays here
 * until home has it either way.
 */
import { assertNever } from "@some-ui/core-utils"
import type { HearingTiming } from "@some-ui/soundbites/contract"
import { HEARING_TIMING } from "@some-ui/soundbites/contract"
import type { Heard } from "@some-ui/topik"
import type { HeardAnswer } from "@some-ui/voice-capture"

import type { FastTracked } from "@/lib/home-link/fast-track"

export type HearPorts = {
  readonly fastTrack: (note: string) => Promise<FastTracked>
  readonly heard: (note: string) => Promise<HeardAnswer>
  readonly wait: (ms: number) => Promise<void>
  readonly now: () => number
}

/** The take `note`'s words, once home has heard it, or why not yet. */
export async function hearOnHome(
  note: string,
  ports: HearPorts,
  gone: AbortSignal,
  // As often and as long as Studio's idea answers wait for theirs.
  timing: HearingTiming = HEARING_TIMING
): Promise<Heard> {
  const until = ports.now() + timing.deadlineMs
  let asked = false
  // Home said it holds the take: by its fast-track, or by hearing it.
  let held = false
  for (;;) {
    if (gone.aborted) throw new Error("the shop is gone")
    if (!asked) {
      const tracked = await ports.fastTrack(note)
      // Home holds it and will hear it next, or can't hurry it: just read.
      asked = tracked === "asked" || tracked === "unreachable"
      held ||= tracked === "asked"
    }
    const said = await ports.heard(note)
    switch (said.kind) {
      case "heard": {
        return { kind: "heard", words: said.text }
      }
      case "unreachable": {
        if (held) return { kind: "held" }
        throw new Error("home couldn't give the take's words")
      }
      case "notYet": {
        held = true
        break
      }
      case "notHeld":
      case "busy": {
        break
      }
      default: {
        return assertNever(said)
      }
    }
    if (ports.now() >= until) return { kind: held ? "held" : "going" }
    await ports.wait(timing.pollMs)
  }
}

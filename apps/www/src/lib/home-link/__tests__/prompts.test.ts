/**
 * The drain's asks for the next scene (LA18): each goes once, its stamp and
 * markdown only, and counts as home's only once home answers with it
 * exactly as sent; what `sent` keeps of it is a bounded fingerprint.
 */
import type { HomeAnswer } from "@some-ui/core-utils"
import { inMemoryStorage } from "@some-ui/core-utils"
import { describe, expect, it } from "vitest"

import { emptyLogReport } from "@/lib/home-link/leetype-log"
import {
  heldPrompts,
  promptsToSend,
  sendPrompts,
} from "@/lib/home-link/prompts"
import type { Sent } from "@/lib/home-link/sent"
import { readSent } from "@/lib/home-link/sent"
import type { PendingAsk } from "@/lib/scene-ask"

import { home } from "./fake-home"

const asked = (n: number, text = `prompt ${String(n)}`): PendingAsk => ({
  stamp: `drama-2026103${String(n)}T071503120Z`,
  at: `2026-10-3${String(n)}T07:15:03.120Z`,
  text,
  notes: [`n${String(n)}`],
})

const none: Sent = readSent(inMemoryStorage(), "p1")

const echo = (prompt: PendingAsk, text = prompt.text): HomeAnswer => ({
  status: 200,
  body: JSON.stringify({
    change: "added",
    prompt: { stamp: prompt.stamp, text },
  }),
})

describe("what goes", () => {
  it("is each ask home does not hold; once held, it is offered as held and not sent", async () => {
    const kept = [asked(0), asked(1)]
    expect(promptsToSend(kept, none)).toEqual(kept)
    expect(heldPrompts(kept, none)).toEqual([])

    const remembered: Record<string, string> = {}
    const { send } = home([echo(asked(0)), echo(asked(1))])
    await sendPrompts(kept, send, emptyLogReport(), (stamp, digest) => {
      remembered[stamp] = digest
    })
    const sent: Sent = { ...none, prompts: remembered }
    expect(promptsToSend(kept, sent)).toEqual([])
    expect(heldPrompts(kept, sent)).toEqual(kept)
    expect(
      Object.values(remembered).every((digest) => digest.length < 32)
    ).toBe(true)
    // Marked held by the store, it is offered no more, and never sent again,
    // under this pairing or another.
    const marked = {
      stamp: asked(0).stamp,
      at: asked(0).at,
      held: true as const,
    }
    expect(heldPrompts([marked], sent)).toEqual([])
    expect(promptsToSend([marked], none)).toEqual([])
  })
})

describe("sendPrompts", () => {
  it("puts each as its stamp and markdown, and counts it home's only on an answer that holds it", async () => {
    const report = emptyLogReport()
    const held: Array<string> = []
    const { send, calls } = home([
      echo(asked(0)),
      echo(asked(1), "not what was sent"),
    ])
    await sendPrompts([asked(0), asked(1)], send, report, (stamp) => {
      held.push(stamp)
    })
    expect(calls).toEqual([
      [
        "PUT",
        "/routine/prompts/drama-20261030T071503120Z",
        JSON.stringify({
          stamp: "drama-20261030T071503120Z",
          text: "prompt 0",
        }),
      ],
      [
        "PUT",
        "/routine/prompts/drama-20261031T071503120Z",
        JSON.stringify({
          stamp: "drama-20261031T071503120Z",
          text: "prompt 1",
        }),
      ],
    ])
    expect(held).toEqual(["drama-20261030T071503120Z"])
    expect(report).toMatchObject({ held: 1, differs: 1 })
  })
})

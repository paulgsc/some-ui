/**
 * @vitest-environment node
 *
 * The ask's answer run against a listener (`../index`, SFEED5 #2746): the
 * take it starts names the ask's ref, so it goes home under it; a phone not
 * paired with home records nothing; the page hiding ends the take.
 */
import { answerRef } from "@some-ui/video-render"
import type { Listened, Listening, TurnListener } from "@some-ui/voice-capture"
import { describe, expect, it, vi } from "vitest"

import type { AskAnswerPorts } from "@/lib/ask-answer"
import { createAskAnswer } from "@/lib/ask-answer"

const REF = answerRef({ repo: "some-ui", number: 2676 })

type FakeListener = TurnListener & {
  readonly takes: Array<string>
  readonly stops: () => number
  readonly end: (result: Listened) => void
}

/** A listener whose take ends when `end` is called, recording what each take answers. */
function fakeListener(): FakeListener {
  let end: (result: Listened) => void = () => undefined
  let stops = 0
  const takes: Array<string> = []
  return {
    takes,
    stops: () => stops,
    end: (result): void => {
      end(result)
    },
    available: () => Promise.resolve(true),
    listen: (_onWords, onReady, take): Listening => {
      takes.push(take?.answers ?? "")
      onReady()
      return {
        done: new Promise<Listened>((resolve) => {
          end = resolve
        }),
        stop: (): void => {
          stops += 1
        },
        cancel: () => undefined,
      }
    },
  }
}

function portsOf(
  listener: TurnListener,
  paired: boolean
): AskAnswerPorts & { hide: () => void } {
  let onHidden: (hidden: boolean) => void = () => undefined
  return {
    listener,
    loaded: () => Promise.resolve(),
    paired: () => paired,
    onVisibility: (each) => {
      onHidden = each
      return () => undefined
    },
    hide: () => onHidden(true),
  }
}

const settle = (): Promise<void> => new Promise((r) => setTimeout(r, 0))

describe("an ask answered by voice (SFEED5)", () => {
  it("starts the take under the ask's ref, and shows home's words for it", async () => {
    const listener = fakeListener()
    const answer = createAskAnswer(portsOf(listener, true), REF)
    answer.attach()
    await settle()
    expect(answer.getSnapshot().voice).toBe("ready")
    answer.dispatch({ type: "talk" })
    expect(listener.takes).toEqual([REF])
    expect(answer.getSnapshot().phase).toMatchObject({
      kind: "recording",
      ready: true,
    })
    answer.dispatch({ type: "stopTalking" })
    expect(listener.stops()).toBe(1)
    listener.end({ kind: "heard", words: "keep the palette warm" })
    await settle()
    expect(answer.getSnapshot().phase).toEqual({
      kind: "heard",
      words: "keep the palette warm",
    })
  })

  it("records nothing on a phone not paired with home, and says so", async () => {
    const listener = fakeListener()
    const available = vi.spyOn(listener, "available")
    const answer = createAskAnswer(portsOf(listener, false), REF)
    answer.attach()
    await settle()
    expect(answer.getSnapshot().voice).toBe("unpaired")
    answer.dispatch({ type: "talk" })
    expect(listener.takes).toEqual([])
    expect(available).not.toHaveBeenCalled()
  })

  it("ends the take when the page hides", async () => {
    const listener = fakeListener()
    const ports = portsOf(listener, true)
    const answer = createAskAnswer(ports, REF)
    answer.attach()
    await settle()
    answer.dispatch({ type: "talk" })
    ports.hide()
    expect(listener.stops()).toBe(1)
    expect(answer.getSnapshot().phase.kind).toBe("finishing")
  })
})

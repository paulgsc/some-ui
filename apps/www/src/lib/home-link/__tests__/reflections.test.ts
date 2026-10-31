/**
 * The drain's written reflections (LA16): only typed lines go, each once,
 * and one counts as home's only once home answers with it exactly as sent.
 */
import { noAnswer } from "@/test-support/no-answer"
import { inMemoryStorage } from "@some-ui/core-utils"
import { describe, expect, it } from "vitest"

import { emptyLogReport } from "@/lib/home-link/leetype-log"
import type { Written } from "@/lib/home-link/reflections"
import {
  heldWritten,
  sendReflections,
  writtenToSend,
} from "@/lib/home-link/reflections"
import type { Sent } from "@/lib/home-link/sent"
import { readSent } from "@/lib/home-link/sent"
import type { Reflection } from "@/lib/session-reflection"

import { echo, home } from "./fake-home"

const typed = (id: string, text = `line ${id}`): Written => ({
  id,
  sessionId: "s1",
  createdAt: "2026-10-30T10:06:00.000Z",
  atMs: null,
  body: { kind: "text", text },
})

const KEPT: ReadonlyArray<Reflection> = [
  typed("t1"),
  {
    ...typed("v1"),
    body: { kind: "voice", durationMs: 4000, mimeType: "audio/webm", bytes: 3 },
  },
  {
    ...typed("a1"),
    body: { kind: "answers", answers: { difficulty: "right" } },
  },
  typed("t2"),
]

const none: Sent = readSent(inMemoryStorage(), "p1")

describe("what goes", () => {
  it("is each typed line home does not hold as it is; never a spoken one or the answers", () => {
    expect(writtenToSend(KEPT, none).map((r) => r.id)).toEqual(["t1", "t2"])
    expect(heldWritten(KEPT, none)).toEqual(new Set())
  })

  it("leaves out the ones home holds, and offers one again once its words change", async () => {
    const remembered: Record<string, string> = {}
    const { send } = home([echo(typed("t1")), echo(typed("t2"))])
    await sendReflections(
      writtenToSend(KEPT, none),
      send,
      emptyLogReport(),
      (id, digest) => {
        remembered[id] = digest
      }
    )
    const sent: Sent = { ...none, reflections: remembered }
    expect(writtenToSend(KEPT, sent)).toEqual([])
    expect(heldWritten(KEPT, sent)).toEqual(new Set(["t1", "t2"]))

    const edited = [typed("t1", "other words"), ...KEPT.slice(1)]
    expect(writtenToSend(edited, sent).map((r) => r.id)).toEqual(["t1"])
    expect(heldWritten(edited, sent)).toEqual(new Set(["t2"]))
  })
})

describe("sendReflections", () => {
  it("puts each as the phone keeps it, and counts it home's only on an answer that holds it", async () => {
    const report = emptyLogReport()
    const held: Array<string> = []
    const { send, calls } = home([
      echo(typed("t1")),
      echo(typed("t2", "not what was sent")),
    ])
    await sendReflections(writtenToSend(KEPT, none), send, report, (id) => {
      held.push(id)
    })
    expect(calls).toEqual([
      ["PUT", "/routine/reflections/t1", JSON.stringify(typed("t1"))],
      ["PUT", "/routine/reflections/t2", JSON.stringify(typed("t2"))],
    ])
    expect(held).toEqual(["t1"])
    expect(report).toMatchObject({ held: 1, differs: 1 })
  })

  it("counts an answer that differs from what was sent, even with the same fingerprint", async () => {
    // These two texts share a length and an FNV-1a hash on t1's metadata.
    const report = emptyLogReport()
    const held: Array<string> = []
    const { send } = home([echo(typed("t1", "2d728257"))])
    await sendReflections([typed("t1", "b71894e9")], send, report, (id) => {
      held.push(id)
    })
    expect(held).toEqual([])
    expect(report).toMatchObject({ held: 0, differs: 1 })
  })

  it("counts a refusal and keeps it here, and stops when home stops answering", async () => {
    const report = emptyLogReport()
    const held: Array<string> = []
    const { send, calls } = home([{ status: 409, body: "{}" }, noAnswer()])
    await sendReflections(
      [typed("t1"), typed("t2"), typed("t3")],
      send,
      report,
      (id) => {
        held.push(id)
      }
    )
    expect(calls).toHaveLength(2)
    expect(held).toEqual([])
    expect(report).toMatchObject({ refused: 1, unreachable: true })
  })

  it("ends at a 401: home no longer knows this phone", async () => {
    const report = emptyLogReport()
    const { send, calls } = home([{ status: 401, body: "" }])
    await sendReflections([typed("t1"), typed("t2")], send, report, () => {
      throw new Error("nothing is held")
    })
    expect(calls).toHaveLength(1)
    expect(report.forgotten).toBe(true)
  })
})

/**
 * @vitest-environment node
 *
 * My data's let-go of a week of the call (ST38): the sheet asks once, deletes
 * only after a confirm, takes home's answer as final but for silence, and
 * the runtime calls home once per confirm, lets the phone's copy go on the
 * video's receipt, and reads the weeks again.
 */
import { describe, expect, it, vi } from "vitest"

import type { CallStepAsked } from "@/lib/home-link/delete-note"
import type { CallAsk, CallSheet } from "@/lib/my-data/call-deleting"
import {
  CLOSED,
  readCallStep,
  stepCallSheet,
} from "@/lib/my-data/call-deleting"
import type { CallDeletingPorts } from "@/lib/my-data/call-deleting-runtime"
import { createCallDeleting } from "@/lib/my-data/call-deleting-runtime"

const ASK: CallAsk = {
  from: "2026-10-30",
  to: "2026-11-05",
  step: "video",
  bytes: 95,
}

const RECEIPT = {
  from: "2026-10-30",
  step: "video" as const,
  url: "https://youtu.be/dQw4w9WgXcQ",
  size: 95,
  deletedAt: "2026-11-07T12:00:00.000Z",
}

const answered = (status: number, body = ""): CallStepAsked => ({
  kind: "answered",
  answer: { status, body },
})

describe("readCallStep", () => {
  it("reads a receipt as gone, and home's refusals and silence apart", () => {
    expect(
      readCallStep(answered(200, JSON.stringify({ receipt: RECEIPT })))
    ).toEqual({ kind: "gone", receipt: RECEIPT })
    expect(readCallStep(answered(409))).toEqual({ kind: "kept" })
    expect(readCallStep(answered(404))).toEqual({ kind: "notHeld" })
    expect(readCallStep(answered(401))).toEqual({ kind: "forgotten" })
    expect(readCallStep({ kind: "unpaired" })).toEqual({ kind: "forgotten" })
    for (const silent of [
      answered(500),
      answered(200, "{}"),
      { kind: "busy" } as const,
      { kind: "unreachable" } as const,
    ]) {
      expect(readCallStep(silent)).toEqual({ kind: "away" })
    }
  })
})

describe("stepCallSheet", () => {
  it("asks once, deletes only from the asking sheet, and can't be closed while deleting", () => {
    expect(stepCallSheet(CLOSED, { type: "confirmed" })).toBe(CLOSED)
    const asking = stepCallSheet(CLOSED, { type: "asked", ask: ASK })
    expect(asking).toEqual({ kind: "asking", ask: ASK })
    expect(
      stepCallSheet(asking, { type: "asked", ask: { ...ASK, step: "rest" } })
    ).toBe(asking)
    const deleting = stepCallSheet(asking, { type: "confirmed" })
    expect(deleting).toEqual({ kind: "deleting", ask: ASK })
    expect(stepCallSheet(deleting, { type: "closed" })).toBe(deleting)
    expect(stepCallSheet(asking, { type: "closed" })).toBe(CLOSED)
  })

  it("offers Try again only after silence, never after home's answer", () => {
    const deleting: CallSheet = { kind: "deleting", ask: ASK }
    const away = stepCallSheet(deleting, {
      type: "answered",
      end: { kind: "away" },
    })
    expect(stepCallSheet(away, { type: "confirmed" })).toEqual(deleting)
    for (const end of [
      { kind: "gone", receipt: RECEIPT } as const,
      { kind: "kept" } as const,
      { kind: "notHeld" } as const,
      { kind: "forgotten" } as const,
    ]) {
      const ended = stepCallSheet(deleting, { type: "answered", end })
      expect(stepCallSheet(ended, { type: "confirmed" })).toBe(ended)
    }
  })
})

function ports(asked: CallStepAsked): {
  ports: CallDeletingPorts
  deleteCallStep: ReturnType<typeof vi.fn<CallDeletingPorts["deleteCallStep"]>>
  forgetCopy: ReturnType<typeof vi.fn<CallDeletingPorts["forgetCopy"]>>
  reread: ReturnType<typeof vi.fn<CallDeletingPorts["reread"]>>
} {
  const deleteCallStep = vi.fn<CallDeletingPorts["deleteCallStep"]>(() =>
    Promise.resolve(asked)
  )
  const forgetCopy = vi.fn<CallDeletingPorts["forgetCopy"]>(() =>
    Promise.resolve()
  )
  const reread = vi.fn<CallDeletingPorts["reread"]>()
  return {
    ports: { deleteCallStep, forgetCopy, reread },
    deleteCallStep,
    forgetCopy,
    reread,
  }
}

const settle = (): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, 0))

describe("createCallDeleting", () => {
  it("asks home nothing until a confirm, then once", async () => {
    const fake = ports(answered(200, JSON.stringify({ receipt: RECEIPT })))
    const deleting = createCallDeleting(fake.ports)
    deleting.ask(ASK)
    expect(fake.deleteCallStep).not.toHaveBeenCalled()
    deleting.confirm()
    deleting.confirm()
    await settle()
    expect(fake.deleteCallStep).toHaveBeenCalledTimes(1)
    expect(fake.deleteCallStep).toHaveBeenCalledWith("2026-10-30", "video")
    expect(deleting.getSnapshot()).toEqual({
      kind: "ended",
      ask: ASK,
      end: { kind: "gone", receipt: RECEIPT },
    })
  })

  it("lets the phone's copy go on the video's receipt, and reads the weeks again", async () => {
    const fake = ports(answered(200, JSON.stringify({ receipt: RECEIPT })))
    const deleting = createCallDeleting(fake.ports)
    deleting.ask(ASK)
    deleting.confirm()
    await settle()
    expect(fake.forgetCopy).toHaveBeenCalledWith("2026-10-30")
    expect(fake.reread).toHaveBeenCalledTimes(1)

    const rest = ports(
      answered(200, JSON.stringify({ receipt: { ...RECEIPT, step: "rest" } }))
    )
    const restDeleting = createCallDeleting(rest.ports)
    restDeleting.ask({ ...ASK, step: "rest" })
    restDeleting.confirm()
    await settle()
    expect(rest.forgetCopy).not.toHaveBeenCalled()
  })

  it("deletes nothing on the phone when home kept it or didn't answer", async () => {
    for (const asked of [answered(409), { kind: "unreachable" } as const]) {
      const fake = ports(asked)
      const deleting = createCallDeleting(fake.ports)
      deleting.ask(ASK)
      deleting.confirm()
      await settle()
      expect(fake.forgetCopy).not.toHaveBeenCalled()
    }
  })
})

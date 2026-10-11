import { describe, expect, it, vi } from "vitest"

import type { DeskPorts } from "@/lib/job-brief/runtime"
import { createDeskRuntime } from "@/lib/job-brief/runtime"
import { createInMemoryStorage } from "@/lib/tenant/storage"

import raw from "./amplitude.brief.json?raw"

/** A picked file whose read finishes when the test says. */
function slowFile(): { file: Blob; finish: (text: string) => void } {
  let finish: (text: string) => void = () => undefined
  const text = new Promise<string>((resolve) => {
    finish = resolve
  })
  return { file: Object.assign(new Blob([]), { text: () => text }), finish }
}

function file(text: string): Blob {
  return new Blob([text], { type: "application/json" })
}

function ports(overrides: Partial<DeskPorts> = {}): DeskPorts {
  return {
    storage: createInMemoryStorage(),
    share: vi.fn(() => Promise.resolve("shared" as const)),
    now: () => new Date("2026-10-11T16:42:00Z"),
    ...overrides,
  }
}

async function settled(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0))
}

describe("opening a brief", () => {
  it("opens the file picked last, even when an earlier pick finishes reading after it", async () => {
    const desk = createDeskRuntime(ports())
    const first = slowFile()
    const second = slowFile()

    desk.open(first.file)
    desk.open(second.file)
    expect(desk.getSnapshot().importing).toEqual({ kind: "reading" })

    second.finish(raw.replace('"am-9c43"', '"picked-last"'))
    await settled()
    first.finish(raw)
    await settled()

    const { desk: state, importing } = desk.getSnapshot()
    expect(importing).toEqual({ kind: "idle" })
    expect(state.kind === "open" && state.brief.id).toBe("picked-last")
  })

  it("says why a file is not a brief, and keeps the brief already open", async () => {
    const desk = createDeskRuntime(ports())
    desk.open(file(raw))
    await settled()

    desk.open(file("[]"))
    await settled()

    expect(desk.getSnapshot()).toMatchObject({
      desk: { kind: "open", brief: { id: "am-9c43" } },
      importing: { kind: "rejected" },
    })
  })

  it("is still open after the app restarts", async () => {
    const storage = createInMemoryStorage()
    const before = createDeskRuntime(ports({ storage }))
    before.open(file(raw))
    await settled()
    before.dispatch({ type: "notes", notes: "Halfway through the form" })

    const after = createDeskRuntime(ports({ storage }))
    expect(after.getSnapshot().desk).toMatchObject({
      kind: "open",
      draft: { notes: "Halfway through the form" },
    })
  })
})

describe("sharing the confirmation", () => {
  it("confirms the brief once shared, and not when the sheet is backed out of", async () => {
    const share = vi.fn<DeskPorts["share"]>()
    const desk = createDeskRuntime(ports({ share }))
    desk.open(file(raw))
    await settled()
    desk.dispatch({ type: "outcome", outcome: "applied" })

    share.mockResolvedValueOnce("cancelled")
    await expect(desk.share()).resolves.toBe("cancelled")
    expect(desk.getSnapshot().desk.kind).toBe("open")

    share.mockResolvedValueOnce("shared")
    await desk.share()
    expect(desk.getSnapshot().desk.kind).toBe("confirmed")
    const call = share.mock.calls.at(1)
    expect(call?.[0]).toBe("confirmation-am-9c43.json")
    expect(JSON.parse(call?.[1] ?? "null")).toMatchObject({
      briefId: "am-9c43",
      outcome: "applied",
    })
  })

  it("leaves a brief opened while the sheet was up as it is", async () => {
    let finish: (result: "shared") => void = () => undefined
    const share = vi.fn<DeskPorts["share"]>(
      () =>
        new Promise((resolve) => {
          finish = resolve
        })
    )
    const desk = createDeskRuntime(ports({ share }))
    desk.open(file(raw))
    await settled()
    desk.dispatch({ type: "outcome", outcome: "skipped" })

    const sharing = desk.share()
    desk.open(file(raw.replace('"am-9c43"', '"next-brief"')))
    await settled()
    finish("shared")
    await sharing

    expect(desk.getSnapshot().desk).toMatchObject({
      kind: "open",
      brief: { id: "next-brief" },
      draft: { outcome: null },
    })
  })

  it("shares nothing while no outcome is picked", async () => {
    const share = vi.fn<DeskPorts["share"]>()
    const desk = createDeskRuntime(ports({ share }))
    desk.open(file(raw))
    await settled()

    await expect(desk.share()).resolves.toBe("cancelled")
    expect(share).not.toHaveBeenCalled()
  })
})

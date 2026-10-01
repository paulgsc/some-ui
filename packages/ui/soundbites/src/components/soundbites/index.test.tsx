import { Soundbites } from "@soundbites/components/soundbites"
import { bite, memoryStore } from "@soundbites/lib/__tests__/fixture"
import type { Recording, StartRecording, Take } from "@soundbites/lib/recorder"
import { RecordingError } from "@soundbites/lib/recorder"
import type { SoundbiteContext } from "@soundbites/lib/types"
import { act, fireEvent, render, screen } from "@testing-library/react"
import type { Mock } from "vitest"
import { describe, expect, it, vi } from "vitest"

const CONTEXT: SoundbiteContext = {
  source: "sessions",
  lastSessionAt: "2026-09-29T08:00:00.000Z",
  openSessions: 1,
  timeZone: "UTC",
}

type FakeMic = {
  start: Mock<StartRecording>
  finish: Mock<() => Promise<Take>>
  discard: Mock<() => void>
}

/** A microphone that hears `durationMs` of speech per take. */
function fakeMic(durationMs = 5_000): FakeMic {
  const finish = vi.fn(
    (): Promise<Take> =>
      Promise.resolve({
        blob: new Blob(["voice"], { type: "audio/webm" }),
        mimeType: "audio/webm",
        durationMs,
      })
  )
  const discard = vi.fn((): void => undefined)
  const start = vi.fn(
    (): Promise<Recording> =>
      Promise.resolve({ level: (): number => 0.3, finish, discard })
  )
  return { start, finish, discard }
}

function setup(
  options: {
    kept?: Parameters<typeof memoryStore>[0]
    mic?: FakeMic
    autoStart?: boolean
    onAutoStart?: () => void
  } = {}
): ReturnType<typeof memoryStore> &
  ReturnType<typeof render> & { mic: FakeMic } {
  const mic = options.mic ?? fakeMic()
  const memory = memoryStore(options.kept)
  const view = render(
    <Soundbites
      context={() => CONTEXT}
      store={memory.store}
      startRecording={mic.start}
      autoStart={options.autoStart}
      onAutoStart={options.onAutoStart}
    />
  )
  return { ...memory, ...view, mic }
}

/** Runs `event`, then lets the promises it started settle. */
async function settle(event: () => void): Promise<void> {
  await act(async () => {
    event()
    await Promise.resolve()
  })
}

async function tap(name: string | RegExp): Promise<void> {
  // Found outside `act`, which would hold back the render it waits for.
  const button = await screen.findByRole("button", { name })
  await settle(() => fireEvent.click(button))
}

/** Six kept, `b0` the newest and `b5` the oldest. */
const FULL = Array.from({ length: 6 }, (_, i) => bite(`b${i}`, i * 60))

describe("Soundbites", () => {
  it("listens on one tap and keeps what was said on the next", async () => {
    const { kept, mic } = setup()

    await tap("Start talking")
    expect(mic.start).toHaveBeenCalledTimes(1)
    expect(
      screen.getByRole("button", { name: "Done, keep it" })
    ).toHaveAttribute("aria-pressed", "true")

    await tap("Done, keep it")
    expect(
      await screen.findByText("Kept, 0:05. 1 of 6 on this phone.")
    ).toBeInTheDocument()
    const [saved] = [...kept.values()]
    expect(saved?.bite).toMatchObject({
      durationMs: 5_000,
      mimeType: "audio/webm",
      context: CONTEXT,
    })
    expect(screen.getByRole("img", { name: "1 of 6 kept" })).toBeVisible()
  })

  it("starts listening on arrival when asked, once", async () => {
    const onAutoStart = vi.fn()
    const { mic } = setup({ autoStart: true, onAutoStart })

    expect(
      await screen.findByRole("button", { name: "Done, keep it" })
    ).toBeInTheDocument()
    expect(mic.start).toHaveBeenCalledTimes(1)
    expect(onAutoStart).toHaveBeenCalledTimes(1)
  })

  it("when full, replaces the oldest without asking", async () => {
    const { kept } = setup({ kept: FULL })

    expect(
      await screen.findByText(/Full\. Your next one replaces/)
    ).toHaveTextContent(", the oldest")
    await tap("Start talking")
    await tap("Done, keep it")

    expect(await screen.findByText(/6 of 6 on this phone/)).toBeInTheDocument()
    expect(kept.has("b5")).toBe(false)
    expect(kept.size).toBe(6)
  })

  it("replaces the one picked instead, if the person picks", async () => {
    const { kept } = setup({ kept: FULL })

    // Newest first, so the first offer is b0's; b5, the oldest, is the one
    // already marked.
    const [first] = await screen.findAllByRole("button", {
      name: "Replace this one next instead",
    })
    if (first === undefined) throw new Error("nothing offered to replace")
    await settle(() => fireEvent.click(first))
    expect(
      screen.getByText(/Full\. Your next one replaces/)
    ).not.toHaveTextContent(", the oldest")

    await tap("Start talking")
    await tap("Done, keep it")
    await screen.findByText(/6 of 6 on this phone/)
    expect(kept.has("b0")).toBe(false)
    expect(kept.has("b5")).toBe(true)
  })

  it("stops itself at one minute and keeps it", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const { kept, mic } = setup({ mic: fakeMic(60_000) })

    await tap("Start talking")
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_100)
    })

    expect(mic.finish).toHaveBeenCalledTimes(1)
    expect(kept.size).toBe(1)
  })

  it("keeps nothing from a stray double tap", async () => {
    const { kept } = setup({ mic: fakeMic(300) })

    await tap("Start talking")
    await tap("Done, keep it")

    expect(await screen.findByText(/Too short to keep/)).toBeInTheDocument()
    expect(kept.size).toBe(0)
  })

  it("throws a take away when asked", async () => {
    const { kept, mic } = setup()

    await tap("Start talking")
    await tap("Throw it away")

    expect(mic.discard).toHaveBeenCalledTimes(1)
    expect(screen.getByText("Thrown away. Nothing kept.")).toBeInTheDocument()
    expect(kept.size).toBe(0)
  })

  it("keeps what was said when the screen goes away mid-take", async () => {
    const { kept } = setup()
    await tap("Start talking")

    const visibility = vi
      .spyOn(document, "visibilityState", "get")
      .mockReturnValue("hidden")
    await settle(() => document.dispatchEvent(new Event("visibilitychange")))
    visibility.mockRestore()

    expect(await screen.findByText(/1 of 6 on this phone/)).toBeInTheDocument()
    expect(kept.size).toBe(1)
  })

  it("keeps what was said when the page is left mid-take", async () => {
    const { kept, unmount } = setup()
    await tap("Start talking")

    await settle(unmount)

    expect(kept.size).toBe(1)
  })

  it("says how to turn the microphone on when Android says no", async () => {
    const mic = fakeMic()
    mic.start.mockRejectedValueOnce(new RecordingError("denied"))
    setup({ mic })

    await tap("Start talking")
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Android Settings → Apps → Some UI → Permissions → Microphone"
    )

    await tap("Try again")
    expect(
      screen.getByRole("button", { name: "Done, keep it" })
    ).toBeInTheDocument()
  })

  it("reports a take kept only once it is safely stored", async () => {
    const onKept = vi.fn()
    const memory = memoryStore()
    const save = vi
      .spyOn(memory.store, "save")
      .mockRejectedValueOnce(new Error("IndexedDB unavailable"))
    const mic = fakeMic()
    render(
      <Soundbites
        context={() => CONTEXT}
        store={memory.store}
        startRecording={mic.start}
        onKept={onKept}
      />
    )

    await tap("Start talking")
    await tap("Done, keep it")
    expect(
      await screen.findByText("That one couldn't be kept. Try again?")
    ).toBeInTheDocument()
    expect(onKept).not.toHaveBeenCalled()

    await tap("Start talking")
    await tap("Done, keep it")
    await screen.findByText(/1 of 6 on this phone/)
    expect(save).toHaveBeenCalledTimes(2)
    expect(onKept).toHaveBeenCalledTimes(1)
  })

  it("says a take was kept even when the list cannot be re-read after", async () => {
    const onKept = vi.fn()
    const memory = memoryStore()
    const mic = fakeMic()
    render(
      <Soundbites
        context={() => CONTEXT}
        store={memory.store}
        startRecording={mic.start}
        onKept={onKept}
      />
    )
    await screen.findByText("Nothing kept yet.")
    vi.spyOn(memory.store, "list").mockRejectedValueOnce(new Error("busy"))

    await tap("Start talking")
    await tap("Done, keep it")

    expect(await screen.findByText("Kept, 0:05.")).toBeInTheDocument()
    expect(screen.queryByText(/couldn't be kept/)).not.toBeInTheDocument()
    expect(onKept).toHaveBeenCalledTimes(1)
    expect(memory.kept.size).toBe(1)
  })

  it("plays one recording at a time, however fast the taps", async () => {
    const played: Array<string> = []
    vi.stubGlobal(
      "Audio",
      class {
        onended: (() => void) | null = null
        constructor(readonly src: string) {}
        play(): Promise<void> {
          played.push(this.src)
          return Promise.resolve()
        }
        pause(): void {}
      }
    )
    let urls = 0
    vi.spyOn(URL, "createObjectURL").mockImplementation(() => `blob:${++urls}`)
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined)
    setup({ kept: [bite("a", 5), bite("b", 10)] })

    const [first, second] = await screen.findAllByRole("button", {
      name: /^Play /,
    })
    if (first === undefined || second === undefined)
      throw new Error("two recordings to play")
    await settle(() => {
      fireEvent.click(first)
      fireEvent.click(second)
    })

    await screen.findByRole("button", { name: /^Stop playing / })
    expect(played).toHaveLength(1)
    vi.unstubAllGlobals()
  })

  it("deletes a kept one after asking", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true)
    const { kept } = setup({ kept: [bite("only", 5)] })

    await tap(/^Delete /)

    expect(confirm).toHaveBeenCalledTimes(1)
    expect(await screen.findByText("Nothing kept yet.")).toBeInTheDocument()
    expect(kept.size).toBe(0)
    confirm.mockRestore()
  })
})

import type { JSX } from "react"
import { StrictMode } from "react"
import { Soundbites } from "@soundbites/components/soundbites"
import { bite, memoryStore } from "@soundbites/lib/__tests__/fixture"
import type { SoundbiteSituation } from "@soundbites/lib/machine"
import type { Recording, StartRecording, Take } from "@soundbites/lib/recorder"
import { RecordingError } from "@soundbites/lib/recorder"
import type { ShareSoundbites } from "@soundbites/lib/share"
import type { SoundbiteContext } from "@soundbites/lib/types"
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react"
import type { Mock } from "vitest"
import { describe, expect, it, vi } from "vitest"

const SITUATION: SoundbiteSituation = {
  lastSessionAt: "2026-09-29T08:00:00.000Z",
  openSessions: 1,
  timeZone: "UTC",
}

/** What a take kept on arrival from the sessions list notes. */
const CONTEXT: SoundbiteContext = { ...SITUATION, source: "sessions" }

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
    share?: ShareSoundbites
  } = {}
): ReturnType<typeof memoryStore> &
  ReturnType<typeof render> & { mic: FakeMic } {
  const mic = options.mic ?? fakeMic()
  const memory = memoryStore(options.kept)
  const view = render(
    <Soundbites
      situation={() => SITUATION}
      source="sessions"
      ports={{
        store: memory.store,
        startRecording: mic.start,
        ...(options.share === undefined ? {} : { share: options.share }),
      }}
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

  it("keeps the way in until a take is stored, so a retry still has it", async () => {
    const { kept, store } = setup()
    vi.spyOn(store, "save").mockRejectedValueOnce(
      new Error("IndexedDB unavailable")
    )

    await tap("Start talking")
    await tap("Done, keep it")
    expect(
      await screen.findByText("That one couldn't be kept. Try again?")
    ).toBeInTheDocument()
    expect(kept.size).toBe(0)

    await tap("Start talking")
    await tap("Done, keep it")
    await screen.findByText(/1 of 6 on this phone/)
    expect([...kept.values()][0]?.bite.context.source).toBe("sessions")

    // Once one is stored, any later take on this visit is the page's own.
    await tap("Start talking")
    await tap("Done, keep it")
    await screen.findByText(/2 of 6 on this phone/)
    const sources = [...kept.values()].map((k) => k.bite.context.source)
    expect(sources.sort()).toEqual(["direct", "sessions"])
  })

  it("says a take was kept even when the list cannot be re-read after", async () => {
    const memory = memoryStore()
    const mic = fakeMic()
    render(
      <Soundbites
        situation={() => SITUATION}
        source="sessions"
        ports={{ store: memory.store, startRecording: mic.start }}
      />
    )
    await screen.findByText("Nothing kept yet.")
    vi.spyOn(memory.store, "list").mockRejectedValueOnce(new Error("busy"))

    await tap("Start talking")
    await tap("Done, keep it")

    expect(await screen.findByText("Kept, 0:05.")).toBeInTheDocument()
    expect(screen.queryByText(/couldn't be kept/)).not.toBeInTheDocument()
    expect(memory.kept.size).toBe(1)
    // ... and the list it could not re-read goes unknown, not stale: no
    // "Nothing kept yet" and no 0/6 beside a take that was just kept.
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Couldn't read what's on this phone"
    )
    expect(screen.queryByText("Nothing kept yet.")).toBeNull()
    expect(screen.queryByRole("img", { name: /of 6 kept/ })).toBeNull()
  })

  it("keeps the new recording playing when an old play fails late", async () => {
    const audios: Array<{
      src: string
      fail: (error: Error) => void
    }> = []
    vi.stubGlobal(
      "Audio",
      class {
        onended: (() => void) | null = null
        constructor(readonly src: string) {}
        play(): Promise<void> {
          return new Promise((_resolve, reject) => {
            audios.push({ src: this.src, fail: reject })
          })
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
    await settle(() => fireEvent.click(first))
    await screen.findByRole("button", { name: /^Stop playing / })
    await settle(() => fireEvent.click(second))
    await waitFor(() => expect(audios).toHaveLength(2))

    // The first recording's play, abandoned by the switch, fails now.
    await settle(() => audios[0]?.fail(new Error("interrupted")))

    expect(
      screen.getAllByRole("button", { name: /^Stop playing / })
    ).toHaveLength(1)
    expect(
      screen.getAllByRole("button", { name: /^(Play|Stop playing) / })[1]
    ).toHaveAccessibleName(/^Stop playing /)
    vi.unstubAllGlobals()
  })

  it("says so when a recording's audio cannot be read", async () => {
    const memory = memoryStore([bite("a", 5)])
    vi.spyOn(memory.store, "audio").mockRejectedValueOnce(new Error("busy"))
    render(
      <Soundbites
        situation={() => SITUATION}
        ports={{ store: memory.store, startRecording: fakeMic().start }}
      />
    )

    await tap(/^Play /)

    expect(
      await screen.findByText("That recording couldn't be played.")
    ).toBeInTheDocument()
  })

  it("keeps a recording it could not delete, and says so", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true)
    const memory = memoryStore([bite("a", 5)])
    vi.spyOn(memory.store, "remove").mockRejectedValueOnce(new Error("busy"))
    render(
      <Soundbites
        situation={() => SITUATION}
        ports={{ store: memory.store, startRecording: fakeMic().start }}
      />
    )

    await tap(/^Delete /)

    expect(
      await screen.findByText("That one couldn't be deleted. Try again?")
    ).toBeInTheDocument()
    expect(screen.getByRole("img", { name: "1 of 6 kept" })).toBeVisible()
    confirm.mockRestore()
  })

  it("shows the list unknown when it cannot be re-read after a delete", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true)
    const memory = memoryStore([bite("a", 5), bite("b", 10)])
    render(
      <Soundbites
        situation={() => SITUATION}
        ports={{ store: memory.store, startRecording: fakeMic().start }}
      />
    )
    await screen.findByRole("img", { name: "2 of 6 kept" })
    vi.spyOn(memory.store, "list").mockRejectedValueOnce(new Error("busy"))

    const [first] = screen.getAllByRole("button", { name: /^Delete / })
    if (first === undefined) throw new Error("a recording to delete")
    await settle(() => fireEvent.click(first))

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Couldn't read what's on this phone"
    )
    expect(screen.queryByRole("img", { name: /of 6 kept/ })).toBeNull()
    expect(memory.kept.size).toBe(1)
    confirm.mockRestore()
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

  it("never shows an unreadable phone as an empty one", async () => {
    const memory = memoryStore([bite("kept", 5)])
    vi.spyOn(memory.store, "list").mockRejectedValueOnce(new Error("busy"))
    render(
      <Soundbites
        situation={() => SITUATION}
        ports={{ store: memory.store, startRecording: fakeMic().start }}
      />
    )

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Couldn't read what's on this phone"
    )
    expect(screen.queryByText("Nothing kept yet.")).not.toBeInTheDocument()
    // No count either: an unread phone has none, and 0 would say empty.
    expect(screen.queryByRole("img", { name: /of 6 kept/ })).toBeNull()
    expect(screen.queryByText("0/6")).toBeNull()

    await tap("Read them again")
    expect(
      await screen.findByRole("img", { name: "1 of 6 kept" })
    ).toBeInTheDocument()
    expect(screen.queryByRole("alert")).not.toBeInTheDocument()
  })

  it("plays nothing while the microphone opens (#1636, finding 11)", async () => {
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
    vi.spyOn(URL, "createObjectURL").mockImplementation(() => "blob:1")
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined)
    const mic = fakeMic()
    let open: (recording: Recording) => void = () => undefined
    mic.start.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          open = resolve
        })
    )
    setup({ kept: [bite("a", 5)], mic })

    await tap("Start talking")
    const play = screen.getByRole("button", { name: /^Play / })
    expect(play).toBeDisabled()
    await settle(() => fireEvent.click(play))

    await settle(() =>
      open({ level: () => 0, finish: mic.finish, discard: mic.discard })
    )
    expect(
      screen.getByRole("button", { name: "Done, keep it" })
    ).toBeInTheDocument()
    expect(played).toEqual([])
    vi.unstubAllGlobals()
  })

  it("opens the microphone once under StrictMode's double mount", async () => {
    const memory = memoryStore()
    const mic = fakeMic()
    const onAutoStart = vi.fn()
    render(
      <StrictMode>
        <Soundbites
          situation={() => SITUATION}
          source="sessions"
          autoStart
          onAutoStart={onAutoStart}
          ports={{ store: memory.store, startRecording: mic.start }}
        />
      </StrictMode>
    )

    expect(
      await screen.findByRole("button", { name: "Done, keep it" })
    ).toBeInTheDocument()
    expect(mic.start).toHaveBeenCalledTimes(1)
    expect(mic.discard).not.toHaveBeenCalled()
    expect(onAutoStart).toHaveBeenCalledTimes(1)
  })

  it("shows a take saved by the page that was left, after coming back", async () => {
    const memory = memoryStore()
    const mic = fakeMic()
    const save = memory.store.save
    let commit: () => void = () => undefined
    vi.spyOn(memory.store, "save").mockImplementationOnce(
      (...args) =>
        new Promise((resolve) => {
          commit = (): void => {
            void save(...args).then(resolve)
          }
        })
    )
    const page = (): JSX.Element => (
      <Soundbites
        situation={() => SITUATION}
        ports={{ store: memory.store, startRecording: mic.start }}
      />
    )
    const first = render(page())
    await tap("Start talking")
    // Left mid-take: the take is finishing and its save is still pending.
    await settle(first.unmount)

    render(page())
    expect(await screen.findByText("Nothing kept yet.")).toBeInTheDocument()

    await settle(commit)
    expect(
      await screen.findByRole("img", { name: "1 of 6 kept" })
    ).toBeInTheDocument()
  })

  it("does not open the microphone for a page that mounts hidden, until it shows", async () => {
    const visibility = vi
      .spyOn(document, "visibilityState", "get")
      .mockReturnValue("hidden")
    const onAutoStart = vi.fn()
    const { mic } = setup({ autoStart: true, onAutoStart })
    await screen.findByText("Nothing kept yet.")
    expect(mic.start).not.toHaveBeenCalled()
    expect(onAutoStart).not.toHaveBeenCalled()

    visibility.mockReturnValue("visible")
    await settle(() => document.dispatchEvent(new Event("visibilitychange")))
    expect(
      await screen.findByRole("button", { name: "Done, keep it" })
    ).toBeInTheDocument()
    expect(mic.start).toHaveBeenCalledTimes(1)
    expect(onAutoStart).toHaveBeenCalledTimes(1)
    visibility.mockRestore()
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

  it("sends every kept one, with notes on them, through the share sheet", async () => {
    const share = vi.fn<ShareSoundbites>(() => Promise.resolve("shared"))
    setup({ kept: [bite("a", 5), bite("b", 10)], share })

    await tap("Send all 2")

    await waitFor(() => expect(share).toHaveBeenCalledTimes(1))
    const sent = share.mock.calls[0]?.[0]
    expect(sent?.title).toBe("2 soundbites from Some UI")
    expect(sent?.files.map((file) => file.name)).toEqual([
      "soundbite-20261001T115500Z-a.webm",
      "soundbite-20261001T115000Z-b.webm",
      "soundbites.md",
    ])
    expect(
      await screen.findByText(/^Shared, with a note of when/)
    ).toBeInTheDocument()
  })

  it("sends one, says nothing if the person backs out, and plays nothing meanwhile", async () => {
    let answer: (outcome: "cancelled") => void = () => undefined
    const share = vi.fn<ShareSoundbites>(
      () =>
        new Promise((resolve) => {
          answer = resolve
        })
    )
    setup({ kept: [bite("a", 5), bite("b", 10)], share })
    const [first] = await screen.findAllByRole("button", { name: /^Send / })
    if (first === undefined) throw new Error("no send button")
    await settle(() => fireEvent.click(first))

    await waitFor(() => expect(share).toHaveBeenCalledTimes(1))
    expect(share.mock.calls[0]?.[0].files).toHaveLength(2)
    // The sheet is up: nothing else on the list takes a tap.
    for (const button of screen.getAllByRole("button", { name: /^Play / }))
      expect(button).toBeDisabled()

    await settle(() => answer("cancelled"))
    await waitFor(() =>
      expect(screen.getAllByRole("button", { name: /^Play / })[0]).toBeEnabled()
    )
    expect(screen.queryByText(/Shared|couldn't be shared/)).toBeNull()
  })

  it("offers no send where there is no share sheet", async () => {
    setup({ kept: [bite("a", 5), bite("b", 10)] })

    expect(
      await screen.findAllByRole("button", { name: /^Play / })
    ).toHaveLength(2)
    expect(screen.queryByRole("button", { name: /^Send / })).toBeNull()
  })
})

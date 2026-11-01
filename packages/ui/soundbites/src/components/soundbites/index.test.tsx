import type { JSX } from "react"
import { StrictMode } from "react"
import type { MicOwner } from "@some-ui/voice-capture"
import { microphoneOwner, TAKE_WORDS } from "@some-ui/voice-capture"
import type {
  SimulatedMicrophone,
  SimulatedPlayer,
} from "@some-ui/voice-capture/testing"
import {
  simulatedMicrophone,
  simulatedPlayer,
  SPEAKING,
} from "@some-ui/voice-capture/testing"
import type { SoundbitesProps } from "@soundbites/components/soundbites"
import { Soundbites } from "@soundbites/components/soundbites"
import { bite, memoryStore } from "@soundbites/lib/__tests__/fixture"
import { soundbitesHeldByHome } from "@soundbites/lib/home-held"
import type { SoundbiteSituation } from "@soundbites/lib/machine"
import type { SoundbitesPorts } from "@soundbites/lib/runtime"
import type { SoundbiteContext } from "@soundbites/lib/types"
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

const SITUATION: SoundbiteSituation = {
  lastSessionAt: "2026-09-29T08:00:00.000Z",
  openSessions: 1,
  timeZone: "UTC",
}

/** What a take kept on arrival from the sessions list notes. */
const CONTEXT: SoundbiteContext = { ...SITUATION, source: "sessions" }

const W = TAKE_WORDS

/**
 * The phone the page records on: the shared simulated microphone, hearing
 * five seconds of speech a take unless scripted otherwise, a player, and a
 * microphone of its own, so a take one test leaves holds no other's.
 */
type Phone = {
  readonly mic: SimulatedMicrophone
  readonly player: SimulatedPlayer
  readonly owner: MicOwner
}

function phone(): Phone {
  return {
    mic: simulatedMicrophone({
      now: Date.now,
      fallback: { ...SPEAKING, durationMs: 5_000 },
    }),
    player: simulatedPlayer(),
    owner: microphoneOwner(),
  }
}

function portsOn(
  on: Phone,
  store: SoundbitesPorts["store"]
): Partial<SoundbitesPorts> {
  return {
    store,
    startRecording: on.mic.startRecording,
    player: on.player,
    owner: on.owner,
  }
}

function setup(
  options: {
    kept?: Parameters<typeof memoryStore>[0]
    on?: Phone
    autoStart?: boolean
    onAutoStart?: () => void
    source?: SoundbiteContext["source"]
    footer?: SoundbitesProps["footer"]
  } = {}
): ReturnType<typeof memoryStore> & ReturnType<typeof render> & { on: Phone } {
  const on = options.on ?? phone()
  const memory = memoryStore(options.kept)
  const view = render(
    <Soundbites
      situation={() => SITUATION}
      source={options.source ?? "sessions"}
      ports={portsOn(on, memory.store)}
      autoStart={options.autoStart}
      onAutoStart={options.onAutoStart}
      footer={options.footer}
    />
  )
  return { ...memory, ...view, on }
}

/** Runs `event`, then lets the promises and timers it started settle. */
async function settle(event: () => void): Promise<void> {
  await act(async () => {
    event()
    await new Promise((resolve) => setTimeout(resolve, 5))
  })
}

async function tap(name: string | RegExp): Promise<void> {
  // Found outside `act`, which would hold back the render it waits for.
  const button = await screen.findByRole("button", { name })
  await settle(() => fireEvent.click(button))
}

/** Starts a take, waits for the microphone, and stops it. */
async function record(): Promise<void> {
  await tap(W.buttonLabel.ready)
  await tap(W.buttonLabel.recording)
}

/** The kept soundbites' rows. */
const rows = (): Array<HTMLElement> =>
  within(screen.getByRole("region", { name: "On this phone" })).queryAllByRole(
    "listitem"
  )

/** Six kept, `b0` the newest and `b5` the oldest. */
const FULL = Array.from({ length: 6 }, (_, i) => bite(`b${i}`, i * 60))

afterEach(() => {
  vi.useRealTimers()
  soundbitesHeldByHome(() => (): boolean => false)
})

describe("Soundbites", () => {
  it("listens on one tap and keeps what was said on the next", async () => {
    const { kept, on } = setup({
      footer: (taking) => <p>{taking ? "taking" : "settled"}</p>,
    })
    expect(screen.getByText("settled")).toBeInTheDocument()

    await tap(W.buttonLabel.ready)
    expect(on.mic.asked()).toBe(1)
    expect(screen.getByText("taking")).toBeInTheDocument()
    expect(
      screen.getByRole("button", { name: W.buttonLabel.recording })
    ).toHaveAttribute("aria-pressed", "true")

    await tap(W.buttonLabel.recording)
    expect(await screen.findByText(W.ended.kept)).toBeInTheDocument()
    const [saved] = [...kept.values()]
    expect(saved?.bite).toMatchObject({
      durationMs: 5_000,
      mimeType: "audio/webm;codecs=opus",
      context: CONTEXT,
    })
    expect(await screen.findByText("1 of 6 kept")).toBeVisible()
    expect(rows()).toHaveLength(1)
    expect(rows()[0]).toHaveTextContent(`0:05 · ${W.place.phone}`)
    expect(screen.getByText("settled")).toBeInTheDocument()
    expect(on.mic.open()).toBe(0)
  })

  it("starts listening on arrival when asked, once", async () => {
    const onAutoStart = vi.fn()
    const { on } = setup({ autoStart: true, onAutoStart })

    expect(
      await screen.findByRole("button", { name: W.buttonLabel.recording })
    ).toBeInTheDocument()
    expect(on.mic.asked()).toBe(1)
    expect(onAutoStart).toHaveBeenCalledTimes(1)
  })

  it("counts down the minute, stops itself at it and keeps it", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const on = phone()
    on.mic.script({ ...SPEAKING })
    const { kept } = setup({ on })

    await tap(W.buttonLabel.ready)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_100)
    })
    expect(
      screen.getByRole("button", { name: W.buttonLabel.recording })
    ).toHaveTextContent(/0:5\d left/)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000)
    })

    expect(on.mic.open()).toBe(0)
    expect(kept.size).toBe(1)
    expect([...kept.values()][0]?.bite.durationMs).toBe(60_000)
  })

  it("keeps nothing from a stray double tap", async () => {
    const on = phone()
    on.mic.script({ ...SPEAKING, durationMs: 300 })
    const { kept } = setup({ on })

    await record()

    expect(await screen.findByText(W.ended.short)).toBeInTheDocument()
    expect(kept.size).toBe(0)
  })

  it("when full and home holds none, keeps every one and refuses the next (HF5)", async () => {
    soundbitesHeldByHome(() => (): boolean => false)
    const { kept } = setup({ kept: FULL })

    expect(
      await screen.findByText(
        /These stay on this phone until a home it.s paired with has them/
      )
    ).toBeInTheDocument()
    expect(
      screen.queryByRole("button", { name: "Replace this one next instead" })
    ).toBeNull()
    await record()

    expect(await screen.findByText(W.ended.full)).toBeInTheDocument()
    expect(kept.size).toBe(6)
    expect(kept.has("b5")).toBe(true)
  })

  it("when full, replaces the oldest home holds without asking", async () => {
    soundbitesHeldByHome(
      () =>
        (id): boolean =>
          id !== "b5"
    )
    const { kept } = setup({ kept: FULL })

    expect(
      await screen.findByText(/Full\. Your next one replaces/)
    ).toHaveTextContent(", the oldest home has")
    await record()

    expect(await screen.findByText(W.ended.kept)).toBeInTheDocument()
    expect(kept.has("b5")).toBe(true)
    expect(kept.has("b4")).toBe(false)
    expect(kept.size).toBe(6)
  })

  it("replaces the one picked instead, if the person picks", async () => {
    soundbitesHeldByHome(() => (): boolean => true)
    const { kept } = setup({ kept: FULL })

    // Newest first, so the first offer is b0's; b5, the oldest, is the one
    // already marked.
    const [first] = await screen.findAllByRole("button", {
      name: "Replace this one next instead",
    })
    if (first === undefined) throw new Error("nothing offered to replace")
    expect(screen.getByText("Replaced by your next one")).toBeInTheDocument()
    await settle(() => fireEvent.click(first))
    expect(
      screen.getByText(/Full\. Your next one replaces/)
    ).not.toHaveTextContent(", the oldest home has")

    await record()
    await screen.findByText(W.ended.kept)
    expect(kept.has("b0")).toBe(false)
    expect(kept.has("b5")).toBe(true)
  })

  it("says on each row where it is kept, and what the app noted", async () => {
    soundbitesHeldByHome(
      () =>
        (id): boolean =>
          id === "a"
    )
    setup({ kept: [bite("a", 5), bite("b", 10)] })
    await screen.findByText("2 of 6 kept")
    const [a, b] = rows()
    expect(a).toHaveTextContent(`0:12 · ${W.place.home}`)
    expect(a).toHaveTextContent("No sessions yet")
    expect(b).toHaveTextContent(`0:12 · ${W.place.phone}`)
  })

  it("keeps what was said when the screen goes away mid-take", async () => {
    const { kept } = setup()
    await tap(W.buttonLabel.ready)

    const visibility = vi
      .spyOn(document, "visibilityState", "get")
      .mockReturnValue("hidden")
    await settle(() => document.dispatchEvent(new Event("visibilitychange")))
    visibility.mockRestore()

    expect(await screen.findByText("1 of 6 kept")).toBeInTheDocument()
    expect(kept.size).toBe(1)
  })

  it("keeps what was said when the page is left mid-take", async () => {
    const { kept, unmount } = setup()
    await tap(W.buttonLabel.ready)

    await settle(unmount)

    expect(kept.size).toBe(1)
  })

  it("says how to turn the microphone on when Android says no, and tries again on a tap", async () => {
    const on = phone()
    on.mic.script({
      ...SPEAKING,
      open: { kind: "refuse", reason: "denied", ms: 0 },
    })
    setup({ on })

    await tap(W.buttonLabel.ready)
    expect(
      await screen.findByText(
        /Android Settings → Apps → Some UI → Permissions → Microphone/
      )
    ).toBeInTheDocument()

    await tap(W.buttonLabel.ready)
    expect(
      screen.getByRole("button", { name: W.buttonLabel.recording })
    ).toBeInTheDocument()
  })

  it("keeps the way in until a take is stored, so a retry still has it", async () => {
    const { kept, store } = setup()
    vi.spyOn(store, "save").mockRejectedValueOnce(
      new Error("IndexedDB unavailable")
    )

    await record()
    expect(await screen.findByText(W.ended.failed)).toBeInTheDocument()
    expect(kept.size).toBe(0)

    await record()
    await screen.findByText("1 of 6 kept")
    expect([...kept.values()][0]?.bite.context.source).toBe("sessions")

    // Once one is stored, any later take on this visit is the page's own.
    await record()
    await screen.findByText("2 of 6 kept")
    const sources = [...kept.values()].map((k) => k.bite.context.source)
    expect(sources.sort()).toEqual(["direct", "sessions"])
  })

  it("says a take was kept even when the list cannot be re-read after", async () => {
    const { kept, store } = setup()
    await screen.findByText("Nothing kept yet.")
    vi.spyOn(store, "list").mockRejectedValueOnce(new Error("busy"))

    await record()

    expect(await screen.findByText(W.ended.kept)).toBeInTheDocument()
    expect(kept.size).toBe(1)
    // ... and the list it could not re-read goes unknown, not stale: no
    // "Nothing kept yet" and no 0/6 beside a take that was just kept.
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Couldn't read what's on this phone"
    )
    expect(screen.queryByText("Nothing kept yet.")).toBeNull()
    expect(screen.queryByText(/of 6 kept/)).toBeNull()
  })

  it("plays one recording at a time, however fast the taps", async () => {
    const { on } = setup({ kept: [bite("a", 5), bite("b", 10)] })

    const [first, second] = await screen.findAllByRole("button", {
      name: W.rowLabel(W.play, 12_000),
    })
    if (first === undefined || second === undefined)
      throw new Error("two recordings to play")
    await settle(() => {
      fireEvent.click(first)
      fireEvent.click(second)
    })

    expect(
      await screen.findAllByRole("button", { name: W.rowLabel(W.stop, 12_000) })
    ).toHaveLength(1)
    expect(on.player.playing()).toBe(1)
    await settle(() => on.player.finish())
    expect(
      screen.queryAllByRole("button", { name: W.rowLabel(W.stop, 12_000) })
    ).toHaveLength(0)
  })

  it("says so when a recording's audio cannot be read", async () => {
    const { store } = setup({ kept: [bite("a", 5)] })
    vi.spyOn(store, "audio").mockRejectedValueOnce(new Error("busy"))

    await tap(W.rowLabel(W.play, 12_000))

    expect(await screen.findByText(W.unplayable)).toBeInTheDocument()
  })

  it("never shows an unreadable phone as an empty one", async () => {
    const memory = memoryStore([bite("kept", 5)])
    vi.spyOn(memory.store, "list").mockRejectedValueOnce(new Error("busy"))
    render(
      <Soundbites
        situation={() => SITUATION}
        ports={portsOn(phone(), memory.store)}
      />
    )

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Couldn't read what's on this phone"
    )
    expect(screen.queryByText("Nothing kept yet.")).not.toBeInTheDocument()
    // No count either: an unread phone has none, and 0 would say empty.
    expect(screen.queryByText(/of 6 kept/)).toBeNull()

    await tap("Read them again")
    expect(await screen.findByText("1 of 6 kept")).toBeInTheDocument()
    expect(screen.queryByRole("alert")).not.toBeInTheDocument()
  })

  it("plays nothing while the microphone opens", async () => {
    const on = phone()
    on.mic.script({ ...SPEAKING, open: { kind: "cue" } })
    setup({ kept: [bite("a", 5)], on })

    await tap(W.buttonLabel.ready)
    const play = screen.getByRole("button", {
      name: W.rowLabel(W.play, 12_000),
    })
    expect(play).toBeDisabled()
    await settle(() => fireEvent.click(play))

    await settle(() => on.mic.answer("open"))
    expect(
      screen.getByRole("button", { name: W.buttonLabel.recording })
    ).toBeInTheDocument()
    expect(on.player.playing()).toBe(0)
  })

  it("opens the microphone once under StrictMode's double mount", async () => {
    const memory = memoryStore()
    const on = phone()
    const onAutoStart = vi.fn()
    render(
      <StrictMode>
        <Soundbites
          situation={() => SITUATION}
          source="sessions"
          autoStart
          onAutoStart={onAutoStart}
          ports={portsOn(on, memory.store)}
        />
      </StrictMode>
    )

    expect(
      await screen.findByRole("button", { name: W.buttonLabel.recording })
    ).toBeInTheDocument()
    expect(on.mic.asked()).toBe(1)
    expect(on.mic.discarded()).toBe(0)
    expect(onAutoStart).toHaveBeenCalledTimes(1)
  })

  it("shows a take saved by the page that was left, after coming back", async () => {
    const memory = memoryStore()
    const on = phone()
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
        ports={portsOn(on, memory.store)}
      />
    )
    const first = render(page())
    await tap(W.buttonLabel.ready)
    // Left mid-take: the take is finishing and its save is still pending.
    await settle(first.unmount)

    render(page())
    expect(await screen.findByText("Nothing kept yet.")).toBeInTheDocument()

    await settle(commit)
    expect(await screen.findByText("1 of 6 kept")).toBeInTheDocument()
  })

  it("does not open the microphone for a page that mounts hidden, until it shows", async () => {
    const visibility = vi
      .spyOn(document, "visibilityState", "get")
      .mockReturnValue("hidden")
    const onAutoStart = vi.fn()
    const { on } = setup({ autoStart: true, onAutoStart })
    await screen.findByText("Nothing kept yet.")
    expect(on.mic.asked()).toBe(0)
    expect(onAutoStart).not.toHaveBeenCalled()

    visibility.mockReturnValue("visible")
    await settle(() => document.dispatchEvent(new Event("visibilitychange")))
    expect(
      await screen.findByRole("button", { name: W.buttonLabel.recording })
    ).toBeInTheDocument()
    expect(on.mic.asked()).toBe(1)
    expect(onAutoStart).toHaveBeenCalledTimes(1)
    visibility.mockRestore()
  })

  it("asks for a comment, not a reason, from Talk now", async () => {
    setup({ source: "capture" })
    expect(
      await screen.findByRole("heading", { name: "Talk now" })
    ).toBeInTheDocument()
    expect(screen.queryByText("Too tired")).not.toBeInTheDocument()
  })

  it("keeps asking for a comment once the way in is forgotten", async () => {
    const { rerender } = setup({ source: "capture" })
    await screen.findByRole("heading", { name: "Talk now" })
    // The route clears `?say=` once listening starts, so `source` turns
    // "direct" mid-take.
    rerender(
      <Soundbites situation={() => SITUATION} source="direct" ports={{}} />
    )
    expect(
      screen.getByRole("heading", { name: "Talk now" })
    ).toBeInTheDocument()
    expect(screen.queryByText("Too tired")).not.toBeInTheDocument()
  })

  it("asks like any other visit once the Talk now take is kept", async () => {
    setup({ source: "capture" })
    await record()
    await screen.findByText(W.ended.kept)
    // The runtime records the next take as "direct", so the page asks as it
    // does for one.
    expect(
      screen.getByRole("heading", { name: "Not today?" })
    ).toBeInTheDocument()
  })

  it("asks why, with starters, from a skipped session", async () => {
    setup()
    expect(
      await screen.findByRole("heading", { name: "Not today?" })
    ).toBeInTheDocument()
    expect(screen.getByText("Too tired")).toBeInTheDocument()
  })

  it("lets one go without asking: set aside, still kept on this phone (D3)", async () => {
    const { kept } = setup({ kept: [bite("only", 5), bite("other", 10)] })

    const [newest] = await screen.findAllByRole("button", {
      name: W.rowLabel(W.letGo, 12_000),
    })
    if (newest === undefined) throw new Error("a row to let go")
    await settle(() => fireEvent.click(newest))

    expect(screen.queryByRole("dialog")).toBeNull()
    expect(await screen.findByText(W.setAside.phone)).toBeInTheDocument()
    await waitFor(() => expect(rows()).toHaveLength(1))
    expect(kept.get("only")?.bite.standing).toBe("set-aside")
    expect(kept.size).toBe(2)
    expect(screen.getByText("2 of 6 kept")).toBeVisible()
  })

  it("says so when a let-go one couldn't be set aside", async () => {
    const { store } = setup({ kept: [bite("only", 5)] })
    vi.spyOn(store, "setAside").mockRejectedValueOnce(new Error("busy"))

    await tap(W.rowLabel(W.letGo, 12_000))

    expect(
      await screen.findByText("That one couldn't be set aside. Try again?")
    ).toBeInTheDocument()
    // The pattern takes back its word: no line says it was set aside.
    expect(screen.queryByText(W.setAside.phone)).toBeNull()
    expect(rows()).toHaveLength(1)
  })

  it("makes room at the cap from one let go before any still listed", async () => {
    soundbitesHeldByHome(() => (): boolean => true)
    const { kept } = setup({ kept: FULL })

    const [newest] = await screen.findAllByRole("button", {
      name: W.rowLabel(W.letGo, 12_000),
    })
    if (newest === undefined) throw new Error("a row to let go")
    await settle(() => fireEvent.click(newest))
    await waitFor(() => expect(rows()).toHaveLength(5))
    // The next one replaces the one set aside, so the line names no row.
    expect(
      screen.getByText(/Full\. Your next one replaces/)
    ).toBeInTheDocument()

    await record()
    await screen.findByText(W.ended.kept)
    expect(kept.has("b0")).toBe(false)
    expect(kept.has("b5")).toBe(true)
    expect(kept.size).toBe(6)
  })

  it("counts set-aside and earlier ones toward the six, and refuses a seventh while home holds none", async () => {
    soundbitesHeldByHome(() => (): boolean => false)
    const { kept } = setup({
      kept: FULL.map((each, i) =>
        i === 0
          ? { ...each, standing: "set-aside" as const }
          : i === 1
            ? { ...each, standing: "earlier" as const }
            : each
      ),
    })
    expect(await screen.findByText("6 of 6 kept")).toBeVisible()

    await record()

    expect(await screen.findByText(W.ended.full)).toBeInTheDocument()
    expect(kept.size).toBe(6)
    expect(kept.get("b0")?.bite.standing).toBe("set-aside")
  })

  it("redoes one at the cap: the oldest home holds makes room, and the redone one is kept as earlier", async () => {
    soundbitesHeldByHome(() => (): boolean => true)
    const { kept } = setup({ kept: FULL })

    const [newest] = await screen.findAllByRole("button", {
      name: W.rowLabel(W.redo, 12_000),
    })
    if (newest === undefined) throw new Error("a row to redo")
    await settle(() => fireEvent.click(newest))
    await tap(W.buttonLabel.recording)

    expect(await screen.findByText(W.earlier(1))).toBeInTheDocument()
    expect(kept.get("b0")?.bite.standing).toBe("earlier")
    expect(kept.has("b5")).toBe(false)
    expect(kept.size).toBe(6)
  })

  it("redoes one: the new one is listed, and the earlier one kept apart (D2)", async () => {
    const { kept } = setup({ kept: [bite("only", 5)] })

    await tap(W.rowLabel(W.redo, 12_000))
    await tap(W.buttonLabel.recording)

    expect(await screen.findByText(W.earlier(1))).toBeInTheDocument()
    expect(kept.get("only")?.bite.standing).toBe("earlier")
    expect(kept.size).toBe(2)
  })
})

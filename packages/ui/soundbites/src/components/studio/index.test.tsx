import { inMemoryStorage } from "@some-ui/core-utils"
import { REVIEW_SCHEMA } from "@some-ui/video-render"
import { parseEpisode } from "@some-ui/video-render/testing"
import type { Playback } from "@some-ui/voice-capture"
import { TAKE_WORDS } from "@some-ui/voice-capture"
import { simulatedMicrophone, SPEAKING } from "@some-ui/voice-capture/testing"
import type { StudioProps } from "@soundbites/components/studio"
import { Studio } from "@soundbites/components/studio"
import { episodeProjectOf } from "@soundbites/fixtures"
import { memoryProjectStore } from "@soundbites/lib/project/memory-store"
import type { Project } from "@soundbites/lib/project/model"
import { newProject } from "@soundbites/lib/project/model"
import { cutListOf } from "@soundbites/lib/project/script"
import {
  episodeText,
  primer,
  PRIMER_TEXT,
  speaking,
} from "@soundbites/lib/studio/__tests__/fixture"
import { keptLetGo } from "@soundbites/lib/studio/let-go-store"
import type { StudioPorts } from "@soundbites/lib/studio/runtime"
import { STUDIO_WORDS } from "@soundbites/lib/studio/words"
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

const W = STUDIO_WORDS

function setup(
  share?: StudioProps["share"],
  initial: ReadonlyArray<Project> = [],
  text = PRIMER_TEXT,
  more: Partial<StudioPorts> = {},
  props: Partial<StudioProps> = {}
): ReturnType<typeof memoryProjectStore> {
  const memory = memoryProjectStore(initial)
  let tick = 0
  render(
    <Studio
      ports={{
        store: memory.store,
        startRecording: speaking(),
        now: () => Date.UTC(2026, 9, 30, 10) + 1_000 * tick++,
        newId: () => `t${tick}`,
        readText: () => Promise.resolve(text),
        onVisibility: (listener) => {
          listener(false)
          return (): void => undefined
        },
        player: {
          play: (): Playback => ({
            ended: new Promise(() => undefined),
            stop: vi.fn(),
          }),
        },
        ...more,
      }}
      share={share}
      {...props}
    />
  )
  return memory
}

type Refresher = Parameters<NonNullable<StudioPorts["refresh"]>>[0]

/** The shell's refresh port, as a set: what is registered now. */
function refreshPort(): {
  refresh: NonNullable<StudioPorts["refresh"]>
  live: Set<Refresher>
} {
  const live = new Set<Refresher>()
  return {
    live,
    refresh: (refresher) => {
      live.add(refresher)
      return () => live.delete(refresher)
    },
  }
}

/** Every registered refresher's check, as a pull runs them. */
async function pull(live: ReadonlySet<Refresher>): Promise<void> {
  await act(async () => {
    await Promise.all([...live].map((each) => each.checkAgain()))
  })
}

async function openPrimer(): Promise<void> {
  const pick = await screen.findByLabelText(new RegExp(`^${W.start.openSent}`))
  fireEvent.change(pick, {
    target: { files: [new File(["{}"], "primer.json")] },
  })
  await screen.findByText("Playoff Delta, week 8")
}

async function takeOne(): Promise<void> {
  // The take pattern's button: tap to talk, tap to stop, then again.
  fireEvent.click(
    await screen.findByRole("button", { name: TAKE_WORDS.buttonLabel.ready })
  )
  fireEvent.click(
    await screen.findByRole("button", {
      name: TAKE_WORDS.buttonLabel.recording,
    })
  )
  await screen.findByRole("button", { name: TAKE_WORDS.buttonLabel.again })
  // The scene's chosen take, as the pattern's row, with Play it back.
  expect(
    screen.getByRole("button", {
      name: TAKE_WORDS.rowLabel(TAKE_WORDS.play, 4_000),
    })
  ).toBeEnabled()
}

/** A finger across `on`, `dx` pixels, as the shared pager hears it. */
function swipeAcross(on: Element, dx: number): void {
  const at = (x: number): { touches: Array<Partial<Touch>> } => ({
    touches: [{ clientX: x, clientY: 300, identifier: 0 }],
  })
  fireEvent.touchStart(on, at(200))
  fireEvent.touchMove(on, at(200 + dx / 2))
  fireEvent.touchMove(on, at(200 + dx))
  fireEvent.touchEnd(on, { touches: [] })
}

describe("Studio", () => {
  it("shows a ready episode's upload copy from its show, each part with its copy button (SH5)", async () => {
    const episode = parseEpisode(JSON.parse(episodeText()))
    if (!episode.ok) throw new Error(episode.problems.join("; "))
    const { project } = newProject(
      "ep",
      {
        author: "claude",
        message: "First cut",
        at: "2026-10-30T09:00:00.000Z",
        cutList: cutListOf(primer()),
      },
      episode.value.episode
    )
    const at = "2026-10-30T09:00:00.000Z"
    const shots = project.revisions[0]?.cutList.shots ?? []
    // Every scene taken, and marked ready.
    const ready: Project = {
      ...project,
      takes: shots.map((each) => ({
        id: `t-${each.id}`,
        shot: each.id,
        recordedAt: at,
        durationMs: 4_000,
        mimeType: "audio/webm",
        keptBy: [],
        onPhone: true,
      })),
      chosen: Object.fromEntries(
        shots.map((each) => [each.id, `t-${each.id}`])
      ),
      ready: [{ rev: 1, at }],
    }
    const copied: Array<string> = []
    setup(
      undefined,
      [ready],
      PRIMER_TEXT,
      {},
      {
        copy: ({ text, what }) => (
          <button type="button" onClick={() => copied.push(text)}>
            {`Copy ${what}`}
          </button>
        ),
      }
    )
    fireEvent.click(
      await screen.findByRole("button", {
        name: new RegExp(W.start.sittings.finish),
      })
    )
    const upload = episode.value.episode.upload
    if (upload === undefined) throw new Error("the fixture carries copy")
    expect(
      await screen.findByRole("region", { name: W.finish.upload.heading })
    ).toBeInTheDocument()
    // Where a review is looked for, Finish says what Studio checks and
    // what it doesn't judge (ST34, decision 10).
    expect(screen.getByText(W.judges)).toBeInTheDocument()
    expect(screen.getByText(upload.title)).toBeInTheDocument()
    expect(screen.getByText(upload.description)).toBeInTheDocument()
    expect(screen.queryByText(W.finish.uploadCopy)).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "Copy title" }))
    fireEvent.click(screen.getByRole("button", { name: "Copy description" }))
    expect(copied).toEqual([upload.title, upload.description])
    expect(screen.getByLabelText(W.finish.linkLabel)).toBeInTheDocument()
    // Home making it (ST33).
    const home = screen.getByRole("region", { name: W.finish.toHome.heading })
    expect(home).toHaveTextContent(W.finish.toHome.offer)
    expect(home).toHaveTextContent(W.finish.toHome.drive)
    fireEvent.click(
      screen.getByRole("button", { name: W.finish.toHome.button })
    )
    expect(await screen.findByText(W.finish.toHome.handed)).toBeInTheDocument()
    // Held in its place once asked; where it stands is said over the screen.
    expect(
      screen.getByRole("button", { name: W.finish.toHome.button })
    ).toBeDisabled()
    expect(
      screen.getByText(/Kept on this phone since .*paired/)
    ).toBeInTheDocument()
  })

  it("shows the loop as steps with no video, then Record as the place to start once Claude's scenes are opened", async () => {
    setup()
    expect(await screen.findByText(W.start.empty)).toBeInTheDocument()
    for (const step of Object.values(W.start.steps)) {
      expect(screen.getByText(step.title)).toBeInTheDocument()
    }
    expect(
      screen.getByRole("list", { name: W.start.steps.sittings.title })
    ).toHaveTextContent(Object.values(W.start.sittings).join(""))
    await openPrimer()
    expect(screen.queryByText(W.start.steps.idea.title)).toBeNull()
    expect(screen.getByText(W.start.startHere)).toBeInTheDocument()
    expect(screen.getByText(W.recordStatus(0, 3))).toBeInTheDocument()
    expect(screen.getByText(W.finish.status.take(1))).toBeInTheDocument()
  })

  it("records a scene: its point, its voice, what must stay true, then Again or Keep", async () => {
    setup()
    await openPrimer()
    fireEvent.click(screen.getByRole("button", { name: /^Record/ }))
    expect(
      await screen.findByText("Following the model paid off this week")
    ).toBeInTheDocument()
    expect(screen.getByText(W.record.adLib)).toBeInTheDocument()
    expect(screen.getByText(W.record.mustStayTrue(2))).toBeInTheDocument()
    // How long the scene runs, and how long a take may: what is left of the
    // video's time.
    const runs = W.record.runs(20_000, 0).split(" · ")[0] ?? ""
    expect(
      screen.getByText((text) => text.startsWith(`${runs} · `))
    ).toBeInTheDocument()
    await takeOne()
    // The scene's length follows the take at once.
    expect(screen.getByText(W.record.runsWith(4_700))).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: W.record.keepNext }))
    expect(
      await screen.findByText("One pick missed, and here is why.")
    ).toBeInTheDocument()
    expect(screen.getByText(W.record.read)).toBeInTheDocument()
  })

  it("checks Start, a show and an episode's Start again on a pull through the refresh port, and Record not at all (SH6)", async () => {
    const { refresh, live } = refreshPort()
    const week = (period: string, sum: string, at: string): Project =>
      episodeProjectOf(`w-${period}`, episodeText(period, sum), at).project
    const memory = setup(
      undefined,
      [week("week 3", "a", "2026-10-29T09:00:00.000Z")],
      PRIMER_TEXT,
      { refresh }
    )
    // The episode's Start.
    await screen.findByText(W.show.made)
    expect([...live].map((each) => each.what)).toEqual([W.pullWhat])
    fireEvent.click(screen.getByRole("button", { name: /^Weekly/ }))
    await screen.findByText(W.show.episodes)
    expect(live.size).toBe(1)
    // An episode kept on the phone since, by something that told no screen,
    // is on the show's screen once a pull checks again.
    const week4 = week("week 4", "b", "2026-11-03T09:00:00.000Z")
    memory.projects.set(week4.id, week4)
    expect(screen.queryByText(/week 4/)).toBeNull()
    await pull(live)
    expect(await screen.findByText(/week 4/)).toBeInTheDocument()
  })

  it("registers nothing on Record: a take is under way there (SH6)", async () => {
    const { refresh, live } = refreshPort()
    setup(undefined, [], PRIMER_TEXT, { refresh })
    await openPrimer()
    expect(live.size).toBe(1)
    fireEvent.click(screen.getByRole("button", { name: /^Record/ }))
    await screen.findByText("Following the model paid off this week")
    expect(live.size).toBe(0)
  })

  it("swipes between scenes through the shared pager, as Previous and Keep and next do (GES5)", async () => {
    setup()
    await openPrimer()
    fireEvent.click(screen.getByRole("button", { name: /^Record/ }))
    await screen.findByText("Following the model paid off this week")
    const scene = (): HTMLElement =>
      screen.getByRole("region", { name: /^Scene \d of \d/ })
    await takeOne()
    swipeAcross(scene(), -90)
    expect(
      await screen.findByText("One pick missed, and here is why.")
    ).toBeInTheDocument()
    expect(scene()).toHaveAccessibleName(W.record.sceneOf(2, 3))
    // Both visible controls are still there.
    expect(
      screen.getByRole("button", { name: W.record.previous })
    ).toBeEnabled()
    swipeAcross(scene(), 90)
    expect(
      await screen.findByText("Following the model paid off this week")
    ).toBeInTheDocument()
  })

  it("lets a take go when its button is tapped while the microphone opens", async () => {
    const mic = simulatedMicrophone({ now: Date.now })
    mic.script({ ...SPEAKING, open: { kind: "cue" } })
    setup(undefined, [], PRIMER_TEXT, { startRecording: mic.startRecording })
    await openPrimer()
    fireEvent.click(screen.getByRole("button", { name: /^Record/ }))
    fireEvent.click(
      await screen.findByRole("button", { name: TAKE_WORDS.buttonLabel.ready })
    )
    fireEvent.click(
      await screen.findByRole("button", {
        name: TAKE_WORDS.buttonLabel.opening,
      })
    )
    expect(await screen.findByText(W.notice.early)).toBeInTheDocument()
    expect(
      screen.getByRole("button", { name: TAKE_WORDS.buttonLabel.ready })
    ).toBeInTheDocument()
    // Opened after all: let go at once, never recording.
    act(() => mic.answer("open"))
    await waitFor(() => expect(mic.discarded()).toBe(1))
    expect(mic.open()).toBe(0)
    expect(
      screen.queryByRole("button", { name: TAKE_WORDS.buttonLabel.recording })
    ).toBeNull()
  })

  it("done for now asks how it went, then says where it was left and offers the share", async () => {
    const share = vi.fn<NonNullable<StudioProps["share"]>>(() => (
      <button type="button">{W.done.share}</button>
    ))
    setup(share)
    await openPrimer()
    fireEvent.click(screen.getByRole("button", { name: /^Record/ }))
    await takeOne()
    fireEvent.click(screen.getByRole("button", { name: W.record.doneForNow }))
    expect(await screen.findByText(W.done.how)).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: W.done.went.snags }))
    expect(await screen.findByText(W.done.what)).toBeInTheDocument()
    fireEvent.click(
      screen.getByRole("button", { name: W.done.snags.interrupted })
    )
    expect(await screen.findByText(W.done.saved)).toBeInTheDocument()
    expect(
      screen.getByText(W.done.opensOn(1, "The path card"))
    ).toBeInTheDocument()
    expect(
      screen.getByRole("button", { name: W.done.share })
    ).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: W.done.notYet }))
    expect(
      await screen.findByText(
        W.standing({
          done: W.sittingDone([1]),
          next: W.sittingNext({ n: 2, artifact: "The miss" }),
        })
      )
    ).toBeInTheDocument()
  })

  it("smooth skips what got in the way", async () => {
    const memory = setup()
    await openPrimer()
    fireEvent.click(screen.getByRole("button", { name: /^Record/ }))
    await takeOne()
    fireEvent.click(screen.getByRole("button", { name: W.record.doneForNow }))
    fireEvent.click(
      await screen.findByRole("button", { name: W.done.went.smooth })
    )
    expect(await screen.findByText(W.done.saved)).toBeInTheDocument()
    await waitFor(() =>
      expect(memory.friction).toMatchObject([
        { went: "smooth", gotInTheWay: null },
      ])
    )
  })

  it("offers when takes leave once home holds one, and under keep until Drive has it lets a take go only on its Drive has it (HF11)", async () => {
    const video = newProject("held", {
      author: "claude",
      message: "Primer",
      at: "2026-10-29T09:00:00.000Z",
      cutList: cutListOf(primer()),
      primer: primer(),
    }).project
    const held: Project = {
      ...video,
      takes: [
        {
          id: "t1",
          shot: "path",
          recordedAt: "2026-10-29T09:05:00.000Z",
          durationMs: 4_000,
          mimeType: "audio/webm",
          keptBy: ["home"],
          onPhone: true,
        },
      ],
      chosen: { path: "t1" },
    }
    const storage = inMemoryStorage()
    const memory = setup(undefined, [held], PRIMER_TEXT, {
      letGo: keptLetGo(() => storage),
    })
    const card = await screen.findByRole("region", { name: W.letGo.heading })
    expect(card).toHaveTextContent(W.letGo.ask(1))
    // Nothing to confirm until the owner chooses.
    expect(
      screen.queryByRole("button", { name: W.letGo.driveHasIt })
    ).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: W.letGo.choices.drive }))
    expect(await screen.findByText(W.letGo.says.drive)).toBeInTheDocument()
    expect(
      screen.getByRole("button", { name: W.letGo.choices.drive })
    ).toHaveAttribute("aria-pressed", "true")
    expect(memory.audio.has("held:t1")).toBe(true)
    fireEvent.click(
      screen.getByRole("button", { name: W.letGo.driveHasItFor(1, 4_000) })
    )
    expect(await screen.findByText(W.letGo.driveLeft)).toBeInTheDocument()
    expect(memory.audio.has("held:t1")).toBe(false)
    expect(keptLetGo(() => storage).read()).toBe("drive")
  })

  it("lists the other videos holding takes on the phone, and opens one", async () => {
    const video = (id: string, title: string, at: string): Project =>
      newProject(id, {
        author: "claude",
        message: "Primer",
        at,
        cutList: cutListOf({ ...primer(), title }),
        primer: { ...primer(), title },
      }).project
    const older: Project = {
      ...video("older", "Week 7", "2026-10-20T09:00:00.000Z"),
      takes: [
        {
          id: "t1",
          shot: "path",
          recordedAt: "2026-10-20T09:05:00.000Z",
          durationMs: 4_000,
          mimeType: "audio/webm",
          keptBy: [],
          onPhone: true,
        },
      ],
      chosen: { path: "t1" },
    }
    const share = vi.fn<NonNullable<StudioProps["share"]>>(() => (
      <button type="button">{W.done.share}</button>
    ))
    setup(share, [older, video("newer", "Week 8", "2026-10-29T09:00:00.000Z")])
    expect(await screen.findByText("Week 8")).toBeInTheDocument()
    expect(screen.getByText(W.start.others)).toBeInTheDocument()
    expect(screen.getByText(W.start.onPhone(1))).toBeInTheDocument()
    // Week 8 holds no takes on the phone, so it offers no share yet.
    expect(screen.queryByRole("button", { name: W.done.share })).toBeNull()
    fireEvent.click(
      screen.getByRole("button", { name: `${W.start.open}: Week 7` })
    )
    expect(await screen.findByText("Week 7")).toBeInTheDocument()
    expect(screen.getByText(W.start.shareLine)).toBeInTheDocument()
    expect(share).toHaveBeenLastCalledWith(
      expect.objectContaining({ project: older })
    )
  })

  it("asks whose idea the scene playing is, one task at a time, and then says it", async () => {
    const { project } = newProject("week-8", {
      author: "claude",
      message: "Primer",
      at: "2026-10-29T09:00:00.000Z",
      cutList: cutListOf(primer()),
      primer: primer(),
    })
    const shots = project.revisions[0]?.cutList.shots ?? []
    let start = 0
    const review = JSON.stringify({
      schema: REVIEW_SCHEMA,
      title: "Playoff Delta, week 8",
      rev: 1,
      shotTimes: shots.map((each) => {
        const at = start
        start += each.durationMs
        return {
          id: each.id,
          cut: null,
          startMs: at,
          durationMs: each.durationMs,
        }
      }),
    })
    // The render plays from the picked file, by a link jsdom doesn't make.
    vi.stubGlobal(
      "URL",
      class extends URL {
        static override createObjectURL = (): string => "blob:review"
        static override revokeObjectURL = (): void => undefined
      }
    )
    setup(undefined, [project], review)
    expect(await screen.findByText(W.watch.status(0, 3))).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: /^Watch/ }))
    fireEvent.change(
      await screen.findByLabelText(new RegExp(`^${W.watch.open}`)),
      {
        target: {
          files: [
            new File(["v"], "review.mp4", { type: "video/mp4" }),
            new File(["{}"], "review.json", { type: "application/json" }),
          ],
        },
      }
    )
    expect(await screen.findByText(W.origin.question(1))).toBeInTheDocument()
    expect(
      screen.getByText(W.origin.proposed({ who: "agent" }))
    ).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: W.origin.notQuite }))
    expect(await screen.findByText(W.origin.where)).toBeInTheDocument()
    // One task: the note form waits while the idea is put right.
    expect(screen.queryByLabelText(W.watch.noteLabel)).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: W.origin.back }))
    fireEvent.click(await screen.findByRole("button", { name: W.origin.right }))
    // Once said, the scene says so quietly as it plays.
    expect(
      await screen.findByText(W.origin.said(1, { who: "agent" }))
    ).toBeInTheDocument()
    expect(screen.queryByText(W.origin.question(1))).toBeNull()
    vi.unstubAllGlobals()
  })
})

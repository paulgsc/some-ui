import type {
  Playback,
  Recording,
  StartRecording,
  Take,
} from "@some-ui/voice-capture"
import type { StudioProps } from "@soundbites/components/studio"
import { Studio } from "@soundbites/components/studio"
import type { Project } from "@soundbites/lib/project/model"
import { newProject } from "@soundbites/lib/project/model"
import { cutListOf } from "@soundbites/lib/project/script"
import {
  memoryProjectStore,
  primer,
  PRIMER_TEXT,
} from "@soundbites/lib/studio/__tests__/fixture"
import { STUDIO_WORDS } from "@soundbites/lib/studio/words"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

const W = STUDIO_WORDS

/** A microphone that hears four seconds of speech per take. */
const mic: StartRecording = (): Promise<Recording> =>
  Promise.resolve({
    level: (): number => 0.3,
    finish: (): Promise<Take> =>
      Promise.resolve({
        blob: new Blob(["voice"], { type: "audio/webm" }),
        mimeType: "audio/webm;codecs=opus",
        durationMs: 4_000,
      }),
    discard: (): void => undefined,
  })

function setup(
  share?: StudioProps["share"],
  initial: ReadonlyArray<Project> = []
): ReturnType<typeof memoryProjectStore> {
  const memory = memoryProjectStore(initial)
  let tick = 0
  render(
    <Studio
      ports={{
        store: memory.store,
        startRecording: mic,
        now: () => Date.UTC(2026, 9, 30, 10) + 1_000 * tick++,
        newId: () => `t${tick}`,
        readText: () => Promise.resolve(PRIMER_TEXT),
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
      }}
      share={share}
    />
  )
  return memory
}

async function openPrimer(): Promise<void> {
  const pick = await screen.findByLabelText(new RegExp(`^${W.start.openSent}`))
  fireEvent.change(pick, {
    target: { files: [new File(["{}"], "primer.json")] },
  })
  await screen.findByText("Playoff Delta, week 8")
}

async function takeOne(): Promise<void> {
  fireEvent.click(await screen.findByRole("button", { name: W.record.talk }))
  fireEvent.click(await screen.findByRole("button", { name: W.record.stop }))
  await screen.findByRole("button", { name: W.record.again })
}

describe("Studio", () => {
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
    expect(screen.getByText(W.record.runs(20_000))).toBeInTheDocument()
    await takeOne()
    // The scene's length follows the take at once.
    expect(screen.getByText(W.record.runsWith(4_700))).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: W.record.keepNext }))
    expect(
      await screen.findByText("One pick missed, and here is why.")
    ).toBeInTheDocument()
    expect(screen.getByText(W.record.read)).toBeInTheDocument()
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
})

import type { Player } from "@some-ui/voice-capture"
import {
  AttentionWayIn,
  TakeReconcile,
} from "@soundbites/components/take-reconcile"
import { HEAR_AGAIN_WORDS } from "@soundbites/lib/hear-again/words"
import type {
  ActAnswer,
  AttentionRead,
  AttentionTake,
} from "@soundbites/lib/reconcile/model"
import type { ReconcileHome } from "@soundbites/lib/reconcile/runtime"
import { RECONCILE_WORDS } from "@soundbites/lib/reconcile/words"
import { act, fireEvent, render, screen, within } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

const W = RECONCILE_WORDS
const H = HEAR_AGAIN_WORDS
const AT = "2026-11-10T09:00:00.000Z"

const GARBLED: AttentionTake = {
  id: "r1",
  of: "rust-round",
  ref: "w46:QM-311",
  recordedAt: AT,
  heard: "the bar oh checker",
  verdict: {
    kind: "garbled",
    reasons: ["sparse", "off_language"],
    rule: "heard-1",
    language: { heard: "pt", expected: "en" },
  },
  hearAgain: null,
}

const FAILED: AttentionTake = {
  id: "s1",
  of: "studio",
  ref: "ep04:s3:2",
  recordedAt: AT,
  heard: null,
  verdict: {
    kind: "failed",
    reasons: ["deadline"],
    rule: "heard-1",
    language: null,
  },
  hearAgain: { open: true, hearing: false, askAgainAt: null },
}

const listed = (takes: ReadonlyArray<AttentionTake>): AttentionRead => ({
  kind: "read",
  page: { takes, total: takes.length },
})

const quietPlayer: Player = {
  play: () => ({ ended: new Promise(() => undefined), stop: () => undefined }),
}

function home(
  read: AttentionRead,
  act: ReconcileHome["act"] = () => Promise.resolve("kept"),
  hearAgain: ReconcileHome["hearAgain"] = () =>
    Promise.resolve({ kind: "notTaken" })
): ReconcileHome {
  return {
    takes: () => Promise.resolve(read),
    audio: () => Promise.resolve(null),
    act,
    hearAgain,
  }
}

const settle = (): Promise<void> => act(() => Promise.resolve())

describe("Takes › Needs your attention (HEARD3)", () => {
  it("groups the takes by what went wrong, each saying every code it carries", async () => {
    render(
      <TakeReconcile
        ports={{ home: home(listed([FAILED, GARBLED])), player: quietPlayer }}
        pair={null}
      />
    )
    await settle()
    const groups = screen.getAllByRole("heading", { level: 2 })
    // Garbled codes come before failed ones, each group under its first code.
    expect(groups.map((each) => each.textContent)).toEqual([
      `${W.codes.off_language.name}1`,
      `${W.codes.deadline.name}1`,
    ])
    expect(screen.getAllByText(W.codes.sparse.name).length).toBeGreaterThan(0)
    expect(screen.getByText(W.heardAs("pt", "en"))).toBeTruthy()
    expect(screen.getByText(W.neverHeard)).toBeTruthy()
  })

  it("shows only the takes carrying a code once its chip is picked", async () => {
    render(
      <TakeReconcile
        ports={{ home: home(listed([FAILED, GARBLED])), player: quietPlayer }}
        pair={null}
      />
    )
    await settle()
    const chips = screen.getByRole("navigation", { name: W.chips })
    fireEvent.click(within(chips).getByText(W.codes.deadline.name))
    expect(screen.queryByText("“the bar oh checker”")).toBeNull()
    expect(screen.getByText(W.neverHeard)).toBeTruthy()
  })

  it("shows only the takes asked for, under its line, and what it says once none is left (RETRY)", async () => {
    const view = render(
      <TakeReconcile
        ports={{ home: home(listed([FAILED, GARBLED])), player: quietPlayer }}
        pair={null}
        only={{
          ids: new Set(["r1"]),
          banner: <p>The take an essay waits on</p>,
          empty: <p>None of them waits on you now.</p>,
        }}
      />
    )
    await settle()
    expect(screen.getByText("The take an essay waits on")).toBeTruthy()
    expect(screen.getByText("“the bar oh checker”")).toBeTruthy()
    expect(screen.queryByText(W.neverHeard)).toBeNull()
    expect(screen.queryByText("None of them waits on you now.")).toBeNull()
    view.unmount()
    render(
      <TakeReconcile
        ports={{ home: home(listed([FAILED])), player: quietPlayer }}
        pair={null}
        only={{
          ids: new Set(["r1"]),
          banner: <p>The take an essay waits on</p>,
          empty: <p>None of them waits on you now.</p>,
        }}
      />
    )
    await settle()
    expect(screen.getByText("None of them waits on you now.")).toBeTruthy()
    expect(screen.queryByText(W.neverHeard)).toBeNull()
    expect(screen.queryByText(W.none)).toBeNull()
  })

  it("never says none of the takes asked for waits while home listed only some (RETRY)", async () => {
    render(
      <TakeReconcile
        ports={{
          home: home({ kind: "read", page: { takes: [FAILED], total: 101 } }),
          player: quietPlayer,
        }}
        pair={null}
        only={{
          ids: new Set(["r1"]),
          banner: <p>The take an essay waits on</p>,
          empty: <p>None of them waits on you now.</p>,
        }}
      />
    )
    await settle()
    expect(screen.queryByText("None of them waits on you now.")).toBeNull()
    expect(screen.getByText(W.noneShown(101))).toBeTruthy()
  })

  it("offers Delete… only on a kind the build deletes, and says the rest are kept for good", async () => {
    const onDelete = vi.fn()
    render(
      <TakeReconcile
        ports={{ home: home(listed([FAILED, GARBLED])), player: quietPlayer }}
        pair={null}
        deletable={(take) => take.of === "studio"}
        onDelete={onDelete}
      />
    )
    await settle()
    const deletes = screen.getAllByRole("button", { name: W.acts.delete })
    expect(deletes).toHaveLength(1)
    fireEvent.click(deletes[0]!)
    expect(onDelete).toHaveBeenCalledWith(FAILED)
    expect(screen.getAllByText(W.keptForGood)).toHaveLength(1)
  })

  it("drops a take once home kept the act, and leaves it when home didn't", async () => {
    let answer: ActAnswer = "notTaken"
    const sent: Array<[string, string]> = []
    render(
      <TakeReconcile
        ports={{
          home: home(listed([GARBLED]), (id, act) => {
            sent.push([id, act])
            return Promise.resolve(answer)
          }),
          player: quietPlayer,
        }}
        pair={null}
      />
    )
    await settle()
    fireEvent.click(screen.getByRole("button", { name: W.acts.again }))
    await settle()
    expect(sent).toEqual([["r1", "again"]])
    expect(screen.getByText(W.notTaken)).toBeTruthy()
    expect(screen.getByText("“the bar oh checker”")).toBeTruthy()
    answer = "kept"
    fireEvent.click(screen.getByRole("button", { name: W.acts.keep }))
    await settle()
    expect(screen.queryByText("“the bar oh checker”")).toBeNull()
    expect(screen.getByText(W.done.keep)).toBeTruthy()
    expect(screen.getByText(W.none)).toBeTruthy()
  })

  it("asks home to try a take again where home will, keeps it listed, and says when it can be asked again (#3339)", async () => {
    const LATER = "2026-11-21T15:00:00.000Z"
    const sent: Array<string> = []
    render(
      <TakeReconcile
        ports={{
          home: home(listed([FAILED, GARBLED]), undefined, (id) => {
            sent.push(id)
            return Promise.resolve({ kind: "snoozed", askAgainAt: LATER })
          }),
          player: quietPlayer,
        }}
        pair={null}
        source={(take) =>
          take.id === "s1" ? <a href="#back">Back to it</a> : null
        }
      />
    )
    await settle()
    // Only the take home will hear again offers it, and carries its link back.
    const asks = screen.getAllByRole("button", { name: H.ask })
    expect(asks).toHaveLength(1)
    expect(screen.getAllByRole("link", { name: "Back to it" })).toHaveLength(1)
    fireEvent.click(asks[0]!)
    await settle()
    expect(sent).toEqual(["s1"])
    expect(screen.getByText(H.said.snoozed)).toBeTruthy()
    expect(screen.getByText(H.askAgainAt(LATER))).toBeTruthy()
    expect(screen.getByRole("button", { name: H.ask })).toHaveProperty(
      "disabled",
      true
    )
    expect(screen.getByText(W.neverHeard)).toBeTruthy()
  })

  it("says why a take home no longer holds left the list when it was asked of again (#3339)", async () => {
    render(
      <TakeReconcile
        ports={{
          home: home(listed([FAILED, GARBLED]), undefined, () =>
            Promise.resolve({ kind: "settled" })
          ),
          player: quietPlayer,
        }}
        pair={null}
      />
    )
    await settle()
    fireEvent.click(screen.getByRole("button", { name: H.ask }))
    await settle()
    expect(screen.queryByText(W.neverHeard)).toBeNull()
    expect(screen.getByText(H.said.settled)).toBeTruthy()
  })

  it("drops a take the build's delete path deleted", async () => {
    let tell: (ids: ReadonlyArray<string>) => void = () => undefined
    render(
      <TakeReconcile
        ports={{
          home: home(listed([FAILED, GARBLED])),
          player: quietPlayer,
          deletes: (listener) => {
            tell = listener
            return (): void => undefined
          },
        }}
        pair={null}
      />
    )
    await settle()
    act(() => tell(["s1"]))
    expect(screen.queryByText(W.neverHeard)).toBeNull()
    expect(screen.getByText(W.shown(1, 1))).toBeTruthy()
  })

  it("never says nothing waits while home counts takes this phone can't show", async () => {
    render(
      <TakeReconcile
        ports={{
          home: home({ kind: "read", page: { takes: [], total: 3 } }),
          player: quietPlayer,
        }}
        pair={null}
      />
    )
    await settle()
    expect(screen.queryByText(W.none)).toBeNull()
    expect(screen.getByText(W.noneShown(3))).toBeTruthy()
    expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy()
  })

  it("shows the way in only while a take waits, with how many", async () => {
    const wayIn = (body: React.ReactNode): React.ReactNode => (
      <a href="#attention">{body}</a>
    )
    const { unmount } = render(
      <AttentionWayIn
        ports={{ home: home(listed([GARBLED])), player: quietPlayer }}
        wayIn={wayIn}
      />
    )
    await settle()
    expect(screen.getByText(W.wayIn(1))).toBeTruthy()
    unmount()
    render(
      <AttentionWayIn
        ports={{ home: home(listed([])), player: quietPlayer }}
        wayIn={wayIn}
      />
    )
    await settle()
    expect(screen.queryByRole("link")).toBeNull()
  })
})

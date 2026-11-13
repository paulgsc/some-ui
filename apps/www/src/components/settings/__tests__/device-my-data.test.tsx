/**
 * @vitest-environment jsdom
 *
 * My data (MD2, #2476) as the phone draws it: the three figures, the
 * charts, each kind with how many and since when, a kind's list newest
 * first with Play where the audio is on this phone, and what is kept for
 * good with home's count of each (MD2b, #2519). What the numbers are is
 * `lib/my-data`'s, held by its tests.
 *
 * Deleting (MD3, #2477): Delete… only on a recording home marks deletable,
 * the sheet asking once with "Keep it" first, what it says once home
 * answered, and the Deleted page's receipts.
 */
import type { JSX } from "react"
import type * as ReactRouterModule from "@tanstack/react-router"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import type { DeleteSheet, MyDataState, Receipt } from "@/lib/my-data"
import { endOf } from "@/lib/my-data/deleting"
import type { HomeReading } from "@/lib/my-data/model"
import { kindOf, overviewOf } from "@/lib/my-data/model"
import type { RecordKind } from "@/lib/my-data/record"
import { RECORD_KINDS } from "@/lib/my-data/record"
import {
  DELETING,
  KEPT_FOR_GOOD,
  keptNote,
  MY_DATA,
  onDay,
  RECEIPTS,
  WHERE_WORDS,
} from "@/lib/my-data/words"
import { screenRefreshers } from "@/lib/pull-refresh/refreshers"
import {
  DeviceMyData,
  DeviceMyDataKind,
  MyDataKind,
  MyDataOverview,
  MyDataReceipts,
} from "@/components/settings/device-my-data"
import { DeleteSheetView } from "@/components/settings/device-my-data-delete"

const runtime = vi.hoisted(
  (): {
    state: MyDataState | null
    open: ReturnType<typeof vi.fn>
    stop: ReturnType<typeof vi.fn>
    play: ReturnType<typeof vi.fn>
    checkAgain: ReturnType<typeof vi.fn<() => Promise<void>>>
  } => ({
    state: null,
    open: vi.fn(),
    stop: vi.fn(),
    play: vi.fn(),
    checkAgain: vi.fn(() => Promise.resolve()),
  })
)

vi.mock("@/lib/my-data", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  phoneMyData: (): unknown => ({
    subscribe: (): (() => void) => () => undefined,
    getSnapshot: (): MyDataState | null => runtime.state,
    open: runtime.open,
    stop: runtime.stop,
    play: runtime.play,
    checkAgain: runtime.checkAgain,
  }),
}))

// The phone's build, which carries My data's pages (the `apk` audience).
vi.mock("@/lib/build-profile", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  hasAudience: (audience: string): boolean => audience === "apk",
}))

vi.mock(
  "@tanstack/react-router",
  async (importOriginal): Promise<typeof ReactRouterModule> => {
    const { withPlainLink } = await import("@/test-support/router-stubs")
    return withPlainLink(await importOriginal<typeof ReactRouterModule>())
  }
)

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

const NOW = new Date("2026-11-02T12:00:00Z")
/** Studio's earliest, as the page says a day. */
const SINCE = onDay("2026-09-12T10:00:00.000Z")

const HOME: HomeReading = {
  kind: "read",
  kept: {
    kinds: [
      {
        of: "studio",
        notes: 3,
        bytes: 3 * 1024 * 1024,
        setAside: 1,
        since: "2026-09-12T10:00:00.000Z",
      },
    ],
    weeks: [
      {
        week: "2026-10-26",
        notes: 3,
        bytes: 3 * 1024 * 1024,
        leftNotes: 0,
        leftBytes: 0,
      },
    ],
    notes: [
      {
        id: "t1",
        recordedAt: "2026-10-28T10:00:00.000Z",
        storedAt: "2026-10-28T10:01:00.000Z",
        size: 2048,
        setAsideAt: null,
        deletable: false,
        durationMs: null,
        heard: null,
        playsBack: false,
      },
    ],
  },
}

/** HOME, with its one take marked deletable, as home will once takes are switched on. */
const DELETABLE: HomeReading = {
  kind: "read",
  kept: {
    kinds: [],
    weeks: [],
    notes: [
      {
        id: "t1",
        recordedAt: "2026-10-28T10:00:00.000Z",
        storedAt: "2026-10-28T10:01:00.000Z",
        size: 2048,
        setAsideAt: null,
        deletable: true,
        durationMs: null,
        heard: null,
        playsBack: false,
      },
    ],
  },
}

const RECEIPT: Receipt = {
  id: "t1",
  of: "studio",
  recordedAt: "2026-10-28T10:00:00.000Z",
  storedAt: "2026-10-28T10:01:00.000Z",
  size: 2048,
  deletedAt: "2026-11-03T09:00:00.000Z",
  went: ["recording", "words"],
  stayed: ["drive copy"],
}

const PHONE = [
  {
    id: "p1",
    of: "lens" as const,
    at: "2026-11-01T09:00:00.000Z",
    bytes: 1024,
    held: false,
    going: false,
  },
]

describe("My data's overview", () => {
  it("shows the figures, the charts and each kind, and what is kept for good", () => {
    render(<MyDataOverview overview={overviewOf(HOME, PHONE, NOW)} />)
    const homeTile = screen.getByText(MY_DATA.tiles.home).parentElement
    expect(homeTile?.textContent).toContain("3.0 MB")
    expect(screen.getByText(MY_DATA.space.title)).toBeTruthy()
    expect(screen.getByText(MY_DATA.growth.title)).toBeTruthy()
    expect(screen.getByText(MY_DATA.where.title)).toBeTruthy()
    // The kind rows are links (a plain anchor here, holding its `to`).
    const kindRow = (name: string): HTMLElement | null =>
      screen
        .getAllByText(name)
        .map((text) => text.closest("a"))
        .find((anchor) => anchor !== null) ?? null
    const studio = kindRow("Studio takes and idea answers")
    expect(studio?.getAttribute("to")).toBe("/settings/data/$kind")
    expect(studio?.textContent).toContain(`since ${SINCE}`)
    expect(kindRow("Grammar lens takes")?.textContent).toContain(
      "not on home yet"
    )
    expect(screen.getByText(MY_DATA.kept)).toBeTruthy()
    for (const kind of RECORD_KINDS)
      expect(screen.getByText(KEPT_FOR_GOOD[kind])).toBeTruthy()
    // No count of the record until home gave one.
    expect(screen.queryByText(MY_DATA.keptNone)).toBeNull()
  })

  it("says how many home keeps of each kind kept for good, and since when (MD2b)", () => {
    render(
      <MyDataOverview
        overview={overviewOf(HOME, PHONE, NOW)}
        record={{
          kind: "read",
          held: {
            sessions: { count: 214, since: "2026-09-12T10:00:00.000Z" },
          },
        }}
      />
    )
    const row = (kind: RecordKind): string | null =>
      screen.getByText(KEPT_FOR_GOOD[kind]).closest("li")?.textContent ?? null
    expect(row("sessions")).toContain(`214 on home · since ${SINCE}`)
    expect(row("jobs")).toContain(MY_DATA.keptNone)
  })

  it("says when home can't count the record yet", () => {
    render(
      <MyDataOverview
        overview={overviewOf(HOME, PHONE, NOW)}
        record={{ kind: "older" }}
      />
    )
    const older = keptNote({ kind: "older" })
    expect(older).not.toBeNull()
    expect(screen.getByText(older ?? "")).toBeTruthy()
    expect(screen.queryByText(MY_DATA.keptNone)).toBeNull()
  })

  it("shows every number as a table on asking", () => {
    render(<MyDataOverview overview={overviewOf(HOME, PHONE, NOW)} />)
    expect(screen.queryByRole("table")).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: MY_DATA.table.show }))
    expect(screen.getAllByRole("table")).toHaveLength(3)
  })

  it("says why home's side is missing, and draws no growth without it", () => {
    render(
      <MyDataOverview overview={overviewOf({ kind: "unpaired" }, PHONE, NOW)} />
    )
    expect(screen.getByRole("status").textContent).toContain("isn't paired")
    expect(screen.queryByText(MY_DATA.growth.title)).toBeNull()
    expect(screen.getByText(MY_DATA.unknown)).toBeTruthy()
  })
})

describe("a kind's list", () => {
  it("lists newest first, with Play where the audio is on this phone or home gives it back", () => {
    const onPlay = vi.fn()
    const view = kindOf("studio", "studio", HOME, [], NOW)
    render(
      <MyDataKind view={view} playing={null} onPlay={onPlay} onStop={vi.fn()} />
    )
    expect(screen.getByText(`3 kept · 3.0 MB · since ${SINCE}`)).toBeTruthy()
    expect(screen.getByText(`${WHERE_WORDS.home} · 2.0 KB`)).toBeTruthy()
    expect(screen.getByText(MY_DATA.kind.noPlay)).toBeTruthy()
    expect(screen.queryByRole("button")).toBeNull()
    expect(screen.getByText(MY_DATA.kind.newest(1, 3))).toBeTruthy()

    cleanup()
    const lens = kindOf("lens", "lens", HOME, PHONE, NOW)
    render(
      <MyDataKind view={lens} playing={null} onPlay={onPlay} onStop={vi.fn()} />
    )
    fireEvent.click(screen.getByRole("button", { name: /^Play/ }))
    expect(onPlay).toHaveBeenCalledWith("p1")
  })

  it("says what a recording home holds is, plays it from home, and says a miss over the list (MD8, MDL1)", () => {
    const onPlay = vi.fn()
    const notes = HOME.kept.notes ?? []
    const heard: HomeReading = {
      kind: "read",
      kept: {
        kinds: [],
        weeks: [],
        notes: notes.map((note) => ({
          ...note,
          durationMs: 42_000,
          heard: "I was thinking about the scene",
          playsBack: true,
        })),
      },
    }
    const view = kindOf("studio", "studio", heard, [], NOW)
    const { rerender } = render(
      <MyDataKind view={view} playing={null} onPlay={onPlay} onStop={vi.fn()} />
    )
    expect(screen.getByText("“I was thinking about the scene”")).toBeTruthy()
    expect(screen.getByText(/^Recorded .* · 42 s long$/)).toBeTruthy()
    expect(screen.queryByText(MY_DATA.kind.noPlay)).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: /^Play/ }))
    expect(onPlay).toHaveBeenCalledWith("t1")

    rerender(
      <MyDataKind
        view={view}
        playing="t1"
        fetching
        onPlay={onPlay}
        onStop={vi.fn()}
      />
    )
    expect(
      screen.getByRole("button", { name: /^Getting the recording/ })
    ).toBeTruthy()

    rerender(
      <MyDataKind
        view={view}
        playing={null}
        missed={{ id: "t1", count: 1 }}
        onPlay={onPlay}
        onStop={vi.fn()}
      />
    )
    expect(screen.getByText(MY_DATA.kind.missed)).toBeTruthy()
    // The list keeps its place: the miss is said over it, not in it (HS1).
    expect(screen.getByText("“I was thinking about the scene”")).toBeTruthy()
  })
})

describe("deleting from a kind's list (MD3)", () => {
  it("offers nothing to delete when home doesn't mark a recording deletable", () => {
    const onDelete = vi.fn()
    render(
      <MyDataKind
        view={kindOf("studio", "studio", HOME, [], NOW)}
        playing={null}
        onPlay={vi.fn()}
        onStop={vi.fn()}
        onDelete={onDelete}
      />
    )
    expect(screen.queryByText(DELETING.row)).toBeNull()
    expect(screen.queryByText(DELETING.select)).toBeNull()
  })

  it("offers Delete… on what home marks deletable, opening the sheet on it, and Select on several until it is cancelled", () => {
    const onDelete = vi.fn()
    const kind = (home: HomeReading): JSX.Element => (
      <MyDataKind
        view={kindOf("studio", "studio", home, [], NOW)}
        playing={null}
        onPlay={vi.fn()}
        onStop={vi.fn()}
        onDelete={onDelete}
      />
    )
    const { rerender } = render(kind(DELETABLE))
    fireEvent.click(screen.getByText(DELETING.row))
    expect(onDelete).toHaveBeenCalledWith("studio", ["t1"])
    const notes = DELETABLE.kept.notes ?? []
    const two: HomeReading = {
      kind: "read",
      kept: {
        kinds: [],
        weeks: [],
        notes: [...notes, ...notes.map((note) => ({ ...note, id: "t2" }))],
      },
    }
    rerender(kind(two))
    fireEvent.click(screen.getByText(DELETING.select))
    for (const box of screen.getAllByRole("checkbox")) fireEvent.click(box)
    fireEvent.click(screen.getByText(DELETING.deleteSelected(2)))
    expect(onDelete).toHaveBeenLastCalledWith("studio", ["t1", "t2"])
    // One went: still selecting, so Cancel stays to leave it.
    rerender(kind(DELETABLE))
    fireEvent.click(screen.getByText(DELETING.cancel))
    expect(screen.getByText(DELETING.row)).toBeTruthy()
  })

  it("offers nothing while Studio's store isn't handed in, and says why", () => {
    render(
      <MyDataKind
        view={kindOf("studio", "studio", DELETABLE, [], NOW)}
        playing={null}
        onPlay={vi.fn()}
        onStop={vi.fn()}
        unread={["studio"]}
        onDelete={vi.fn()}
      />
    )
    expect(screen.queryByText(DELETING.row)).toBeNull()
    expect(screen.getByText(DELETING.waitsOnStudio)).toBeTruthy()
  })
})

describe("the delete sheet (MD3)", () => {
  const asking: DeleteSheet = { kind: "asking", of: "studio", ids: ["t1"] }

  it("says what goes and what stays, and asks once with Keep it first", () => {
    const onConfirm = vi.fn()
    const onClose = vi.fn()
    render(
      <DeleteSheetView sheet={asking} onConfirm={onConfirm} onClose={onClose} />
    )
    expect(screen.getByText(DELETING.title("studio", 1))).toBeTruthy()
    for (const line of [...DELETING.goes(1), ...DELETING.stays(1)])
      expect(screen.getByText(line)).toBeTruthy()
    const buttons = screen
      .getAllByRole("button")
      .map((button) => button.textContent)
    expect(buttons.indexOf(DELETING.keep(1))).toBeLessThan(
      buttons.indexOf(DELETING.confirm(1))
    )
    fireEvent.click(screen.getByText(DELETING.confirm(1)))
    expect(onConfirm).toHaveBeenCalledTimes(1)
  })

  it("shows the receipt once home deleted it", () => {
    const sheet: DeleteSheet = {
      kind: "ended",
      of: "studio",
      ids: ["t1"],
      end: endOf({
        kind: "answered",
        answers: [
          {
            id: "t1",
            answer: { status: 200, body: JSON.stringify({ receipt: RECEIPT }) },
          },
        ],
      }),
    }
    render(
      <DeleteSheetView sheet={sheet} onConfirm={vi.fn()} onClose={vi.fn()} />
    )
    expect(screen.getByText(DELETING.gone(1))).toBeTruthy()
    expect(
      screen.getByText("The recording and home's words for it")
    ).toBeTruthy()
    expect(screen.getByText("Its copy in Drive")).toBeTruthy()
    expect(screen.queryByText(DELETING.tryAgain)).toBeNull()
  })

  it("says nothing was deleted, with Try again only where home didn't answer", () => {
    const ended = (end: Parameters<typeof endOf>[0]): DeleteSheet => ({
      kind: "ended",
      of: "studio",
      ids: ["t1"],
      end: endOf(end),
    })
    render(
      <DeleteSheetView
        sheet={ended({ kind: "unreachable" })}
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      />
    )
    expect(screen.getByText(DELETING.nothing)).toBeTruthy()
    expect(screen.getByText(DELETING.tryAgain)).toBeTruthy()
    cleanup()
    render(
      <DeleteSheetView
        sheet={ended({
          kind: "answered",
          answers: [{ id: "t1", answer: { status: 409, body: "{}" } }],
        })}
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      />
    )
    expect(screen.getByText(DELETING.nothing)).toBeTruthy()
    expect(screen.getByText(DELETING.kept(1, 1))).toBeTruthy()
    expect(screen.queryByText(DELETING.tryAgain)).toBeNull()
  })
})

describe("the Deleted page (MD3)", () => {
  it("lists each receipt, and says when home can't list them yet", () => {
    render(
      <MyDataReceipts
        state={{
          seq: 1,
          reading: { kind: "read", receipts: [RECEIPT], total: 1 },
        }}
      />
    )
    expect(screen.getByText(/^Studio recording, recorded/)).toBeTruthy()
    expect(
      screen.getByText("Went: The recording and home's words for it")
    ).toBeTruthy()
    cleanup()
    render(<MyDataReceipts state={{ seq: 1, reading: { kind: "older" } }} />)
    expect(screen.getByRole("status").textContent).toContain("newer version")
    expect(screen.queryByText(RECEIPTS.empty)).toBeNull()
  })
})

describe("on the phone", () => {
  it("reads the page on opening, is read again by a drag down, and stops playing on leaving", async () => {
    runtime.state = {
      seq: 1,
      of: null,
      home: HOME,
      phone: { notes: PHONE, unread: ["studio"] },
      playing: null,
      fetching: false,
      missed: null,
    }
    const { unmount } = render(<DeviceMyData />)
    expect(runtime.open).toHaveBeenCalledWith(null, null)
    // Studio's recordings on this phone aren't counted until it opens.
    expect(screen.getByText(/Studio hasn't been opened/)).toBeTruthy()
    await expect(screenRefreshers.checkAll()).resolves.toEqual([])
    expect(runtime.checkAgain).toHaveBeenCalledTimes(1)
    unmount()
    expect(runtime.stop).toHaveBeenCalled()
    await screenRefreshers.checkAll()
    expect(runtime.checkAgain).toHaveBeenCalledTimes(1)
  })

  it("names a kind that doesn't exist, and reads nothing for it", () => {
    render(<DeviceMyDataKind kind="probe" />)
    expect(screen.getByText(MY_DATA.kind.unknown)).toBeTruthy()
    expect(runtime.open).not.toHaveBeenCalled()
  })
})

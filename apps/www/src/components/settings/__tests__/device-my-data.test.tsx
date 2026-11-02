/**
 * @vitest-environment jsdom
 *
 * My data (MD2, #2476) as the phone draws it: the three figures, the
 * charts, each kind with how many and since when, a kind's list newest
 * first with Play where the audio is on this phone, and what is kept for
 * good. What the numbers are is `lib/my-data`'s, held by its tests.
 */
import type * as ReactRouterModule from "@tanstack/react-router"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import type { MyDataState } from "@/lib/my-data"
import type { HomeReading } from "@/lib/my-data/model"
import { kindOf, overviewOf } from "@/lib/my-data/model"
import { KEPT_FOR_GOOD, MY_DATA, onDay, WHERE_WORDS } from "@/lib/my-data/words"
import { screenRefreshers } from "@/lib/pull-refresh/refreshers"
import {
  DeviceMyData,
  DeviceMyDataKind,
  MyDataKind,
  MyDataOverview,
} from "@/components/settings/device-my-data"

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
    weeks: [{ week: "2026-10-26", notes: 3, bytes: 3 * 1024 * 1024 }],
    notes: [
      {
        id: "t1",
        recordedAt: "2026-10-28T10:00:00.000Z",
        storedAt: "2026-10-28T10:01:00.000Z",
        size: 2048,
        setAsideAt: null,
      },
    ],
  },
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
    for (const name of KEPT_FOR_GOOD)
      expect(screen.getByText(name)).toBeTruthy()
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
  it("lists newest first, with Play only where the audio is on this phone", () => {
    const onPlay = vi.fn()
    const view = kindOf("studio", "studio", HOME, [], NOW)
    render(
      <MyDataKind view={view} playing={null} onPlay={onPlay} onStop={vi.fn()} />
    )
    expect(screen.getByText(`3 kept · 3.0 MB · since ${SINCE}`)).toBeTruthy()
    expect(screen.getByText(WHERE_WORDS.home)).toBeTruthy()
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
})

describe("on the phone", () => {
  it("reads the page on opening, is read again by a drag down, and stops playing on leaving", async () => {
    runtime.state = {
      seq: 1,
      of: null,
      home: HOME,
      phone: PHONE,
      playing: null,
    }
    const { unmount } = render(<DeviceMyData />)
    expect(runtime.open).toHaveBeenCalledWith(null)
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

/**
 * @vitest-environment jsdom
 *
 * Settings' ledger of what this phone shares with home: it reads the
 * phone's own choices and sends nothing on its own, says each record's
 * state in its own words, stops Practice and the Jobs record on a second
 * press, which tells home only that, and sends aph's stop to aph's own mark.
 * The status page's rows for the same records (#2165) claim nothing this
 * launch hasn't seen.
 */
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { CONSENT_KEY } from "@/lib/home-link/consent-runtime"
import { LEDGER, WORDS } from "@/lib/home-link/words"
import type { SessionRecord } from "@/lib/tenant/types"

const PAIRING = "https://home.example/api/v1"

const home = vi.hoisted(
  (): {
    sent: Array<{ method: string; url: string; body?: unknown }>
    earlier: boolean
    jobsKept: boolean
    /** Whether this build can tell the phone of a morning run (RUN5). */
    noticeOffered: boolean
    wanted: Array<boolean>
  } => ({
    sent: [],
    earlier: false,
    jobsKept: false,
    noticeOffered: false,
    wanted: [],
  })
)

vi.mock("@/lib/device-backend/native-http", () => ({
  homeRequest: (call: {
    method: string
    url: string
    body?: unknown
  }): Promise<{ status: number; body: string }> => {
    home.sent.push(call)
    return Promise.resolve({ status: 200, body: "{}" })
  },
}))
vi.mock("@/lib/home-link/credential", () => ({
  nativeCredential: {
    read: (): Promise<{ record: string; lost: boolean }> =>
      Promise.resolve({
        record: JSON.stringify({
          base: PAIRING,
          token: "t",
          ...(home.earlier ? {} : { choicesLogged: true }),
        }),
        lost: false,
      }),
  },
}))
vi.mock("@/lib/home-link/send", () => ({
  readPhone: (): Promise<unknown> => Promise.resolve({ local: [], kept: [] }),
}))
vi.mock("@/lib/jobs", async () => {
  const { EMPTY } = await import("@/lib/jobs/model")
  const made = (kept: boolean, offered: boolean): unknown => ({
    state: { ...EMPTY, home: { ...EMPTY.home, kept } },
    notice: { offered, asking: false, why: null },
  })
  // One snapshot per test's `jobsKept` and `noticeOffered`, as
  // `useSyncExternalStore` needs.
  const key = (kept: boolean, offered: boolean): string =>
    `${String(kept)}|${String(offered)}`
  const snapshots = new Map(
    [true, false].flatMap((kept) =>
      [true, false].map((offered) => [key(kept, offered), made(kept, offered)])
    )
  )
  return {
    phoneJobs: (): unknown => ({
      getSnapshot: () => snapshots.get(key(home.jobsKept, home.noticeOffered)),
      subscribe: () => () => undefined,
      wantNotice: (on: boolean) => home.wanted.push(on),
    }),
  }
})
vi.mock("@/lib/tenant", () => ({
  useSessions: (): { data: Array<SessionRecord> } => ({ data: [] }),
}))

afterEach(() => {
  cleanup()
  vi.resetModules()
  localStorage.clear()
  home.sent = []
  home.earlier = false
  home.jobsKept = false
  home.noticeOffered = false
  home.wanted = []
})

function logged(
  ...events: Array<{ kind: "kept" | "stopped"; scopes: Array<string> }>
): void {
  localStorage.setItem(
    CONSENT_KEY,
    JSON.stringify(
      events.map((event, i) => ({
        seq: i + 1,
        at: Date.parse(`2026-10-0${String(i + 1)}T10:00:00Z`),
        pairing: PAIRING,
        ...event,
        ...(event.kind === "kept" ? { said: "yes" } : {}),
      }))
    )
  )
}

async function mount(): Promise<void> {
  const { SharingLedger } = await import(
    "@/components/settings/device-sharing-ledger"
  )
  render(<SharingLedger />)
  await act(() => Promise.resolve())
}

describe("the sharing ledger", () => {
  it("says everything is only on this phone, and sends nothing", async () => {
    await mount()
    // Practice's two kinds, aph, the Jobs record and voice notes.
    expect(screen.getAllByText(/: Only on this phone$/)).toHaveLength(5)
    expect(screen.getByText(/No choice to keep sending made yet/)).toBeTruthy()
    expect(screen.queryByRole("button")).toBeNull()
    expect(home.sent).toEqual([])
  })

  it("stops Practice on the second press, and shows each choice", async () => {
    logged({ kind: "kept", scopes: ["sessions", "shelf"] })
    await mount()
    expect(
      screen.getByText(/^Finished sessions: Kept on home since/)
    ).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Stop sending..." }))
    expect(JSON.parse(localStorage.getItem(CONSENT_KEY) ?? "[]")).toHaveLength(
      1
    )
    expect(document.activeElement?.textContent).toBe(
      WORDS.practice.stopQuestion
    )
    fireEvent.click(screen.getByRole("button", { name: "Stop sending" }))
    const log: unknown = JSON.parse(localStorage.getItem(CONSENT_KEY) ?? "[]")
    expect(log).toMatchObject([{ kind: "kept" }, { kind: "stopped" }])
    expect(
      screen.getByText(/^Finished sessions: Sent to home until/)
    ).toBeTruthy()
    expect(
      screen.getByText(/Practice: stopped sending to home\. Home keeps/)
    ).toBeTruthy()
    expect(screen.getByText(/Practice: kept on home\.$/)).toBeTruthy()
    // Home is told the choices it hasn't heard, the stop last, and only that.
    await waitFor(() => expect(home.sent).toHaveLength(4))
    expect(
      home.sent.map(
        (call) => `${new URL(call.url).pathname} ${String(call.body)}`
      )
    ).toEqual([
      '/api/v1/sharing/sessions {"kept":true}',
      '/api/v1/sharing/shelf {"kept":true}',
      '/api/v1/sharing/sessions {"kept":false}',
      '/api/v1/sharing/shelf {"kept":false}',
    ])
  })

  it("keeps sending when the second press is not made", async () => {
    logged({ kind: "kept", scopes: ["jobs"] })
    await mount()
    fireEvent.click(screen.getByRole("button", { name: "Stop sending..." }))
    fireEvent.click(screen.getByRole("button", { name: "Keep sending" }))
    expect(JSON.parse(localStorage.getItem(CONSENT_KEY) ?? "[]")).toHaveLength(
      1
    )
    expect(screen.getByText(/^The record: Kept on home since/)).toBeTruthy()
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Stop sending..." })
    )
  })

  it("offers the arrival notice under the Jobs record kept on home, where this build can be told", async () => {
    logged({ kind: "kept", scopes: ["jobs"] })
    await mount()
    expect(screen.queryByRole("switch")).toBeNull()
    cleanup()
    home.noticeOffered = true
    await mount()
    const toggle = screen.getByRole("switch", {
      name: "Tell me when the morning run is in",
    })
    expect(screen.getByText(/Google carries it/)).toBeTruthy()
    fireEvent.click(toggle)
    expect(home.wanted).toEqual([true])
    expect(home.sent).toEqual([])
  })

  it("claims nothing for aph, or Jobs its switch kept, under a pairing made before choices were kept", async () => {
    home.earlier = true
    home.jobsKept = true
    await mount()
    expect(screen.getByText(/shows on aph's own mark\.$/)).toBeTruthy()
    expect(screen.getByText(/shows on Jobs's own mark\.$/)).toBeTruthy()
    // Practice's two kinds and voice notes.
    expect(screen.getAllByText(/: Only on this phone$/)).toHaveLength(3)
    expect(screen.getByText(LEDGER.noHistoryEarlier)).toBeTruthy()
  })

  it("sends aph's stop to aph's own mark", async () => {
    logged({ kind: "kept", scopes: ["aph"] })
    await mount()
    expect(screen.getByText(/tap the mark at the top of aph/)).toBeTruthy()
    expect(screen.queryByRole("button", { name: "Stop sending..." })).toBeNull()
  })
})

/** The status page's rows, as `useLaneRows` gives them now. */
async function rows(): Promise<{
  rows: ReadonlyArray<{ id: string; line: string; mark: unknown }>
  jobsKept: boolean
}> {
  const { useLaneRows } = await import(
    "@/components/settings/device-sharing-ledger"
  )
  const seen: Array<ReturnType<typeof useLaneRows>> = []
  const Probe = (): null => {
    seen.push(useLaneRows())
    return null
  }
  render(<Probe />)
  await act(() => Promise.resolve())
  const last = seen.at(-1)
  if (last === undefined) throw new Error("no rows")
  return last
}

describe("the status page's rows", () => {
  it("says a kept record shows how it went once its screen opens, never up to date", async () => {
    logged({ kind: "kept", scopes: ["sessions", "shelf"] })
    const practice = (await rows()).rows.find((r) => r.id === "practice")
    expect(practice).toMatchObject({
      line: "How its last send went shows once Practice opens.",
      mark: { kind: "lane", where: "kept", how: null },
    })
  })

  it("claims nothing for aph or Jobs under a pairing made before choices were kept", async () => {
    home.earlier = true
    home.jobsKept = true
    const board = await rows()
    for (const id of ["aph", "jobs"]) {
      expect(board.rows.find((r) => r.id === id)).toMatchObject({
        line: expect.stringMatching(/own mark\.$/),
        mark: { kind: "lane", where: "checking", how: null },
      })
    }
    expect(board.jobsKept).toBe(true)
  })
})

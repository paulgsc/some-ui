/**
 * @vitest-environment jsdom
 *
 * LA9 on aph's screens: kept on this phone, the strip says so and offers to
 * keep aph on home, naming the host and how many entries go before the
 * second press that does it; nothing reaches home before that press. Kept
 * on home, it says what still waits on the phone.
 */

import type { AphStore, AphWhere, Exchanged, HomeCall } from "@some-ui/aph"
import type * as ReactRouterModule from "@tanstack/react-router"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import type { HomeCall as NativeCall } from "@/lib/device-backend/native-http"
import type { AphKeeping } from "@/lib/home-link/aph"

const home = vi.hoisted(
  (): { sent: Array<unknown>; record: string | null } => ({
    sent: [],
    record: null,
  })
)

vi.mock("@/lib/device-backend/native-http", () => ({
  homeRequest: (
    call: NativeCall
  ): Promise<{ status: number; body: string }> => {
    home.sent.push(call)
    return Promise.reject(new Error("no route to host"))
  },
}))
vi.mock("@/lib/home-link/credential", () => ({
  nativeCredential: {
    read: (): Promise<{ record: string | null; lost: boolean }> =>
      Promise.resolve({ record: home.record, lost: false }),
    write: (): Promise<void> => Promise.resolve(),
    clear: (): Promise<void> => Promise.resolve(),
  },
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
  vi.resetModules()
  home.sent = []
  home.record = null
})

/** A store holding three entries, kept where `where` says. */
function fakeStore(initial: AphWhere): AphStore & { kept: number } {
  let where = initial
  const listeners = new Set<() => void>()
  const store: AphStore & { kept: number } = {
    kept: 0,
    get: () => ({
      settings: {
        checkpoints: [],
        labels: [],
        step: 100,
        usualLow: 0,
        usualHigh: 0,
        tolerance: 0,
        since: "2026-10-01",
      },
      entries: [{}, {}, {}].map((_, i) => ({
        id: String(i),
        day: "2026-10-16",
        checkpoint: null,
        time: null,
        mine: { value: 4300, approx: true },
        theirs: null,
        goal: null,
        labels: [],
        note: null,
        review: null,
      })),
    }),
    subscribe: (listener: () => void) => {
      listeners.add(listener)
      return (): void => {
        listeners.delete(listener)
      }
    },
    where: () => where,
    keepOnHome: (): boolean => {
      store.kept += 1
      where = {
        kind: "home",
        pulled: false,
        unsent: 4,
        refused: [],
        hidden: 0,
        edits: 1,
      }
      for (const listener of listeners) listener()
      return true
    },
    outbox: () => null,
    sent: () => undefined,
    pulled: () => false,
    save: () => null,
    review: () => false,
    editEntry: () => false,
    editSettings: () => false,
  }
  return store
}

async function show(store: AphStore): Promise<{ exchanges: number }> {
  const seen = { exchanges: 0 }
  const aph: AphKeeping = {
    store,
    exchange: async (_store: AphStore, send: HomeCall): Promise<Exchanged> => {
      seen.exchanges += 1
      await send("GET", "/record")
      return { kind: "synced" }
    },
  }
  const { DeviceKeepOnHome } = await import(
    "@/components/aph/device-keep-on-home"
  )
  render(<DeviceKeepOnHome aph={aph} />)
  await act(async () => {
    await Promise.resolve()
  })
  return seen
}

const paired = (): void => {
  home.record = JSON.stringify({
    base: "https://home.example/api/v1",
    token: "t",
  })
}

describe("where aph is kept", () => {
  it("says it is on this phone only, and points to pairing when unpaired", async () => {
    await show(fakeStore({ kind: "device" }))
    expect(screen.getByText(/Kept on this phone only/)).toBeTruthy()
    expect(screen.getByText("Pair this phone with home")).toBeTruthy()
    expect(home.sent).toEqual([])
  })

  it("names the host and the count before the second press keeps it on home", async () => {
    paired()
    const store = fakeStore({ kind: "device" })
    const seen = await show(store)
    fireEvent.click(
      screen.getByRole("button", { name: "Keep on home.example..." })
    )
    expect(
      screen.getByText(/Send 3 entries and the settings to home\.example/)
    ).toBeTruthy()
    expect(store.kept).toBe(0)
    expect(home.sent).toEqual([])

    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: "Keep on home.example" })
      )
      await Promise.resolve()
    })
    expect(store.kept).toBe(1)
    expect(seen.exchanges).toBe(1)
  })

  it("says what waits on the phone when home could not be reached", async () => {
    paired()
    const store = fakeStore({ kind: "device" })
    await show(store)
    fireEvent.click(
      screen.getByRole("button", { name: "Keep on home.example..." })
    )
    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: "Keep on home.example" })
      )
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    expect(
      await screen.findByText(
        "4 changes wait on this phone until home.example answers."
      )
    ).toBeTruthy()
    expect(screen.getByRole("button", { name: "Try now" })).toBeTruthy()
  })

  it("offers Stop while a run is under way, and stops it", async () => {
    paired()
    const store = fakeStore({ kind: "device" })
    let release: () => void = () => undefined
    const seen = { stopped: false }
    const aph: AphKeeping = {
      store,
      exchange: async (_store, send): Promise<Exchanged> => {
        await new Promise<void>((resolve) => {
          release = resolve
        })
        await send("GET", "/record").catch(() => {
          seen.stopped = true
        })
        return { kind: "synced" }
      },
    }
    const { DeviceKeepOnHome } = await import(
      "@/components/aph/device-keep-on-home"
    )
    render(<DeviceKeepOnHome aph={aph} />)
    await act(async () => {
      await Promise.resolve()
    })
    fireEvent.click(
      screen.getByRole("button", { name: "Keep on home.example..." })
    )
    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: "Keep on home.example" })
      )
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    fireEvent.click(await screen.findByRole("button", { name: "Stop" }))
    expect(screen.getByRole("button", { name: "Stopping..." })).toBeTruthy()
    await act(async () => {
      release()
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    expect(seen.stopped).toBe(true)
    expect(home.sent).toEqual([])
  })
})

/**
 * @vitest-environment jsdom
 *
 * Where a learner's sessions are kept, and the two acts only the person may do:
 * keep an account, and copy what is on this device into one. What matters here
 * is what each state says, and above all that nothing is copied until the
 * second press.
 */

import type { ReactNode } from "react"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { authority } from "@/lib/authority"
import type * as TenantModule from "@/lib/tenant"
import type { TransferPreview } from "@/lib/tenant"

const calls = vi.hoisted(() => {
  const navigated: Array<unknown> = []
  const copied: Array<string> = []
  return { navigated, copied }
})
let preview: TransferPreview | null = null

vi.mock("@tanstack/react-router", () => ({
  useNavigate:
    (): ((to: unknown) => Promise<void>) =>
    (to: unknown): Promise<void> => {
      calls.navigated.push(to)
      return Promise.resolve()
    },
}))

vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
}))

vi.mock("@/components/settings/account-section", () => ({
  AccountSection: (): ReactNode => <p>account controls</p>,
}))

vi.mock(
  "@/lib/tenant",
  (): Pick<
    typeof TenantModule,
    "useTransferPreview" | "useCopyDeviceSessions"
  > => ({
    useTransferPreview: () =>
      // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- the one field the screen reads of a query result.
      ({ data: preview }) as ReturnType<typeof TenantModule.useTransferPreview>,
    useCopyDeviceSessions:
      () =>
      (notices): Promise<void> => {
        calls.copied.push("copied")
        notices.copied(2)
        return Promise.resolve()
      },
  })
)

const { DataHomeSection } = await import(
  "@/components/settings/data-home-section"
)

function renderSection(): void {
  render(<DataHomeSection />)
}

async function press(name: RegExp): Promise<void> {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name }))
    await Promise.resolve()
  })
}

beforeEach(() => {
  window.localStorage.clear()
  authority.resetForTests()
  preview = null
})

afterEach(() => {
  cleanup()
  calls.navigated.length = 0
  calls.copied.length = 0
})

describe("on this device", () => {
  it("says nothing is sent, that no account is needed, and what that costs", () => {
    renderSection()
    expect(
      screen.getByText(/nothing about them is sent to the server/i)
    ).toBeTruthy()
    expect(screen.getByText(/you don't need an account/i)).toBeTruthy()
    expect(
      screen.getByText(/clearing its site data removes them/i)
    ).toBeTruthy()
    expect(screen.queryByText(/account controls/i)).toBeNull()
  })

  it("offers an account as a button, and nothing is sent by it", async () => {
    renderSection()
    await press(/keep an account/i)
    expect(calls.navigated).toEqual([
      { to: "/auth", search: { redirect: "/settings" } },
    ])
  })

  it("offers no copying: there is no account to copy to", () => {
    preview = { toCopy: 3, alreadyThere: 0 }
    renderSection()
    expect(
      screen.queryByRole("button", { name: /copy to my account/i })
    ).toBeNull()
  })
})

describe("when the account session ended", () => {
  beforeEach(() => {
    authority.dispatch({ type: "session-started", adopt: true })
    authority.dispatch({ type: "session-ended", forget: false })
  })

  it("says so in place, that nothing was lost, and offers to sign in", async () => {
    renderSection()
    expect(screen.getByText(/your account session ended/i)).toBeTruthy()
    expect(screen.getByText(/nothing was lost or sent/i)).toBeTruthy()
    await press(/^sign in$/i)
    expect(calls.navigated).toEqual([
      { to: "/auth", search: { redirect: "/settings" } },
    ])
  })

  it("lets the person carry on here instead", async () => {
    renderSection()
    await press(/use this device instead/i)
    expect(authority.getSnapshot()).toMatchObject({
      choice: "local",
      accountUnavailable: false,
    })
  })
})

describe("on the account", () => {
  beforeEach(() => {
    authority.dispatch({ type: "session-started", adopt: true })
  })

  it("shows the account's controls, and no offer when the device holds nothing new", () => {
    renderSection()
    expect(screen.getByText(/account controls/i)).toBeTruthy()
    expect(
      screen.queryByRole("button", { name: /copy to my account/i })
    ).toBeNull()
  })

  it("says when what is on the device is already there", () => {
    preview = { toCopy: 0, alreadyThere: 2 }
    renderSection()
    expect(screen.getByText(/already in your account/i)).toBeTruthy()
  })

  it("says what would be sent and where, and sends nothing on the first press", async () => {
    preview = { toCopy: 3, alreadyThere: 0 }
    renderSection()

    expect(
      screen.getByText(/3 sessions on this device aren't in your account/i)
    ).toBeTruthy()
    expect(screen.getByText(/this device keeps its own copies/i)).toBeTruthy()
    expect(
      screen.getByText(/nothing is copied unless you press this/i)
    ).toBeTruthy()

    await press(/copy to my account/i)
    expect(calls.copied).toEqual([])
    expect(
      screen.getByRole("button", { name: /yes, copy 3 sessions/i })
    ).toBeTruthy()
  })

  it("can be backed out of", async () => {
    preview = { toCopy: 1, alreadyThere: 0 }
    renderSection()
    await press(/copy to my account/i)
    await press(/not now/i)
    expect(calls.copied).toEqual([])
    expect(
      screen.getByRole("button", { name: /copy to my account/i })
    ).toBeTruthy()
  })

  it("copies only on the second press, and goes back to asking nothing", async () => {
    preview = { toCopy: 2, alreadyThere: 0 }
    renderSection()
    await press(/copy to my account/i)
    await press(/yes, copy 2 sessions/i)
    expect(calls.copied).toEqual(["copied"])
    expect(screen.queryByRole("button", { name: /yes, copy/i })).toBeNull()
  })
})

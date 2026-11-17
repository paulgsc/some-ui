/**
 * @vitest-environment jsdom
 *
 * SIGNIN1 (#3087) on the screen: the sign-in mark says whether this phone is
 * signed in to home, asks home once when it finds a pairing it hasn't heard
 * of, and says a lost pairing once, as a notice, with the way to pair again.
 */
import type * as ReactRouterModule from "@tanstack/react-router"
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react"
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest"

import type { HomeRequest as NativeCall } from "@/lib/device-backend/native-http"

const home = vi.hoisted(
  (): {
    credential: Record<string, unknown> | null
    sent: Array<NativeCall>
    status: number
  } => ({ credential: null, sent: [], status: 200 })
)

vi.mock("@/lib/device-backend/native-http", () => ({
  homeRequest: (
    call: NativeCall
  ): Promise<{ status: number; body: string }> => {
    home.sent.push(call)
    return Promise.resolve({ status: home.status, body: "{}" })
  },
}))
vi.mock("@/lib/home-link/credential", () => ({
  nativeCredential: {
    read: (): Promise<{ record: string | null; lost: boolean }> =>
      Promise.resolve({
        record:
          home.credential === null ? null : JSON.stringify(home.credential),
        lost: false,
      }),
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

beforeAll(async () => {
  await import("@/components/device-sign-in-mark")
}, 30_000)

beforeEach(() => {
  vi.resetModules()
  home.credential = null
  home.sent = []
  home.status = 200
})
afterEach(cleanup)

async function mark(): Promise<HTMLElement> {
  const { SignInMark } = await import("@/components/device-sign-in-mark")
  render(<SignInMark />)
  return screen.getByRole("button", { name: /^Home:/ })
}

describe("the sign-in mark", () => {
  it("says not signed in on a phone never paired, and asks home nothing", async () => {
    const button = await mark()
    await waitFor(() =>
      expect(button.getAttribute("data-signed-in")).toBe("out")
    )
    expect(button.getAttribute("aria-label")).toBe("Home: not signed in")
    fireEvent.click(button)
    expect(await screen.findByText("Not signed in to home.")).toBeTruthy()
    expect(screen.getByText("Pair with home")).toBeTruthy()
    expect(home.sent).toEqual([])
  })

  it("asks home once for a pairing it found, and says where and since when", async () => {
    home.credential = {
      base: "https://home.example/api/v1",
      token: "t",
      id: "p1",
      pairedAt: Date.UTC(2026, 10, 17, 12),
    }
    const button = await mark()
    await waitFor(() =>
      expect(button.getAttribute("data-signed-in")).toBe("in")
    )
    expect(home.sent).toEqual([
      {
        method: "GET",
        url: "https://home.example/api/v1/auth/session",
        token: "t",
      },
    ])
    fireEvent.click(button)
    expect(
      await screen.findByText(/^Signed in to home at home\.example, since /)
    ).toBeTruthy()
  })

  it("says once that home stopped knowing the phone, and leads to pairing again", async () => {
    home.credential = {
      base: "https://home.example/api/v1",
      token: "t",
      id: "p1",
    }
    home.status = 401
    const button = await mark()
    await waitFor(() =>
      expect(button.getAttribute("data-signed-in")).toBe("lost")
    )
    expect(
      screen.getByText(
        "Home stopped knowing this phone. What you do stays here until you pair again."
      )
    ).toBeTruthy()
    fireEvent.click(button)
    expect(await screen.findByText("Pair again")).toBeTruthy()
    expect(home.sent).toHaveLength(1)
  })
})

/**
 * @vitest-environment jsdom
 *
 * The approval page shows who is asking, where the answer goes and what it
 * allows, from the query the AI service wrote, and asks for the passkey only
 * when allowing needs it.
 */

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

type World = {
  opened: Array<unknown>
  answered: Array<string>
  signIns: number
  signedIn: boolean
}

const world = vi.hoisted(
  (): World => ({ opened: [], answered: [], signIns: 0, signedIn: true })
)

vi.mock("@tanstack/react-router", () => ({
  createFileRoute:
    () =>
    (options: object): object => ({ options }),
}))

vi.mock("@/lib/oauth/client", () => ({
  createApprovalClient: (): object => ({
    open: (params: unknown): Promise<unknown> => {
      world.opened.push(params)
      return Promise.resolve({
        kind: "pending",
        approval: {
          request: "req-1",
          clientName: "Claude",
          redirectHost: "claude.ai",
          scopes: ["lessons:read", "shelf"],
        },
      })
    },
    answer: (_request: string, answer: string): Promise<string> => {
      world.answered.push(answer)
      // Not followed: jsdom does not navigate, and the page's state says
      // where it went.
      return Promise.resolve("about:blank")
    },
  }),
}))

vi.mock("@/lib/auth", () => ({
  describeAuthError: (): string => "No passkey was used.",
  resolveSession: (): Promise<boolean> => Promise.resolve(world.signedIn),
  signIn: (): Promise<void> => {
    world.signIns += 1
    return Promise.resolve()
  },
}))

const { Route } = await import("@/routes/connect")

beforeEach(() => {
  world.opened = []
  world.answered = []
  world.signIns = 0
  world.signedIn = true
  window.history.replaceState(
    null,
    "",
    "/connect?response_type=code&client_id=c1&state=1e5&scope=lessons%3Aread+shelf"
  )
  // jsdom implements no navigation; the page's leaving is read from its text.
  vi.spyOn(console, "error").mockImplementation(() => undefined)
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

async function renderConnect(): Promise<void> {
  const Page = Route.options.component
  if (!Page) throw new Error("the /connect route has no component")
  render(<Page />)
  await screen.findByText(/connect claude\?/i)
}

async function press(name: RegExp): Promise<void> {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name }))
    await Promise.resolve()
  })
}

describe("/connect", () => {
  it("hands in the query exactly as written and describes the request", async () => {
    await renderConnect()
    expect(world.opened).toEqual([
      {
        response_type: "code",
        client_id: "c1",
        state: "1e5",
        scope: "lessons:read shelf",
      },
    ])
    expect(screen.getByText("claude.ai")).toBeTruthy()
    expect(screen.getByText(/lessons everyone here is served/i)).toBeTruthy()
    expect(screen.getByText(/only you see/i)).toBeTruthy()
  })

  it("allows at once when signed in, and leaves for the service", async () => {
    await renderConnect()
    await press(/^allow$/i)
    expect(world.signIns).toBe(0)
    expect(world.answered).toEqual(["approve"])
    expect(
      await screen.findByText(/taking you back to claude\.ai/i)
    ).toBeTruthy()
  })

  it("signs in first when signed out", async () => {
    world.signedIn = false
    await renderConnect()
    await press(/sign in and allow/i)
    await vi.waitFor(() => expect(world.answered).toEqual(["approve"]))
    expect(world.signIns).toBe(1)
  })

  it("declines without signing in", async () => {
    world.signedIn = false
    await renderConnect()
    await press(/decline/i)
    await vi.waitFor(() => expect(world.answered).toEqual(["deny"]))
    expect(world.signIns).toBe(0)
    expect(await screen.findByText(/declined/i)).toBeTruthy()
  })
})

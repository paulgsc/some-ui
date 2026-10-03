import { describe, expect, it, vi } from "vitest"

import { FileHostResponseError } from "@/lib/file-host-config/client"
import type { ApprovalClient } from "@/lib/oauth/client"
import type { ConnectPorts } from "@/lib/oauth/connect-runtime"
import { createConnect } from "@/lib/oauth/connect-runtime"
import type { PendingApproval } from "@/lib/oauth/types"

const APPROVAL: PendingApproval = {
  request: "req-1",
  clientName: "Claude",
  redirectHost: "claude.ai",
  scopes: ["lessons:read"],
}

const PAGE = { search: "?client_id=client-1&state=xyz", framed: false }

type World = ConnectPorts & {
  client: ApprovalClient
  signIn: ReturnType<typeof vi.fn<() => Promise<void>>>
  go: ReturnType<typeof vi.fn<(url: string) => void>>
}

function ports(overrides: Partial<World> = {}): World {
  return {
    client: {
      open: vi.fn<ApprovalClient["open"]>(() =>
        Promise.resolve({ kind: "pending", approval: APPROVAL })
      ),
      answer: vi.fn<ApprovalClient["answer"]>(() =>
        Promise.resolve("https://claude.ai/cb?code=c")
      ),
    },
    hasSession: () => Promise.resolve(true),
    signIn: vi.fn<() => Promise<void>>(() => Promise.resolve()),
    describeSignInError: () => "No passkey was used.",
    go: vi.fn<(url: string) => void>(),
    ...overrides,
  }
}

const settle = (): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, 0))

describe("createConnect", () => {
  it("hands the request in once across a remount, then approves and leaves", async () => {
    const world = ports()
    const runtime = createConnect(world)
    const detach = runtime.attach(PAGE)
    detach()
    runtime.attach(PAGE)
    await settle()
    expect(world.client.open).toHaveBeenCalledTimes(1)
    expect(world.client.open).toHaveBeenCalledWith({
      client_id: "client-1",
      state: "xyz",
    })
    expect(runtime.getSnapshot()).toMatchObject({
      kind: "asking",
      session: "signed-in",
    })

    runtime.dispatch({ type: "approve" })
    await settle()
    expect(world.signIn).not.toHaveBeenCalled()
    expect(world.client.answer).toHaveBeenCalledWith("req-1", "approve")
    expect(world.go).toHaveBeenCalledWith("https://claude.ai/cb?code=c")
  })

  it("signs in first when there is no session, and says why when that fails", async () => {
    const signIn = vi
      .fn<() => Promise<void>>()
      .mockRejectedValueOnce(new Error("cancelled"))
      .mockResolvedValueOnce(undefined)
    const world = ports({ hasSession: () => Promise.resolve(false), signIn })
    const runtime = createConnect(world)
    runtime.attach(PAGE)
    await settle()

    runtime.dispatch({ type: "approve" })
    await settle()
    expect(runtime.getSnapshot()).toMatchObject({
      kind: "asking",
      notice: "No passkey was used.",
    })
    expect(world.client.answer).not.toHaveBeenCalled()

    runtime.dispatch({ type: "approve" })
    await settle()
    expect(world.client.answer).toHaveBeenCalledWith("req-1", "approve")
    expect(world.go).toHaveBeenCalledTimes(1)
  })

  it("reads a 404 as an ended request and a 401 as an ended session", async () => {
    const answer = vi
      .fn<ApprovalClient["answer"]>()
      .mockRejectedValueOnce(
        new FileHostResponseError(401, "/x", "unauthorized")
      )
      .mockRejectedValueOnce(new FileHostResponseError(404, "/x", "not_found"))
    const world = ports()
    world.client.answer = answer
    const runtime = createConnect(world)
    runtime.attach(PAGE)
    await settle()

    runtime.dispatch({ type: "approve" })
    await settle()
    expect(runtime.getSnapshot()).toMatchObject({
      kind: "asking",
      session: "signed-out",
    })

    runtime.dispatch({ type: "approve" })
    await settle()
    expect(world.signIn).toHaveBeenCalledTimes(1)
    expect(runtime.getSnapshot()).toMatchObject({
      kind: "unusable",
      reason: "expired",
    })
    expect(world.go).not.toHaveBeenCalled()
  })

  it("does not leave for the service once no page is showing", async () => {
    const world = ports()
    const runtime = createConnect(world)
    const detach = runtime.attach(PAGE)
    await settle()
    runtime.dispatch({ type: "deny" })
    detach()
    await settle()
    expect(runtime.getSnapshot()).toMatchObject({ kind: "leaving" })
    expect(world.go).not.toHaveBeenCalled()
  })

  it("says an unreachable server is unreachable, and tries again on request", async () => {
    const open = vi
      .fn<ApprovalClient["open"]>()
      .mockRejectedValueOnce(new TypeError("fetch failed"))
      .mockResolvedValueOnce({ kind: "pending", approval: APPROVAL })
    const world = ports()
    world.client.open = open
    const runtime = createConnect(world)
    runtime.attach(PAGE)
    await settle()
    expect(runtime.getSnapshot()).toMatchObject({ reason: "unreachable" })
    runtime.dispatch({ type: "retry" })
    await settle()
    expect(runtime.getSnapshot()).toMatchObject({ kind: "asking" })
  })

  it("asks nothing of a server it does not have", async () => {
    const hasSession = vi.fn(() => Promise.resolve(true))
    const runtime = createConnect({ ...ports(), client: undefined, hasSession })
    runtime.attach(PAGE)
    await settle()
    expect(hasSession).not.toHaveBeenCalled()
    expect(runtime.getSnapshot()).toMatchObject({ reason: "no-server" })
  })
})

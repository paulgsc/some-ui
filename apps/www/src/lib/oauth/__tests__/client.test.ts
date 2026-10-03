import { describe, expect, it } from "vitest"

import type { FileHostTransport } from "@/lib/file-host-config/client"
import {
  FileHostNotConfiguredError,
  FileHostResponseError,
} from "@/lib/file-host-config/client"
import { createApprovalClient, createGrantsClient } from "@/lib/oauth/client"

type Call = [method: string, route: string, body: string | undefined]

function recording(answer: () => Response): {
  transport: FileHostTransport
  calls: Array<Call>
} {
  const calls: Array<Call> = []
  const transport: FileHostTransport = (route, init) => {
    calls.push([
      init?.method ?? "GET",
      route,
      typeof init?.body === "string" ? init.body : undefined,
    ])
    return Promise.resolve(answer())
  }
  return { transport, calls }
}

const PARAMS = {
  response_type: "code",
  client_id: "client-1",
  redirect_uri: "https://claude.ai/api/mcp/auth_callback",
  state: "1e5",
}

describe("createApprovalClient", () => {
  it("hands in the request's parameters as received and reads the description", async () => {
    const pending = {
      request: "req-1",
      clientName: "Claude",
      redirectHost: "claude.ai",
      scopes: ["lessons:read", "shelf"],
    }
    const { transport, calls } = recording(() => Response.json(pending))
    const client = createApprovalClient(transport)!
    await expect(client.open(PARAMS)).resolves.toEqual({
      kind: "pending",
      approval: pending,
    })
    expect(calls).toEqual([
      ["POST", "/oauth/authorize/requests", JSON.stringify(PARAMS)],
    ])
  })

  it("reads OAuth's own refusals, with and without a way back to the service", async () => {
    const back = "https://claude.ai/cb?error=invalid_scope&state=1e5"
    let body: unknown = { error: "invalid_scope", redirectTo: back }
    const { transport } = recording(() => Response.json(body, { status: 400 }))
    const client = createApprovalClient(transport)!
    await expect(client.open(PARAMS)).resolves.toEqual({
      kind: "refused",
      error: "invalid_scope",
      description: null,
      redirectTo: back,
    })

    body = {
      error: "invalid_client",
      error_description: "this client is not registered",
    }
    await expect(client.open(PARAMS)).resolves.toEqual({
      kind: "refused",
      error: "invalid_client",
      description: "this client is not registered",
      redirectTo: null,
    })
  })

  it("leaves file_host's own envelope to requestJSON: OAuth off is not configured", async () => {
    const { transport } = recording(() =>
      Response.json(
        { error: { code: "feature_not_configured", message: "off" } },
        { status: 503 }
      )
    )
    await expect(
      createApprovalClient(transport)!.open(PARAMS)
    ).rejects.toBeInstanceOf(FileHostNotConfiguredError)
  })

  it("answers a request by its encoded id and returns where to go", async () => {
    const { transport, calls } = recording(() =>
      Response.json({ redirectTo: "https://claude.ai/cb?code=c" })
    )
    const client = createApprovalClient(transport)!
    await expect(client.answer("a/b", "approve")).resolves.toBe(
      "https://claude.ai/cb?code=c"
    )
    await client.answer("a/b", "deny")
    expect(calls.map(([method, route]) => [method, route])).toEqual([
      ["POST", "/oauth/authorize/requests/a%2Fb/approve"],
      ["POST", "/oauth/authorize/requests/a%2Fb/deny"],
    ])
  })

  it("lets an answer's 404 through as file_host's error", async () => {
    const { transport } = recording(() =>
      Response.json(
        { error: { code: "not_found", message: "gone" } },
        { status: 404 }
      )
    )
    const answered = createApprovalClient(transport)!.answer("r", "approve")
    await expect(answered).rejects.toBeInstanceOf(FileHostResponseError)
    await expect(answered).rejects.toMatchObject({ status: 404 })
  })

  it("is absent with no server", () => {
    expect(createApprovalClient(null)).toBeUndefined()
  })
})

describe("createGrantsClient", () => {
  it("lists the connected services and disconnects one through a bodiless 204", async () => {
    const grants = [{ id: "g 1", clientName: "Claude", scopes: ["shelf"] }]
    let status = 200
    const { transport, calls } = recording(() =>
      status === 204
        ? new Response(null, { status: 204 })
        : Response.json({ grants })
    )
    const client = createGrantsClient(transport)!
    await expect(client.list()).resolves.toEqual(grants)
    status = 204
    await expect(client.disconnect("g 1")).resolves.toBeUndefined()
    expect(calls.map(([method, route]) => [method, route])).toEqual([
      ["GET", "/oauth/grants"],
      ["DELETE", "/oauth/grants/g%201"],
    ])
  })
})

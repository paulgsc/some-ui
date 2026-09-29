import { describe, expect, it } from "vitest"

import type { FileHostTransport } from "@/lib/file-host-config/client"
import { createRoundCrmClient } from "@/lib/round-crm-client"

function recording(body: unknown): {
  transport: FileHostTransport
  calls: Array<[string, string, string | undefined]>
} {
  const calls: Array<[string, string, string | undefined]> = []
  const transport: FileHostTransport = (route, init) => {
    calls.push([
      init?.method ?? "GET",
      route,
      typeof init?.body === "string" ? init.body : undefined,
    ])
    return Promise.resolve(Response.json(body))
  }
  return { transport, calls }
}

describe("createRoundCrmClient", () => {
  it("PUTs the round's body as a string field, under an encoded id", async () => {
    const { transport, calls } = recording({ change: "inserted", round: {} })
    await createRoundCrmClient(transport).write("a b", '{"id":"a b"}\n')
    expect(calls).toEqual([
      [
        "PUT",
        "/leetype/operator/rounds/a%20b",
        JSON.stringify({ body: '{"id":"a b"}\n' }),
      ],
    ])
  })

  it("lists, retires and restores on the operator routes", async () => {
    const { transport, calls } = recording({ rounds: [] })
    const client = createRoundCrmClient(transport)
    await client.list()
    await client.retire("r")
    await client.restore("r")
    expect(calls.map(([method, route]) => [method, route])).toEqual([
      ["GET", "/leetype/operator/rounds"],
      ["POST", "/leetype/operator/rounds/r/retire"],
      ["POST", "/leetype/operator/rounds/r/restore"],
    ])
  })

  it("reads a body from the public round route", async () => {
    const { transport, calls } = recording({ id: "r" })
    await expect(createRoundCrmClient(transport).read("r")).resolves.toBe(
      '{"id":"r"}'
    )
    expect(calls[0]?.[1]).toBe("/leetype/rounds/r")
  })

  it("rejects every call in a build with no file_host", async () => {
    await expect(createRoundCrmClient(null).list()).rejects.toThrow(
      /no file_host/
    )
  })
})

import { describe, expect, it } from "vitest"

import type { FileHostTransport } from "@/lib/file-host-config/client"
import { FileHostResponseError } from "@/lib/file-host-config/client"
import { createShelfClient, ShelfRefusedError } from "@/lib/shelf-client"

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

const refusal = (status: number, code: string) => (): Response =>
  Response.json({ error: { code, message: code } }, { status })

describe("createShelfClient", () => {
  it("lists, reads, keeps the body as sent and removes, under an encoded key", async () => {
    const listing = { items: [], cap: 20 }
    const { transport, calls } = recording(() => Response.json(listing))
    const client = createShelfClient("topik", transport)!
    await expect(client.list()).resolves.toEqual(listing)
    await client.read("first dinner")
    await client.keep("first-dinner", '{"version":1}')
    expect(calls).toEqual([
      ["GET", "/shelf/topik", undefined],
      ["GET", "/shelf/topik/first%20dinner", undefined],
      // The raw body, not wrapped: the server keeps these bytes verbatim.
      ["PUT", "/shelf/topik/first-dinner", '{"version":1}'],
    ])
  })

  it("resolves a delete's bodiless 204", async () => {
    const { transport, calls } = recording(
      () => new Response(null, { status: 204 })
    )
    await expect(
      createShelfClient("leetype", transport)!.remove("my-round")
    ).resolves.toBeUndefined()
    expect(calls).toEqual([["DELETE", "/shelf/leetype/my-round", undefined]])
  })

  it("tells a full shelf from a signed-out one, so the learner hears which", async () => {
    const full = createShelfClient(
      "topik",
      recording(refusal(409, "conflict")).transport
    )!
    const error: unknown = await full.keep("k", "{}").catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ShelfRefusedError)
    expect(error).toMatchObject({ reason: "full" })

    const signedOut = createShelfClient(
      "topik",
      recording(refusal(401, "unauthorized")).transport
    )!
    await expect(signedOut.list()).rejects.toMatchObject({
      reason: "signed-out",
    })
  })

  it("leaves every other failure as file_host's own error", async () => {
    const client = createShelfClient(
      "topik",
      recording(refusal(422, "unprocessable_entity")).transport
    )!
    const error: unknown = await client
      .keep("k.json", "{}")
      .catch((e: unknown) => e)
    expect(error).toBeInstanceOf(FileHostResponseError)
    expect(error).not.toHaveProperty("reason")
  })

  it("is no client at all in a build with no file_host", () => {
    expect(createShelfClient("topik", null)).toBeUndefined()
  })
})

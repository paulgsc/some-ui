import type { FetchClient } from "@fkit/lib/fetch-client"
import { afterEach, describe, expect, it, vi } from "vitest"
import { z } from "zod"

import { createDataSource } from "."

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  })
}

function fakeClient(): FetchClient {
  return {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
    createQueryFn: vi.fn(),
    createMutationFn: vi.fn(),
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("createDataSource mode dispatch", () => {
  it("resolves the static endpoint when mode is static and never calls the server builder", () => {
    const staticLocator = vi.fn(
      (key: string) => new URL(`https://cdn.test/${key}.json`)
    )
    const serverLocator = vi.fn()
    const client = fakeClient()

    const dataSource = createDataSource<string, unknown>(
      { static: staticLocator, server: serverLocator },
      { mode: "static", client }
    )

    expect(dataSource.mode).toBe("static")
    void dataSource.fetch("beginner")

    expect(staticLocator).toHaveBeenCalledWith("beginner")
    expect(serverLocator).not.toHaveBeenCalled()
    expect(client.get).toHaveBeenCalledWith(
      new URL("https://cdn.test/beginner.json"),
      undefined,
      undefined
    )
  })

  it("resolves the server endpoint when mode is server and never calls the static builder", () => {
    const staticLocator = vi.fn()
    const serverLocator = vi.fn(
      (key: string) => new URL(`http://localhost:4000/api/topik/${key}`)
    )
    const client = fakeClient()

    const dataSource = createDataSource<string, unknown>(
      { static: staticLocator, server: serverLocator },
      { mode: "server", client }
    )

    expect(dataSource.mode).toBe("server")
    void dataSource.fetch("advanced")

    expect(serverLocator).toHaveBeenCalledWith("advanced")
    expect(staticLocator).not.toHaveBeenCalled()
    expect(client.get).toHaveBeenCalledWith(
      new URL("http://localhost:4000/api/topik/advanced"),
      undefined,
      undefined
    )
  })

  it("forwards fetchOptions and schema through to the client untouched by mode", async () => {
    const schema = z.object({ id: z.number() })
    const client = fakeClient()
    vi.mocked(client.get).mockResolvedValue({ id: 1 })

    const dataSource = createDataSource<void, { id: number }>(
      {
        static: () => new URL("https://cdn.test/resource.json"),
        server: () => new URL("http://localhost:4000/api/resource"),
      },
      { mode: "static", client, fetchOptions: { timeout: 5000 } }
    )

    const result = await dataSource.fetch(undefined, schema)

    expect(result).toEqual({ id: 1 })
    expect(client.get).toHaveBeenCalledWith(
      new URL("https://cdn.test/resource.json"),
      { timeout: 5000 },
      schema
    )
  })

  it("defaults to the package's shared apiClient (real fetch) when no client is supplied", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ ok: true }))
    vi.stubGlobal("fetch", fetchMock)

    const dataSource = createDataSource<void, { ok: boolean }>(
      {
        static: () => new URL("https://cdn.test/resource.json"),
        server: () => new URL("http://localhost:4000/api/resource"),
      },
      { mode: "static" }
    )

    await expect(dataSource.fetch()).resolves.toEqual({ ok: true })
    expect(fetchMock).toHaveBeenCalledWith(
      new URL("https://cdn.test/resource.json"),
      expect.anything()
    )
  })
})

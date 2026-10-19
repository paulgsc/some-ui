/**
 * The phone's request to home as Capacitor's native HTTP carries it: the
 * tag a revalidated read sends, and the tag an answer brings back, however
 * the platform spells its header.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"

import { homeRequest } from "@/lib/device-backend/native-http"
import { HomeNoAnswerError } from "@/lib/device-backend/native-http/no-answer"
import { ForeignCallError } from "@/lib/intent/foreign"

const plugin = vi.hoisted(() => ({
  request: vi.fn<(options: unknown) => Promise<unknown>>(),
}))

vi.mock("@capacitor/core", () => ({ CapacitorHttp: plugin }))

beforeEach(() => {
  plugin.request.mockReset()
})

describe("homeRequest", () => {
  it("throws home's silence as HomeNoAnswerError, and a build without the plugin as neither", async () => {
    const url = "http://192.168.1.10:3000/x"
    plugin.request.mockRejectedValue(new Error("connection refused"))
    await expect(homeRequest({ method: "GET", url })).rejects.toBeInstanceOf(
      HomeNoAnswerError
    )
    plugin.request.mockRejectedValue({ code: "UNIMPLEMENTED" })
    const missing = await homeRequest({ method: "GET", url }).catch(
      (error: unknown) => error
    )
    expect(missing).toBeInstanceOf(ForeignCallError)
    expect(missing).not.toBeInstanceOf(HomeNoAnswerError)
  })

  it("sends If-None-Match, and reads a bodiless 304 with its ETag", async () => {
    plugin.request.mockResolvedValue({
      status: 304,
      data: "",
      headers: { ETag: '"v1"' },
    })
    const answer = await homeRequest({
      method: "GET",
      url: "http://192.168.1.10:3000/api/v1/curriculum/a",
      ifNoneMatch: '"v1"',
    })
    expect(answer).toEqual({ status: 304, body: "", etag: '"v1"' })
    expect(plugin.request).toHaveBeenCalledWith(
      expect.objectContaining({ headers: { "If-None-Match": '"v1"' } })
    )
  })

  it("reads the tag in any case, and carries none it wasn't given", async () => {
    plugin.request.mockResolvedValue({
      status: 200,
      data: { topiks: [] },
      headers: { etag: '"v2"' },
    })
    const answer = await homeRequest({
      method: "GET",
      url: "http://192.168.1.10:3000/api/v1/curriculum/manifest.json",
    })
    expect(answer).toEqual({ status: 200, body: '{"topiks":[]}', etag: '"v2"' })
    expect(plugin.request).toHaveBeenCalledWith(
      expect.objectContaining({ headers: {} })
    )

    plugin.request.mockResolvedValue({ status: 200, data: "", headers: {} })
    await expect(
      homeRequest({ method: "GET", url: "http://192.168.1.10:3000/x" })
    ).resolves.toEqual({ status: 200, body: "" })
  })
})

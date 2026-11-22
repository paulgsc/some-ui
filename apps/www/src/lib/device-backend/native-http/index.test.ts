/**
 * The phone's request to home as Capacitor's native HTTP carries it: the
 * tag a revalidated read sends, and the tag an answer brings back, however
 * the platform spells its header.
 *
 * Promise NA2 (#3411): the phone says it can't reach home only once every
 * network it has was asked.
 * - Claim: a request to home that found no answer or no name over the
 *   network Android gave this app is asked once more over each other
 *   network the phone has, Wi-Fi first (`./route`, HomeRoutePlugin); an
 *   answer there is home's; Android keeping the app off the network is said
 *   as that (`held`), in the phone's own settings' words; anything else
 *   keeps the first failure.
 * - Family: the app's traffic on Wi-Fi or on mobile data (Android's
 *   default, or a per-app setting) × home answering on Wi-Fi only × mobile
 *   data there or gone × Data Saver on or off with the Wi-Fi metered or not
 *   × the first failure's kind (no answer, a name, a certificate, a fault)
 *   × the second try's end (answered, held, none).
 * - Proof: these tests, over the second try's three ends and which
 *   failures ask it; and android-compat.yml's route scenario
 *   (apps/mobile/compat/route.sh, HomeRouteTest) on emulators set up as the
 *   S26 (Wi-Fi the default) and as the S21 Ultra (its traffic on mobile data
 *   while home answers only on Wi-Fi), each as the app was and with the fix.
 * - Tolerance: a per-app setting that keeps the app off Wi-Fi (One UI's
 *   "Mobile data only apps" and "Allowed networks for apps") is reported,
 *   not repaired: no network the app may not use can be asked. Every
 *   failure writes HomeRoute's diagnostic line, which names each network's
 *   own failure; the screen says held where Android says it holds the app,
 *   and the first failure where it doesn't. Such a setting is emulated
 *   only as an iptables rule on the app, which Android doesn't know of. A
 *   request the default network fails slowly waits that failure out before
 *   the second try.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"

import { homeRequest } from "@/lib/device-backend/native-http"
import {
  HomeBlockedError,
  HomeNoAnswerError,
} from "@/lib/device-backend/native-http/no-answer"
import { ForeignCallError } from "@/lib/intent/foreign"

const plugin = vi.hoisted(() => ({
  request: vi.fn<(options: unknown) => Promise<unknown>>(),
}))
/** HomeRoute (NA2): asked only after Capacitor's request found no way to home. */
const route = vi.hoisted(() => ({
  request: vi.fn<(options: unknown) => Promise<unknown>>(),
}))

vi.mock("@capacitor/core", () => ({
  CapacitorHttp: plugin,
  registerPlugin: (): typeof route => route,
}))

beforeEach(() => {
  plugin.request.mockReset()
  route.request.mockReset()
  route.request.mockRejectedValue({
    code: "NO_ROUTE",
    message: "tried nothing else",
  })
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

  it("asks for a range of bytes as a blob, credentialed over https only", async () => {
    plugin.request.mockResolvedValue({
      status: 206,
      data: "AAEC",
      headers: { "Content-Range": "bytes 0-2/10" },
    })
    const range = { start: 0, end: 2 }
    const answer = await homeRequest({
      method: "GET",
      url: "https://home.local/api/v1/feeds/call/videos/2026-10-30/video",
      token: "t",
      range,
    })
    expect(answer).toEqual({ status: 206, body: "AAEC" })
    expect(plugin.request).toHaveBeenCalledWith(
      expect.objectContaining({
        headers: { Authorization: "Bearer t", Range: "bytes=0-2" },
        responseType: "blob",
        disableRedirects: true,
      })
    )
    plugin.request.mockClear()
    await expect(
      homeRequest({
        method: "GET",
        url: "http://home.local/x",
        token: "t",
        range,
      })
    ).rejects.toThrow("https only")
    expect(plugin.request).not.toHaveBeenCalled()
  })

  it("asks for all of a small file as a blob, with no Range", async () => {
    plugin.request.mockResolvedValue({
      status: 200,
      data: "iVBORw0KGgo=",
      headers: {},
    })
    const answer = await homeRequest({
      method: "GET",
      url: "https://home.local/api/v1/clips/a/after/01.png",
      token: "t",
      range: "whole",
    })
    expect(answer).toEqual({ status: 200, body: "iVBORw0KGgo=" })
    expect(plugin.request).toHaveBeenCalledWith(
      expect.objectContaining({
        headers: { Authorization: "Bearer t" },
        responseType: "blob",
      })
    )
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

  it("reads the tag and home's Retry-After (AD3) in any case, and carries none it wasn't given", async () => {
    plugin.request.mockResolvedValue({
      status: 200,
      data: { topiks: [] },
      headers: { etag: '"v2"', "RETRY-after": "17" },
    })
    const answer = await homeRequest({
      method: "GET",
      url: "http://192.168.1.10:3000/api/v1/curriculum/manifest.json",
    })
    expect(answer).toEqual({
      status: 200,
      body: '{"topiks":[]}',
      etag: '"v2"',
      retryAfter: "17",
    })
    expect(plugin.request).toHaveBeenCalledWith(
      expect.objectContaining({ headers: {} })
    )

    plugin.request.mockResolvedValue({ status: 200, data: "", headers: {} })
    await expect(
      homeRequest({ method: "GET", url: "http://192.168.1.10:3000/x" })
    ).resolves.toEqual({ status: 200, body: "" })
  })

  it("sends bytes as their own type, base64 for the plugin, and text as JSON", async () => {
    plugin.request.mockResolvedValue({ status: 200, data: "{}", headers: {} })
    await homeRequest({
      method: "PUT",
      url: "https://home.example/api/v1/voice-notes/n1",
      token: "t",
      body: { contentType: "audio/webm;codecs=opus", base64: "GkXfow==" },
    })
    expect(plugin.request).toHaveBeenLastCalledWith(
      expect.objectContaining({
        headers: {
          Authorization: "Bearer t",
          "Content-Type": "audio/webm;codecs=opus",
        },
        data: "GkXfow==",
        dataType: "file",
      })
    )
    await homeRequest({
      method: "PUT",
      url: "https://home.example/api/v1/jobs/events/e1",
      token: "t",
      body: '{"id":"e1"}',
    })
    const options = plugin.request.mock.lastCall?.[0]
    expect(options).toMatchObject({
      headers: { "Content-Type": "application/json" },
      data: '{"id":"e1"}',
    })
    expect(options).not.toHaveProperty("dataType")
  })

  /**
   * NA2 (#3411): Android can put this app's traffic on mobile data while the
   * phone sits on home's Wi-Fi, so a request that found no answer or no name
   * is asked once over the phone's other networks.
   */
  describe("NA2: every network is asked before home is said unreachable", () => {
    const url = "https://home.local/api/v1/sessions"
    const NAME = {
      message:
        'Unable to resolve host "home.local": No address associated with hostname',
      code: "UnknownHostException",
    }

    it("takes home's answer over another network as home's own, the body sent as the plugin would", async () => {
      plugin.request.mockRejectedValue(
        new Error("failed to connect from /100.88.1.2")
      )
      route.request.mockResolvedValue({
        status: 200,
        headers: { ETag: '"v2"' },
        data: '{"ok":true}',
        over: "wifi",
      })
      const answer = await homeRequest({
        method: "PUT",
        url,
        token: "t",
        body: { a: 1 },
      })
      expect(answer).toEqual({ status: 200, body: '{"ok":true}', etag: '"v2"' })
      expect(route.request).toHaveBeenCalledWith({
        method: "PUT",
        url,
        headers: {
          Authorization: "Bearer t",
          "Content-Type": "application/json",
        },
        responseType: "text",
        timeout: 10_000,
        data: '{"a":1}',
      })
    })

    it("asks again after a name not found too, and says a phone keeping the app off every network as held", async () => {
      plugin.request.mockRejectedValue(NAME)
      route.request.mockRejectedValue({ code: "HELD", message: "kept off" })
      const failed = await homeRequest({ method: "GET", url }).catch(
        (error: unknown) => error
      )
      expect(failed).toBeInstanceOf(HomeBlockedError)
      expect(failed).toMatchObject({ reason: "held" })
    })

    it("keeps the first failure when no other network reached home", async () => {
      plugin.request.mockRejectedValue(NAME)
      const failed = await homeRequest({ method: "GET", url }).catch(
        (error: unknown) => error
      )
      expect(failed).toMatchObject({ reason: "name" })
      plugin.request.mockRejectedValue(new Error("timeout"))
      await expect(homeRequest({ method: "GET", url })).rejects.toBeInstanceOf(
        HomeNoAnswerError
      )
      expect(route.request).toHaveBeenCalledTimes(2)
    })

    it("asks no other network after an answer, an untrusted certificate or a fault on the phone", async () => {
      plugin.request.mockResolvedValue({ status: 200, data: "{}", headers: {} })
      await homeRequest({ method: "GET", url })
      plugin.request.mockRejectedValue({
        message: "Trust anchor for certification path not found.",
        code: "SSLHandshakeException",
      })
      await homeRequest({ method: "GET", url }).catch(() => undefined)
      plugin.request.mockRejectedValue({ code: "UNIMPLEMENTED" })
      await homeRequest({ method: "GET", url }).catch(() => undefined)
      expect(route.request).not.toHaveBeenCalled()
    })
  })
})

/**
 * LA8 as the runtime holds it: nothing is sent but by a method a tap called,
 * once, with no retry; the credential goes only to the paired https base;
 * unpair forgets it on the phone whether or not home heard; Stop and the
 * background end a sync before its next request.
 */
import { describe, expect, it } from "vitest"

import type { HomeAnswer, HomeCall } from "@/lib/device-backend/native-http"
import type { CredentialPort, HomeLink } from "@/lib/home-link/runtime"
import { createHomeLink } from "@/lib/home-link/runtime"

const HOME = { base: "https://home.example/api/v1", host: "home.example" }

type Options = {
  record?: string | null
  lost?: boolean
  answer?: (call: HomeCall) => HomeAnswer | Promise<HomeAnswer>
  write?: CredentialPort["write"]
  clear?: CredentialPort["clear"]
  read?: CredentialPort["read"]
}

type Home = {
  link: HomeLink
  sent: Array<HomeCall>
  record: () => string | null
  hide: () => void
}

function setup(options: Options = {}): Home {
  let record = options.record ?? null
  const sent: Array<HomeCall> = []
  let hide: () => void = () => undefined
  const credential: CredentialPort = {
    read:
      options.read ??
      ((): Promise<{ record: string | null; lost: boolean }> =>
        Promise.resolve({ record, lost: options.lost ?? false })),
    write:
      options.write ??
      ((next): Promise<void> => {
        record = next
        return Promise.resolve()
      }),
    clear:
      options.clear ??
      ((): Promise<void> => {
        record = null
        return Promise.resolve()
      }),
  }
  const link = createHomeLink({
    credential,
    request: (call): Promise<HomeAnswer> => {
      sent.push(call)
      return Promise.resolve(
        options.answer?.(call) ?? { status: 200, body: "{}" }
      )
    },
    onHidden: (listener): (() => void) => {
      hide = listener
      return (): void => {
        hide = (): void => undefined
      }
    },
  })
  return {
    link,
    sent,
    record: (): string | null => record,
    hide: (): void => hide(),
  }
}

describe("the home link", () => {
  it("reads the phone's own record and sends nothing", async () => {
    const paired = setup({
      record: JSON.stringify({ base: HOME.base, token: "t" }),
    })
    await paired.link.load()
    expect(paired.link.getSnapshot().link).toEqual({
      kind: "paired",
      base: HOME.base,
      notForgotten: false,
    })
    expect(paired.sent).toEqual([])

    const lost = setup({ lost: true })
    await lost.link.load()
    expect(lost.link.getSnapshot().link).toEqual({
      kind: "unpaired",
      note: "lost",
    })

    const unreadable = setup({
      read: () => Promise.reject(new Error("keystore busy")),
    })
    await unreadable.link.load()
    expect(unreadable.link.getSnapshot().link).toEqual({
      kind: "unpaired",
      note: "unreadable",
    })
    expect(unreadable.sent).toEqual([])
  })

  it("pairs with one request carrying only the code, and keeps the token it is given", async () => {
    const home = setup({
      answer: () => ({
        status: 200,
        body: JSON.stringify({ token: "phone-token", expiresAt: 1 }),
      }),
    })
    await home.link.load()
    await home.link.pair(HOME, "K7QF2M9X")

    expect(home.sent).toEqual([
      {
        method: "POST",
        url: "https://home.example/api/v1/auth/pairing/finish",
        body: { code: "K7QF2M9X" },
      },
    ])
    expect(JSON.parse(home.record() ?? "null")).toEqual({
      base: HOME.base,
      token: "phone-token",
    })
    expect(home.link.getSnapshot().link.kind).toBe("paired")
  })

  it("says why a pairing failed, once, and keeps nothing", async () => {
    const cases: Array<[Options, string]> = [
      [{ answer: () => ({ status: 422, body: "{}" }) }, "bad-code"],
      [{ answer: () => ({ status: 429, body: "{}" }) }, "too-many"],
      [{ answer: () => ({ status: 503, body: "{}" }) }, "not-set-up"],
      [{ answer: () => ({ status: 404, body: "" }) }, "not-home"],
      [{ answer: () => ({ status: 200, body: "<html>" }) }, "other"],
      [
        {
          answer: () =>
            Promise.reject(
              new Error("couldn't", {
                cause: new Error("javax.net.ssl.SSLHandshakeException"),
              })
            ),
        },
        "untrusted",
      ],
      [{ answer: () => Promise.reject(new Error("timeout")) }, "unreachable"],
    ]
    for (const [options, failure] of cases) {
      const home = setup(options)
      await home.link.load()
      await home.link.pair(HOME, "K7QF2M9X")
      expect(home.link.getSnapshot(), failure).toMatchObject({
        link: { kind: "unpaired" },
        activity: { kind: "idle" },
        pairFailure: { failure, base: HOME.base },
      })
      expect(home.sent, failure).toHaveLength(1)
    }
  })

  it("ends the session home made when the phone cannot keep it", async () => {
    const home = setup({
      answer: () => ({ status: 200, body: '{"token":"t"}' }),
      write: () => Promise.reject(new Error("keystore")),
    })
    await home.link.load()
    await home.link.pair(HOME, "K7QF2M9X")
    expect(home.link.getSnapshot()).toMatchObject({
      link: { kind: "unpaired" },
      pairFailure: { failure: "not-kept", base: HOME.base },
    })
    expect(home.sent.map((call) => call.url)).toEqual([
      `${HOME.base}/auth/pairing/finish`,
      `${HOME.base}/auth/sign-out`,
    ])
    expect(home.sent[1]).toMatchObject({ token: "t" })
  })

  it("never pairs to an http address", async () => {
    const home = setup()
    await home.link.load()
    await home.link.pair(
      { base: "http://192.168.1.10:3000/api/v1", host: "192.168.1.10:3000" },
      "K7QF2M9X"
    )
    expect(home.sent).toEqual([])
    expect(home.link.getSnapshot().pairFailure?.failure).toBe("other")
  })

  it("unpairs with the token, and forgets it on the phone even when home can't be told", async () => {
    const told = setup({
      record: JSON.stringify({ base: HOME.base, token: "t" }),
    })
    await told.link.load()
    await told.link.unpair()
    expect(told.sent).toEqual([
      {
        method: "POST",
        url: "https://home.example/api/v1/auth/sign-out",
        token: "t",
      },
    ])
    expect(told.record()).toBeNull()
    expect(told.link.getSnapshot().link).toEqual({
      kind: "unpaired",
      note: "unpaired",
    })

    const offline = setup({
      record: JSON.stringify({ base: HOME.base, token: "t" }),
      answer: () => Promise.reject(new Error("unreachable")),
    })
    await offline.link.load()
    await offline.link.unpair()
    expect(offline.record()).toBeNull()
    expect(offline.link.getSnapshot().link).toEqual({
      kind: "unpaired",
      note: "unpaired-offline",
    })
  })

  it("stays paired, and says so, when the phone cannot forget the token", async () => {
    const home = setup({
      record: JSON.stringify({ base: HOME.base, token: "t" }),
      clear: () => Promise.reject(new Error("disk")),
    })
    await home.link.load()
    await home.link.unpair()
    expect(home.record()).not.toBeNull()
    expect(home.link.getSnapshot()).toMatchObject({
      link: { kind: "paired", base: HOME.base, notForgotten: true },
      activity: { kind: "idle" },
    })
  })

  it("remembers that home was told when the retry finds the session already gone", async () => {
    let clears = 0
    let record: string | null = JSON.stringify({ base: HOME.base, token: "t" })
    const home = setup({
      read: () => Promise.resolve({ record, lost: false }),
      // Home ends the session on the first Unpair; the retry's token is dead.
      answer: () => ({ status: clears === 0 ? 200 : 401, body: "" }),
      clear: (): Promise<void> => {
        clears += 1
        if (clears === 1) return Promise.reject(new Error("disk"))
        record = null
        return Promise.resolve()
      },
    })
    await home.link.load()
    await home.link.unpair()
    await home.link.unpair()
    expect(home.sent).toHaveLength(2)
    expect(home.link.getSnapshot().link).toEqual({
      kind: "unpaired",
      note: "unpaired",
    })
  })

  it("stops a sync before its next request, on Stop or in the background, and sends no credential", async () => {
    for (const stop of ["tap", "background"] as const) {
      const home = setup({
        record: JSON.stringify({ base: HOME.base, token: "t" }),
      })
      await home.link.load()
      const outcome = await home.link.sync(async (get) => {
        await get(`${HOME.base}/curriculum/manifest.json`)
        if (stop === "tap") home.link.stop()
        else home.hide()
        await get(`${HOME.base}/curriculum/a`)
        return "finished"
      })
      expect(outcome, stop).toEqual({ kind: "stopped" })
      expect(home.sent, stop).toEqual([
        { method: "GET", url: `${HOME.base}/curriculum/manifest.json` },
      ])
      expect(home.link.getSnapshot().activity.kind).toBe("idle")
    }
  })

  it("does one thing at a time", async () => {
    const home = setup()
    await home.link.load()
    let release: () => void = () => undefined
    const syncing = home.link.sync(
      () =>
        new Promise<string>((resolve) => {
          release = (): void => resolve("ok")
        })
    )
    await home.link.pair(HOME, "K7QF2M9X")
    expect(home.sent).toEqual([])
    release()
    await expect(syncing).resolves.toEqual({ kind: "done", value: "ok" })
  })
})

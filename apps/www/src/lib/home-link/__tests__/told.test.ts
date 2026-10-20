/**
 * Telling home its person's choices (`./told`): each once, in the order
 * made, for the pairing it was made under; a home that answers twice that
 * it keeps no choices is told nothing more; what was told stays told when
 * home stops answering, and is told again once home says it heard otherwise.
 */
import type { HomeAnswer, HomeCall } from "@some-ui/core-utils"
import { memoryStorage } from "@some-ui/vite-config/vitest/memory-storage"
import { describe, expect, it } from "vitest"

import type { ConsentLog } from "@/lib/home-link/consent-model"
import { forgetTold, readTold, tellHome, untold } from "@/lib/home-link/told"

const LOG: ConsentLog = [
  {
    seq: 1,
    at: 1,
    pairing: "p",
    kind: "kept",
    scopes: ["sessions", "shelf"],
    said: "yes",
  },
  { seq: 2, at: 2, pairing: "old", kind: "kept", scopes: ["aph"], said: null },
  { seq: 3, at: 3, pairing: "p", kind: "stopped", scopes: ["shelf"] },
]

function home(answers: Array<HomeAnswer | Error> = []): {
  send: HomeCall
  sent: Array<string>
} {
  const sent: Array<string> = []
  return {
    sent,
    send: (method, path, body): Promise<HomeAnswer> => {
      sent.push(`${method} ${path} ${body ?? ""}`)
      const answer = answers.shift() ?? { status: 200, body: "{}" }
      return answer instanceof Error
        ? Promise.reject(answer)
        : Promise.resolve(answer)
    },
  }
}

describe("telling home its person's choices", () => {
  it("tells each change under the pairing once, in the order made", async () => {
    expect(untold(LOG, "p", 0)).toEqual([
      { seq: 1, scope: "sessions", kept: true },
      { seq: 1, scope: "shelf", kept: true },
      { seq: 3, scope: "shelf", kept: false },
    ])
    const storage = memoryStorage()
    const { send, sent } = home()
    await expect(tellHome(send, "p", LOG, storage)).resolves.toEqual({
      kind: "synced",
    })
    expect(sent).toEqual([
      'PUT /sharing/sessions {"kept":true}',
      'PUT /sharing/shelf {"kept":true}',
      'PUT /sharing/shelf {"kept":false}',
    ])
    expect(readTold(storage, "p")).toBe(3)
    expect(readTold(storage, "old")).toBe(0)

    const again = home()
    await tellHome(again.send, "p", LOG, storage)
    expect(again.sent).toEqual([])
  })

  it("keeps a choice untold until all of its scopes are told", async () => {
    const storage = memoryStorage()
    const { send, sent } = home([
      { status: 200, body: "{}" },
      new Error("no answer"),
    ])
    await expect(tellHome(send, "p", LOG, storage)).rejects.toThrow("no answer")
    expect(sent).toHaveLength(2)
    expect(readTold(storage, "p")).toBe(0)
  })

  it("keeps what was told before home stopped answering", async () => {
    const storage = memoryStorage()
    const { send } = home([
      { status: 200, body: "{}" },
      { status: 200, body: "{}" },
      new Error("no answer"),
    ])
    await expect(tellHome(send, "p", LOG, storage)).rejects.toThrow("no answer")
    expect(readTold(storage, "p")).toBe(1)
  })

  it("tells a home that answers it keeps no choices twice nothing more until the app starts again", async () => {
    const storage = memoryStorage()
    const old: ConsentLog = [{ ...LOG[0], pairing: "old" }]
    for (let i = 0; i < 2; i += 1) {
      const missed = home([{ status: 404, body: "" }])
      await expect(tellHome(missed.send, "old", old, storage)).resolves.toEqual(
        { kind: "synced" }
      )
      expect(missed.sent).toHaveLength(1)
    }
    expect(readTold(storage, "old")).toBe(0)
    const again = home()
    await tellHome(again.send, "old", old, storage)
    expect(again.sent).toEqual([])
  })

  it("tells everything again once forgotten", async () => {
    const storage = memoryStorage()
    await tellHome(home().send, "p", LOG, storage)
    forgetTold(storage, "p")
    const again = home()
    await tellHome(again.send, "p", LOG, storage)
    expect(again.sent).toHaveLength(3)
  })

  it("says a 401 is home forgetting the phone, and any other answer as home's", async () => {
    await expect(
      tellHome(home([{ status: 401, body: "" }]).send, "p", LOG, null)
    ).resolves.toEqual({ kind: "forgotten" })
    await expect(
      tellHome(home([{ status: 500, body: "" }]).send, "p", LOG, null)
    ).resolves.toEqual({ kind: "failed", why: "a choice: home answered 500" })
  })
})

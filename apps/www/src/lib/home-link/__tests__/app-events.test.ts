/**
 * @vitest-environment jsdom
 *
 * The app events' way home (CK2): each waiting event one PUT, oldest
 * first; one home holds exactly as sent leaves the phone, and nothing else
 * does.
 */
import type { HomeAnswer, HomeCall } from "@some-ui/core-utils"
import { isRecord } from "@some-ui/core-utils"
import { afterEach, describe, expect, it } from "vitest"

import type { AppEvent } from "@/lib/app-events"
import {
  appEventsWaiting,
  keepAppEvent,
  letGoHeldAppEvents,
} from "@/lib/app-events"
import { exchangeAppEvents } from "@/lib/home-link/app-events-send"
import { HomeUnansweredError } from "@/lib/home-link/shelf"

const event = (id: string, at: string): AppEvent => ({
  family: "outcome",
  id,
  at,
  build: null,
  process: "phone-recording",
  screen: "jobs.notes",
  ending: "kept",
  went: "worked",
  readyMs: 300,
  durationMs: 4_000,
  peak: 0.4,
})

/** The waiting event `id` names: what a send carried. */
function waitingById(id: string): AppEvent {
  const found = appEventsWaiting().find((e) => e.id === id)
  if (found === undefined) throw new Error(`${id} is not waiting`)
  return found
}

/** Home as `answer` says, recording each path put, in order. */
function home(answer: (event: AppEvent) => HomeAnswer | Error): {
  send: HomeCall
  puts: Array<string>
} {
  const puts: Array<string> = []
  const send: HomeCall = (method, path, body) => {
    expect(method).toBe("PUT")
    puts.push(path)
    const sent: unknown = JSON.parse(String(body))
    if (!isRecord(sent) || typeof sent.id !== "string") {
      return Promise.reject(new TypeError("not an event"))
    }
    const answered = answer(waitingById(sent.id))
    return answered instanceof Error
      ? Promise.reject(answered)
      : Promise.resolve(answered)
  }
  return { send, puts }
}

const holds = (sent: AppEvent): HomeAnswer => ({
  status: 200,
  body: JSON.stringify({ change: "added", event: sent }),
})

const ids = (): Array<string> => appEventsWaiting().map((e) => e.id)

afterEach(() => {
  letGoHeldAppEvents(new Set(ids()))
})

describe("sending the app events home (TE2)", () => {
  it("sends each oldest first, and lets go of each home holds as sent", async () => {
    keepAppEvent(event("e1", "2026-11-03T09:00:00.000Z"))
    keepAppEvent(event("e2", "2026-11-03T09:01:00.000Z"))
    const { send, puts } = home(holds)
    await expect(exchangeAppEvents(send)).resolves.toEqual({ kind: "synced" })
    expect(puts).toEqual(["/app-events/e1", "/app-events/e2"])
    expect(ids()).toEqual([])
  })

  it("keeps one home refused or holds otherwise, and offers a refused one no more this page load", async () => {
    keepAppEvent(event("refused", "2026-11-03T09:00:00.000Z"))
    keepAppEvent(event("differs", "2026-11-03T09:01:00.000Z"))
    keepAppEvent(event("held", "2026-11-03T09:02:00.000Z"))
    const first = home((sent) =>
      sent.id === "refused"
        ? { status: 422, body: "{}" }
        : sent.id === "differs"
          ? holds({ ...sent, went: "failed" })
          : holds(sent)
    )
    await expect(exchangeAppEvents(first.send)).resolves.toEqual({
      kind: "failed",
      why: "refused",
    })
    expect(ids()).toEqual(["differs", "refused"])
    const again = home(holds)
    await expect(exchangeAppEvents(again.send)).resolves.toEqual({
      kind: "synced",
    })
    expect(again.puts).toEqual(["/app-events/differs"])
    expect(ids()).toEqual(["refused"])
  })

  it("says home forgot this phone, and keeps everything", async () => {
    keepAppEvent(event("e1", "2026-11-03T09:00:00.000Z"))
    const { send } = home(() => ({ status: 401, body: "" }))
    await expect(exchangeAppEvents(send)).resolves.toEqual({
      kind: "forgotten",
    })
    expect(ids()).toEqual(["e1"])
  })

  it("stops at the first send home does not answer, keeping what home held before it gone", async () => {
    keepAppEvent(event("e1", "2026-11-03T09:00:00.000Z"))
    keepAppEvent(event("e2", "2026-11-03T09:01:00.000Z"))
    const { send, puts } = home((sent) =>
      sent.id === "e1" ? holds(sent) : { status: 429, body: "" }
    )
    await expect(exchangeAppEvents(send)).rejects.toBeInstanceOf(
      HomeUnansweredError
    )
    expect(puts).toEqual(["/app-events/e1", "/app-events/e2"])
    expect(ids()).toEqual(["e2"])
  })

  it("lets go of what home held even when a fault on this phone ends the run", async () => {
    keepAppEvent(event("e1", "2026-11-03T09:00:00.000Z"))
    keepAppEvent(event("e2", "2026-11-03T09:01:00.000Z"))
    const { send } = home((sent) =>
      sent.id === "e1" ? holds(sent) : new TypeError("a fault here")
    )
    await expect(exchangeAppEvents(send)).rejects.toBeInstanceOf(TypeError)
    expect(ids()).toEqual(["e2"])
  })
})

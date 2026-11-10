import { REPLACED } from "@mailbox/core"
import { admit, ringAll, type Listener, type Sockets } from "@mailbox/listeners"
import { describe, expect, it } from "vitest"

/** A socket that records what it was sent and how it was closed. */
type FakeSocket = {
  readonly sent: Array<string>
  closed: { code: number; reason: string } | null
  readonly socket: Listener
}

function fakeSocket({ failing = false } = {}): FakeSocket {
  const fake: FakeSocket = {
    sent: [],
    closed: null,
    socket: {
      send: (message: string): void => {
        if (failing) throw new Error("closing")
        fake.sent.push(message)
      },
      close: (code: number, reason: string): void => {
        if (failing) throw new Error("closing")
        fake.closed = { code, reason }
      },
    },
  }
  return fake
}

function room(): Sockets<Listener> & { readonly open: Array<Listener> } {
  const open: Array<Listener> = []
  return {
    open,
    getWebSockets: () => [...open],
    acceptWebSocket: (ws): void => {
      open.push(ws)
    },
  }
}

describe("the bell's listeners", () => {
  it("a new listener closes the one before: one at a time", () => {
    const sockets = room()
    const first = fakeSocket()
    const second = fakeSocket()
    admit(sockets, first.socket)
    expect(first.closed).toBeNull()
    admit(sockets, second.socket)
    expect(first.closed).toEqual({ code: REPLACED, reason: "replaced" })
    expect(second.closed).toBeNull()
  })

  it("a listener already closing does not stop the next being taken", () => {
    const sockets = room()
    admit(sockets, fakeSocket({ failing: true }).socket)
    const next = fakeSocket()
    admit(sockets, next.socket)
    expect(sockets.open.at(-1)).toBe(next.socket)
  })

  it("rings every listener with the folder only (MB6)", () => {
    const sockets = room()
    const listener = fakeSocket()
    sockets.open.push(listener.socket)
    expect(ringAll(sockets, "brief")).toBe(1)
    expect(listener.sent).toEqual(['{"ring":"brief"}'])
  })

  it("a ring with no listener is dropped", () => {
    expect(ringAll(room(), "brief")).toBe(0)
  })

  it("a folder no ring may name reaches no one", () => {
    const sockets = room()
    const listener = fakeSocket()
    sockets.open.push(listener.socket)
    expect(ringAll(sockets, "index")).toBe(0)
    expect(listener.sent).toEqual([])
  })

  it("a listener that fails as the ring goes out is skipped", () => {
    const sockets = room()
    const gone = fakeSocket({ failing: true })
    const listener = fakeSocket()
    sockets.open.push(gone.socket, listener.socket)
    expect(ringAll(sockets, "scene")).toBe(1)
    expect(listener.sent).toEqual(['{"ring":"scene"}'])
  })
})

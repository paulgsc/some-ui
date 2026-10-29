import type { HomeAnswer, HomeCall } from "@some-ui/core-utils"
import { isRecord } from "@some-ui/core-utils"
import type { HomeEvent, HomeSession } from "@some-ui/leetype"

export function session(id: string): HomeSession {
  const at = "2026-10-24T20:00:00.000Z"
  const file = "t1-01-one-node.json"
  const events: Array<HomeEvent> = [
    {
      id: `${id}-1`,
      at,
      session: id,
      type: "started",
      file,
      form: "full",
      declaredMinutes: 10,
    },
    {
      id: `${id}-2`,
      at,
      session: id,
      type: "spoken",
      file,
      screen: "t1",
      answer: { as: "recorded", seconds: 41.5, strong: true },
    },
  ]
  return { session: id, events }
}

type Call = [method: string, path: string, body: string | undefined]

/**
 * A home that answers each PUT with `put` (200 `added` by default) and holds
 * what it took, reading it back with its keys in another order; `back`
 * overrides a read-back's answer.
 */
export function home(
  put: Array<HomeAnswer | Error> = [],
  back: Array<HomeAnswer> = []
): { send: HomeCall; calls: Array<Call> } {
  const calls: Array<Call> = []
  const held = new Map<string, Array<Record<string, unknown>>>()
  return {
    calls,
    send: (method, path, sent): Promise<HomeAnswer> => {
      const body = typeof sent === "string" ? sent : undefined
      calls.push([method, path, body])
      const session = decodeURIComponent(path.split("/")[3] ?? "")
      if (method === "GET") {
        const reversed = (held.get(session) ?? []).map((event) =>
          Object.fromEntries(Object.entries(event).reverse())
        )
        return Promise.resolve(
          back.shift() ?? {
            status: 200,
            body: JSON.stringify({ session, events: reversed }),
          }
        )
      }
      const answer = put.shift() ?? {
        status: 200,
        body: '{"change":"added"}',
      }
      if (answer instanceof Error) return Promise.reject(answer)
      const event: unknown = JSON.parse(body ?? "")
      if (answer.status === 200 && isRecord(event)) {
        held.set(session, [...(held.get(session) ?? []), event])
      }
      return Promise.resolve(answer)
    },
  }
}

import type { HomeAnswer, HomeCall } from "@some-ui/core-utils"

/**
 * A home that keeps what it is sent, as `file_host` answers `/sessions`: a
 * create under the id it names and dated by the `createdAt` it sends
 * (paulgsc/server#630), a patch, and a read of either.
 */
export function keepingHome(): HomeCall {
  const held = new Map<string, Record<string, unknown>>()
  const answer = (status: number, body: unknown): Promise<HomeAnswer> =>
    Promise.resolve({ status, body: JSON.stringify(body) })
  return (method, path, body) => {
    const sent: unknown = typeof body === "string" ? JSON.parse(body) : {}
    const fields = typeof sent === "object" && sent !== null ? sent : {}
    if (method === "POST" && path === "/sessions") {
      const created: Record<string, unknown> = {
        createdAt: "2026-11-01T00:00:00.000Z",
        ...fields,
        status: "draft",
        origin: "user",
        totalDurationMs: 0,
        updatedAt: "2026-11-01T00:00:00.000Z",
      }
      held.set(String(created.id), created)
      return answer(200, created)
    }
    const there = held.get(decodeURIComponent(path.replace("/sessions/", "")))
    if (there === undefined) return answer(404, { error: "not_found" })
    if (method === "PATCH") Object.assign(there, fields)
    return answer(200, there)
  }
}

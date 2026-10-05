import type { SessionRecord } from "@/lib/tenant"

/** A minimal stored session (an empty basic draft), overridable per field. */
export function sessionRecord(
  overrides: Partial<SessionRecord> = {}
): SessionRecord {
  return {
    id: "session-1",
    name: "Vocabulary warm-up",
    status: "draft",
    activities: [],
    scenes: [],
    layoutMode: "basic",
    totalDurationMs: 0,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  }
}

/** `fetch` stubbed to answer every call with `body` as JSON, status 200. */
export function jsonFetch(body: unknown): typeof fetch {
  return () =>
    Promise.resolve(new Response(JSON.stringify(body), { status: 200 }))
}

/** `fetch` stubbed to never settle. */
export function hangingFetch(): typeof fetch {
  return () => new Promise<Response>(() => {})
}

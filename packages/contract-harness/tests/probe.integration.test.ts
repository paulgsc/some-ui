/**
 * End-to-end exercise of the runner against a real HTTP server.
 *
 * The server here is a stub, but the transport is not: these go over a socket,
 * through `fetch`, and back. The point is to prove each detector fires on a
 * concrete divergence, because a drift detector nobody has watched fail is just
 * a green light with extra steps.
 *
 * Every case is a scenario that has actually happened to somebody: a field
 * renamed on the server, a type widened, a route moved, a field the client
 * still believes in that nothing sends any more.
 */

import { createServer, type Server } from "node:http"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { z } from "zod"

import { defineContract } from "../src/contract"
import { probeContract } from "../src/probe"

/** Routes the stub answers, keyed by `METHOD path`. */
const ROUTES: Record<
  string,
  { status: number; body: string; contentType?: string }
> = {
  "GET /api/v1/mood_events": {
    status: 200,
    body: JSON.stringify([
      {
        id: 1,
        index: 0,
        week: 3,
        label: "l",
        description: "d",
        team: "t",
        category: "c",
        delta: -2,
        mood: 4,
      },
    ]),
  },
  "GET /api/v1/grown": {
    status: 200,
    body: JSON.stringify({ id: 1, added_later: "surprise" }),
  },
  "GET /api/v1/retyped": {
    status: 200,
    body: JSON.stringify({ id: "123", prompt: "p" }),
  },
  "GET /api/v1/renamed_field": {
    status: 200,
    body: JSON.stringify({ tabId: 7 }),
  },
  "GET /api/v1/not_json": {
    status: 200,
    body: "<html>nope</html>",
    contentType: "text/html",
  },
  "GET /api/v1/empty": { status: 200, body: "[]" },
  "GET /api/v1/tabs/42": {
    status: 200,
    body: JSON.stringify({ tab_id: 42, url: "u" }),
  },
}

let server: Server
let baseUrl: string

beforeAll(async () => {
  server = createServer((req, res) => {
    const key = `${req.method ?? "GET"} ${req.url ?? ""}`
    const route = ROUTES[key]
    if (route === undefined) {
      res.writeHead(404, { "content-type": "application/json" })
      res.end(JSON.stringify({ error: "not found" }))
      return
    }
    res.writeHead(route.status, {
      "content-type": route.contentType ?? "application/json",
    })
    res.end(route.body)
  })

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve)
  })
  const address = server.address()
  if (address === null || typeof address === "string") {
    throw new Error("stub server did not bind a TCP port")
  }
  baseUrl = `http://127.0.0.1:${address.port}`
})

afterAll(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()))
  })
})

const MoodEventSchema = z.object({
  id: z.number(),
  index: z.number(),
  week: z.number(),
  label: z.string(),
  description: z.string(),
  team: z.string(),
  category: z.string(),
  delta: z.number(),
  mood: z.number(),
  time: z.string().optional(),
})

const base = { module: "test", summary: "s" } as const

describe("probeContract against a live server", () => {
  it("warns on the real MoodEvent phantom field, and does not fail", async () => {
    const outcome = await probeContract(
      defineContract({
        ...base,
        id: "mood_events.list",
        method: "GET",
        path: "/mood_events",
        expect: { status: 200, schema: z.array(MoodEventSchema) },
      }),
      { baseUrl }
    )

    expect(outcome.httpStatus).toBe(200)
    expect(outcome.status).toBe("warned")
    expect(outcome.findings.map((f) => f.code)).toContain("phantom-field")
    expect(outcome.conformance?.valid).toBe(true)
    expect(outcome.conformance?.phantomFields[0]?.path).toBe("[].time")
  })

  it("warns when the server grew a field the contract does not declare", async () => {
    const outcome = await probeContract(
      defineContract({
        ...base,
        id: "grown",
        method: "GET",
        path: "/grown",
        expect: { status: 200, schema: z.object({ id: z.number() }) },
      }),
      { baseUrl }
    )

    expect(outcome.status).toBe("warned")
    const finding = outcome.findings.find((f) => f.code === "unknown-field")
    expect(finding?.detail).toContain("added_later")
  })

  it("fails on an undeclared field when the contract opts into strictness", async () => {
    const outcome = await probeContract(
      defineContract({
        ...base,
        id: "grown.strict",
        method: "GET",
        path: "/grown",
        expect: {
          status: 200,
          schema: z.object({ id: z.number() }),
          unknownFields: "reject",
        },
      }),
      { baseUrl }
    )

    expect(outcome.status).toBe("failed")
  })

  it("fails when a field changes type — the case unit tests on both sides miss", async () => {
    const outcome = await probeContract(
      defineContract({
        ...base,
        id: "retyped",
        method: "GET",
        path: "/retyped",
        expect: {
          status: 200,
          schema: z.object({ id: z.number(), prompt: z.string() }),
        },
      }),
      { baseUrl }
    )

    expect(outcome.status).toBe("failed")
    expect(outcome.findings.map((f) => f.code)).toContain("schema-violation")
  })

  it("shows a renamed field as a violation and an unknown key together", async () => {
    const outcome = await probeContract(
      defineContract({
        ...base,
        id: "renamed",
        method: "GET",
        path: "/renamed_field",
        expect: { status: 200, schema: z.object({ tab_id: z.number() }) },
      }),
      { baseUrl }
    )

    expect(outcome.status).toBe("failed")
    const codes = outcome.findings.map((f) => f.code)
    expect(codes).toContain("schema-violation")
    expect(codes).toContain("unknown-field")
  })

  it("fails when the route is gone", async () => {
    const outcome = await probeContract(
      defineContract({
        ...base,
        id: "moved",
        method: "GET",
        path: "/route_that_moved",
        expect: { status: 200, schema: z.object({}) },
      }),
      { baseUrl }
    )

    expect(outcome.status).toBe("failed")
    expect(outcome.findings[0]?.code).toBe("status-mismatch")
    expect(outcome.findings[0]?.message).toContain("404")
  })

  it("fails when a JSON contract gets a non-JSON body", async () => {
    const outcome = await probeContract(
      defineContract({
        ...base,
        id: "not_json",
        method: "GET",
        path: "/not_json",
        expect: { status: 200, schema: z.object({}) },
      }),
      { baseUrl }
    )

    expect(outcome.status).toBe("failed")
    expect(outcome.findings.map((f) => f.code)).toContain("non-json-body")
  })

  it("says an empty collection proved nothing rather than reporting it clean", async () => {
    const outcome = await probeContract(
      defineContract({
        ...base,
        id: "empty",
        method: "GET",
        path: "/empty",
        expect: {
          status: 200,
          schema: z.array(z.object({ time: z.string().optional() })),
        },
      }),
      { baseUrl }
    )

    expect(outcome.findings.map((f) => f.code)).toContain("no-samples")
  })

  it("binds path parameters and reaches the parameterised route", async () => {
    const outcome = await probeContract(
      defineContract({
        ...base,
        id: "tabs.get",
        method: "GET",
        path: "/tabs/:tab_id",
        request: { path: { tab_id: 42 } },
        expect: {
          status: 200,
          schema: z.object({ tab_id: z.number(), url: z.string() }),
        },
      }),
      { baseUrl }
    )

    expect(outcome.path).toBe("/api/v1/tabs/42")
    expect(outcome.status).toBe("passed")
  })

  it("refuses to send a request with an unbound path parameter", async () => {
    const outcome = await probeContract(
      defineContract({
        ...base,
        id: "tabs.unbound",
        method: "GET",
        path: "/tabs/:tab_id",
        expect: { status: 200, schema: z.object({}) },
      }),
      { baseUrl }
    )

    expect(outcome.status).toBe("failed")
    expect(outcome.findings[0]?.code).toBe("unbound-path-param")
    // Never left the process, so there is no status to report.
    expect(outcome.httpStatus).toBeUndefined()
  })

  it("reports an unreachable server as a transport error, not a contract failure", async () => {
    const outcome = await probeContract(
      defineContract({
        ...base,
        id: "offline",
        method: "GET",
        path: "/mood_events",
        expect: { status: 200, schema: z.object({}) },
      }),
      // Port 1 is reserved and nothing listens there.
      { baseUrl: "http://127.0.0.1:1", timeoutMs: 2000 }
    )

    expect(outcome.status).toBe("errored")
    expect(outcome.findings[0]?.code).toBe("transport-error")
  })

  it("does not check a success schema against a 404 body", async () => {
    const outcome = await probeContract(
      defineContract({
        ...base,
        id: "tolerant",
        method: "GET",
        path: "/tabs/:tab_id",
        request: { path: { tab_id: 999 } },
        expect: {
          status: [200, 404],
          schemaFor: 200,
          schema: z.object({ tab_id: z.number() }),
        },
      }),
      { baseUrl }
    )

    expect(outcome.httpStatus).toBe(404)
    expect(outcome.findings.map((f) => f.code)).not.toContain(
      "schema-violation"
    )
    expect(outcome.findings.map((f) => f.code)).toContain(
      "schema-not-applicable"
    )
  })

  it("skips a contract that declares a skip reason", async () => {
    const outcome = await probeContract(
      defineContract({
        ...base,
        id: "skipped",
        method: "GET",
        path: "/mood_events",
        skip: "needs seeded data",
        expect: { status: 200 },
      }),
      { baseUrl }
    )

    expect(outcome.status).toBe("skipped")
  })
})

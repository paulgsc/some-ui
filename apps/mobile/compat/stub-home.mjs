#!/usr/bin/env node
// A stand-in home for android-compat.yml's storm scenario (COMPAT2): it
// answers the routes the app reads on a pull with sample data, counts every
// request it gets, and can be told to answer 429 with Retry-After.
//
//   node apps/mobile/compat/stub-home.mjs [--port 8787] [--control 8788]
//     [--routes apps/mobile/compat/stub-routes.json] [--cert c.pem --key k.pem]
//
// With --cert and --key, home is https, as a paired phone requires: the
// certificate is the run's own, from a CA trust-ca.sh puts in the
// emulator's system store (the app's network config stays as shipped).
//
// Two listeners, so the app can never reach the controls:
// - :port, on every interface, is home. The emulator reaches it at
//   https://10.0.2.2:<port>. Each request is logged with its time and answered
//   from the routes file (method and path, query ignored); anything else is a
//   200 `{}`. While busy, every request is answered 429 with `Retry-After`.
// - :control, on 127.0.0.1 only, is the scenario's:
//     GET  /counts         every request since the last reset, as JSON
//     GET  /all            every request since the stub started
//     POST /reset          forget them
//     POST /busy?seconds=N answer 429 + Retry-After: N until /calm
//     POST /calm           answer normally again
//
// Sample data only: the routes file is fixed fixtures, and nothing here
// talks to the owner's home or holds anything of theirs.
import { readFileSync } from "node:fs"
import { createServer } from "node:http"
import { createServer as createTlsServer } from "node:https"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { parseArgs } from "node:util"

const here = dirname(fileURLToPath(import.meta.url))
const { values } = parseArgs({
  options: {
    port: { type: "string", default: "8787" },
    control: { type: "string", default: "8788" },
    routes: { type: "string", default: join(here, "stub-routes.json") },
    cert: { type: "string" },
    key: { type: "string" },
  },
})

/** `"GET /api/v1/..."` -> `{ status, body }`. */
const routes = JSON.parse(readFileSync(values.routes, "utf8")).routes

/** A route key's path as a pattern: each `:name` segment matches one. */
const patterns = Object.keys(routes).map((key) => ({
  key,
  match: new RegExp(
    `^${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/:[a-z]+/gi, "[^/]+")}$`
  ),
}))
const routeOf = (key) =>
  routes[key] ?? routes[patterns.find((p) => p.match.test(key))?.key]
const FALLBACK = { status: 200, body: {} }
const requests = []
// Never reset: the budget is checked over the whole run (check-budget.mjs).
const everything = []
let busySeconds = 0

const tls =
  values.cert && values.key
    ? { cert: readFileSync(values.cert), key: readFileSync(values.key) }
    : null

const answerHome = (req, res) => {
  const path = new URL(req.url ?? "/", "http://stub").pathname
  const key = `${req.method} ${path}`
  // A lane that cannot parse the unlisted 200 `{}` ends failed, which is
  // fine for counting (HERD1's advice).
  const answer = busySeconds > 0 ? null : (routeOf(key) ?? FALLBACK)
  const status = busySeconds > 0 ? 429 : (answer.status ?? 200)
  const entry = {
    at: Date.now(),
    key,
    status,
    ...(busySeconds > 0 ? { retryAfter: busySeconds } : {}),
  }
  requests.push(entry)
  everything.push(entry)
  // Read the body: an `echo` route answers `{ [echo]: <the body> }`, as home
  // answers a PUT it now holds.
  const chunks = []
  req.on("data", (chunk) => chunks.push(chunk))
  req.on("end", () => {
    if (busySeconds > 0) {
      res.writeHead(429, {
        "Retry-After": String(busySeconds),
        "Content-Type": "application/json",
      })
      res.end(JSON.stringify({ error: "busy" }))
      return
    }
    let sent = null
    try {
      sent = JSON.parse(Buffer.concat(chunks).toString("utf8"))
    } catch {
      // Ignored: a body that is not JSON is echoed as null; nothing reads it.
    }
    const body = JSON.stringify(
      answer.echo ? { [answer.echo]: sent } : (answer.body ?? null)
    )
    res.writeHead(status, {
      "Content-Type": "application/json",
      ETag: `"${body.length}"`,
    })
    res.end(body)
  })
}
const home = tls ? createTlsServer(tls, answerHome) : createServer(answerHome)

const control = createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://control")
  const reply = (value) => {
    res.writeHead(200, { "Content-Type": "application/json" })
    res.end(JSON.stringify(value))
  }
  if (req.method === "GET" && url.pathname === "/counts") {
    const byRoute = {}
    for (const r of requests) byRoute[r.key] = (byRoute[r.key] ?? 0) + 1
    reply({ total: requests.length, byRoute, requests })
  } else if (req.method === "GET" && url.pathname === "/all") {
    reply({ requests: everything })
  } else if (req.method === "POST" && url.pathname === "/reset") {
    requests.length = 0
    reply({ ok: true })
  } else if (req.method === "POST" && url.pathname === "/busy") {
    busySeconds = Math.max(1, Number(url.searchParams.get("seconds") ?? "30"))
    reply({ busySeconds })
  } else if (req.method === "POST" && url.pathname === "/calm") {
    busySeconds = 0
    reply({ busySeconds })
  } else {
    res.writeHead(404)
    res.end()
  }
})

home.listen(Number(values.port), "0.0.0.0")
control.listen(Number(values.control), "127.0.0.1")
process.stdout.write(
  `stub home (${tls ? "https" : "http"}) on :${values.port}, controls on 127.0.0.1:${values.control}\n`
)

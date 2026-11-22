#!/usr/bin/env node
// A stand-in home for android-compat.yml's storm scenario (COMPAT2): it
// answers the routes the app reads on a pull with sample data, counts every
// request it gets, and can be told to answer 429 with Retry-After.
//
//   node apps/mobile/compat/stub-home.mjs [--port 8787] [--control 8788]
//     [--routes apps/mobile/compat/stub-routes.json]... [--cert c.pem --key k.pem]
//
// --routes may be given more than once: each file's routes are laid over the
// ones before, so a story sample (apps/www/tests/walk, WALK2) answers its own
// routes and the base file answers the rest.
//
// With --cert and --key, home is https, as a paired phone requires: the
// certificate is the run's own, from a CA trust-ca.sh puts in the
// emulator's system store (the app's network config stays as shipped).
//
// Two listeners, so the app can never reach the controls:
// - :port, on every interface, is home. The emulator reaches it at
//   https://10.0.2.2:<port>. Each request is logged with its time and answered
//   from the routes file (method and path, query ignored); anything else is a
//   200 `{}`. While busy, every request under /api/v1/ is answered 429 with
//   `Retry-After`: home's limiter covers its versioned routes only, so
//   /compat is answered as usual. While slow, every answer waits.
// - :control, on 127.0.0.1 only, is the scenario's:
//     GET  /counts         every request since the last reset, as JSON
//     GET  /all            every request since the stub started
//     POST /reset          forget them
//     POST /busy?seconds=N answer 429 + Retry-After: N until /calm
//     POST /slow?ms=N      hold every answer N ms until /calm, so a pull is
//                          still under way when the next one starts
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
    routes: {
      type: "string",
      multiple: true,
      default: [join(here, "stub-routes.json")],
    },
    cert: { type: "string" },
    key: { type: "string" },
  },
})

/** `"GET /api/v1/..."` -> `{ status, body }`, each file laid over the ones before. */
const routes = Object.assign(
  {},
  ...values.routes.map((file) => JSON.parse(readFileSync(file, "utf8")).routes)
)

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
let slowMs = 0
/** The longest /slow may hold an answer. */
const MAX_SLOW_MS = 30_000
/** What home's limiter covers (file_host's versioned modules). */
const LIMITED = "/api/v1/"

const tls =
  values.cert && values.key
    ? { cert: readFileSync(values.cert), key: readFileSync(values.key) }
    : null

const answerHome = (req, res) => {
  const path = new URL(req.url ?? "/", "http://stub").pathname
  const key = `${req.method} ${path}`
  // The wait as it stood when the request came, which its answer carries.
  const wait = busySeconds
  const busy = wait > 0 && path.startsWith(LIMITED)
  // A lane that cannot parse the unlisted 200 `{}` ends failed, which is
  // fine for counting (HERD1's advice).
  const answer = busy ? null : (routeOf(key) ?? FALLBACK)
  const status = busy ? 429 : (answer.status ?? 200)
  const entry = {
    at: Date.now(),
    key,
    status,
    ...(busy ? { retryAfter: wait } : {}),
  }
  requests.push(entry)
  everything.push(entry)
  // Read the body: an `echo` route answers `{ [echo]: <the body> }`, as home
  // answers a PUT it now holds.
  const chunks = []
  req.on("data", (chunk) => chunks.push(chunk))
  const send = () => {
    if (busy) {
      res.writeHead(429, {
        "Retry-After": String(wait),
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
  }
  req.on("end", () => setTimeout(send, slowMs))
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
    busySeconds = Math.max(1, Number(url.searchParams.get("seconds")) || 30)
    reply({ busySeconds })
  } else if (req.method === "POST" && url.pathname === "/slow") {
    // Bounded (clamped, never dropped), so no caller can hold an answer
    // longer than a phase lasts.
    const ms = Number(url.searchParams.get("ms")) || 0
    slowMs = ms > MAX_SLOW_MS ? MAX_SLOW_MS : ms > 0 ? ms : 0
    reply({ slowMs })
  } else if (req.method === "POST" && url.pathname === "/calm") {
    busySeconds = 0
    slowMs = 0
    reply({ busySeconds, slowMs })
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

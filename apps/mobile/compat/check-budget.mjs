#!/usr/bin/env node
// Checks every request the stand-in home heard in a storm run against
// HERD1's budget (budget.json), for android-compat.yml (COMPAT2).
//
//   node apps/mobile/compat/check-budget.mjs <all.json> <budget.json>
//
// <all.json> is the stub's GET /all: { requests: [{ at, key, status,
// retryAfter? }] }. Every request counts, /compat too: home's limiter
// answers 429 only under /api/v1/, but HERD1's pace takes a turn for
// everything the phone sends home (look and the session check included).
// Prints one line per breach and exits non-zero on any:
//
// - rate: in any window of T ms, more than burst + ceil(T / sustainedMs)
//   requests (checked for every pair of requests, so every window that
//   starts and ends on one);
// - busy: no 429 in the whole run, or a request, other than an exempt one,
//   inside a 429's Retry-After;
// - paced: the nth request after a 429 (from 0, other than an exempt one,
//   up to pacedForMs after its Retry-After) sent sooner than n + 1 paces
//   (sustainedMs, less toleranceMs) after the 429: HERD1's own rule
//   (expectPaced in apps/www/src/lib/home-link/__tests__/herd.test.ts),
//   under which the Retry-After itself can pay for the first few.
// Both run from every 429, overlapping ones included. A request within
// graceMs of a 429 (the 429 still on its way to the phone) is excused from
// both but still counted in n.
//
// CS1: the storm check fails the app only on what HERD1 and HERD2 promise.
// Family: a moment while a pull's lanes' run is under way, or after it
// has ended (the joined phase: a pull, then the app coming back, home slowed
// by /slow; at most two pulls' reads, no read
// asked more than twice, no write sent twice); a route home's limiter covers
// or not (every request counts); the nth request after a 429 at any spacing,
// overlapping 429s included; the wait home sends (1 s, as file_host). Proof:
// these rules, each matching HERD1's herd.test.ts (expectPaced) or HERD2's
// refreshers.test.ts, and the joined phase in storm.sh.
import { readFileSync } from "node:fs"

const [allFile, budgetFile] = process.argv.slice(2)
if (!allFile || !budgetFile) {
  throw new Error("usage: check-budget.mjs <all.json> <budget.json>")
}
const { requests } = JSON.parse(readFileSync(allFile, "utf8"))
const budget = JSON.parse(readFileSync(budgetFile, "utf8"))
// A missing number would make every comparison false and pass in silence.
const numbers = [
  budget.burst,
  budget.sustainedMs,
  budget.afterBusy?.graceMs,
  budget.afterBusy?.pacedForMs,
  budget.afterBusy?.toleranceMs,
]
if (
  !Array.isArray(requests) ||
  numbers.some((n) => typeof n !== "number") ||
  requests.some((r) => r.status === 429 && typeof r.retryAfter !== "number")
) {
  throw new Error("check-budget.mjs: no request log or budget to check")
}
const exempt = new Set(budget.exempt ?? [])
const sent = [...requests].sort((a, b) => a.at - b.at)
const breaches = []

// Rate: the worst window per starting request.
let worst = null
for (let i = 0; i < sent.length; i += 1) {
  for (let j = i; j < sent.length; j += 1) {
    const span = sent[j].at - sent[i].at
    const allowed = budget.burst + Math.ceil(span / budget.sustainedMs)
    const count = j - i + 1
    if (count > allowed && (!worst || count - allowed > worst.over)) {
      worst = { over: count - allowed, count, span, allowed }
    }
  }
}
if (worst) {
  breaches.push(
    `rate: ${worst.count} requests in ${worst.span} ms, over the ${worst.allowed} HERD1 allows (burst ${budget.burst} + 1 per ${budget.sustainedMs} ms)`
  )
}

// Busy and paced: from every 429, as expectPaced holds it. The requests
// after a 429 (other than exempt ones) are counted from 0 in order; one
// sent within graceMs of the 429 (the emulator's slowed link delays it) is
// excused but still counted. Every other one must come after the 429's
// Retry-After (busy) and no sooner than n + 1 paces after the 429 (paced).
const { toleranceMs, pacedForMs, graceMs } = budget.afterBusy
const turnedAway = sent.filter((r) => r.status === 429)
// A run in which home never said 429 checked nothing after a wait.
if (turnedAway.length === 0) {
  breaches.push("busy: home never answered 429, so no wait was checked")
}
const busyAt = []
const pacedAt = []
for (const turned of turnedAway) {
  const until = turned.at + turned.retryAfter * 1000
  const after = sent.filter(
    (r) =>
      r !== turned &&
      r.at >= turned.at &&
      r.at < until + pacedForMs &&
      !exempt.has(r.key)
  )
  after.forEach((r, n) => {
    if (r.at <= turned.at + graceMs) return
    if (r.at < until) busyAt.push({ r, turned })
    else if (r.at < turned.at + (n + 1) * budget.sustainedMs - toleranceMs) {
      pacedAt.push({ r, turned, n })
    }
  })
}
if (busyAt.length > 0) {
  const { r, turned } = busyAt[0]
  breaches.push(
    `busy: ${busyAt.length} request(s) inside a Retry-After (first ${r.key}, ${r.at - turned.at} ms after a ${turned.retryAfter} s 429)`
  )
}
if (pacedAt.length > 0) {
  const { r, turned, n } = pacedAt[0]
  breaches.push(
    `paced: ${pacedAt.length} request(s) sooner than their pace after a 429 (first ${r.key}, request ${n + 1} after it, ${r.at - turned.at} ms, under ${n + 1} paces of ${budget.sustainedMs} ms)`
  )
}

for (const line of breaches) process.stdout.write(`${line}\n`)
process.exitCode = breaches.length > 0 ? 1 : 0

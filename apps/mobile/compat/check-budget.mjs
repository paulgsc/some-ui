#!/usr/bin/env node
// Checks every request the stand-in home heard in a storm run against
// HERD1's budget (budget.json), for android-compat.yml (COMPAT2).
//
//   node apps/mobile/compat/check-budget.mjs <all.json> <budget.json>
//
// <all.json> is the stub's GET /all: { requests: [{ at, key, status,
// retryAfter? }] }. Only requests under budget.limited count: home's limiter
// covers its versioned routes (/api/v1/) and nothing else, so /compat is
// neither limited nor part of the budget. Prints one line per breach and
// exits non-zero on any:
//
// - rate: in any window of T ms, more than burst + ceil(T / sustainedMs)
//   requests (checked for every pair of requests, so every window that
//   starts and ends on one);
// - busy: a request, other than an exempt one, inside a 429's Retry-After,
//   after graceMs for the 429 to reach the phone;
// - paced: the nth request after a 429 (from 0, other than an exempt one,
//   within its Retry-After and pacedForMs after) sent sooner than n + 1
//   paces (sustainedMs, less toleranceMs) after the 429: HERD1's own
//   rule (expectPaced in apps/www/src/lib/home-link/__tests__/herd.test.ts),
//   under which the Retry-After itself can pay for the first few.
//
// CS1: the storm check fails the app only on what HERD1 and HERD2 promise.
// Family: a pull while another is under way or after it has ended (the
// joined phase, home slowed by /slow); a route home's limiter covers or
// not (budget.limited); the nth request after a 429 at any spacing. Proof:
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
  typeof budget.limited !== "string" ||
  requests.some((r) => r.status === 429 && typeof r.retryAfter !== "number")
) {
  throw new Error("check-budget.mjs: no request log or budget to check")
}
const exempt = new Set(budget.exempt ?? [])
const limited = (r) => r.key.split(" ")[1]?.startsWith(budget.limited)
const sent = requests.filter(limited).sort((a, b) => a.at - b.at)
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

// Busy and paced: from each 429 the phone was sent.
const { toleranceMs, pacedForMs, graceMs } = budget.afterBusy
// A 429 sent inside an earlier one's wait is that wait's breach, not a new
// wait of its own.
let waitEnds = -Infinity
const turnedAway = sent.filter((r) => {
  if (r.status !== 429 || r.at < waitEnds) return false
  waitEnds = r.at + r.retryAfter * 1000
  return true
})
for (const turned of turnedAway) {
  const until = turned.at + turned.retryAfter * 1000
  // A request sent before the phone heard the 429 (graceMs: the emulator's
  // slowed link delays it) is not one sent during the wait.
  const inside = sent.filter(
    (r) => r.at > turned.at + graceMs && r.at < until && !exempt.has(r.key)
  )
  if (inside.length > 0) {
    breaches.push(
      `busy: ${inside.length} request(s) inside a ${turned.retryAfter} s Retry-After (first ${inside[0].key}, ${inside[0].at - turned.at} ms after the 429)`
    )
  }
  const after = sent.filter(
    (r) =>
      r.at > turned.at + graceMs &&
      r.at < until + pacedForMs &&
      !exempt.has(r.key)
  )
  const early = after.findIndex(
    (r, n) => r.at < turned.at + (n + 1) * budget.sustainedMs - toleranceMs
  )
  if (early >= 0) {
    const r = after[early]
    breaches.push(
      `paced: request ${early + 1} after a 429 (${r.key}) came ${r.at - turned.at} ms after it, sooner than ${early + 1} paces of ${budget.sustainedMs} ms`
    )
  }
}

for (const line of breaches) process.stdout.write(`${line}\n`)
process.exitCode = breaches.length > 0 ? 1 : 0

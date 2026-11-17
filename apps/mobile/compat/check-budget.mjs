#!/usr/bin/env node
// Checks every request the stand-in home heard in a storm run against
// HERD1's budget (budget.json), for android-compat.yml (COMPAT2).
//
//   node apps/mobile/compat/check-budget.mjs <all.json> <budget.json>
//
// <all.json> is the stub's GET /all: { requests: [{ at, key, status,
// retryAfter? }] }. Prints one line per breach and exits non-zero on any:
//
// - rate: in any window of T ms, more than burst + ceil(T / sustainedMs)
//   requests (checked for every pair of requests, so every window that
//   starts and ends on one);
// - busy: a request, other than an exempt one, inside a 429's Retry-After;
// - paced: after a Retry-After ends, two requests closer than sustainedMs
//   (less toleranceMs) within pacedForMs of it.
import { readFileSync } from "node:fs"

const [allFile, budgetFile] = process.argv.slice(2)
if (!allFile || !budgetFile) {
  throw new Error("usage: check-budget.mjs <all.json> <budget.json>")
}
const { requests } = JSON.parse(readFileSync(allFile, "utf8"))
const budget = JSON.parse(readFileSync(budgetFile, "utf8"))
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

// Busy and paced: from each 429 the phone was sent.
const { toleranceMs, pacedForMs } = budget.afterBusy
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
  const inside = sent.filter(
    (r) => r.at > turned.at && r.at < until && !exempt.has(r.key)
  )
  if (inside.length > 0) {
    breaches.push(
      `busy: ${inside.length} request(s) inside a ${turned.retryAfter} s Retry-After (first ${inside[0].key}, ${inside[0].at - turned.at} ms after the 429)`
    )
  }
  const after = sent.filter(
    (r) => r.at >= until && r.at < until + pacedForMs && !exempt.has(r.key)
  )
  for (let k = 1; k < after.length; k += 1) {
    const gap = after[k].at - after[k - 1].at
    if (gap < budget.sustainedMs - toleranceMs) {
      breaches.push(
        `paced: two requests ${gap} ms apart after a Retry-After ended (${after[k - 1].key}, ${after[k].key}), under ${budget.sustainedMs} ms`
      )
      break
    }
  }
}

for (const line of breaches) process.stdout.write(`${line}\n`)
process.exitCode = breaches.length > 0 ? 1 : 0

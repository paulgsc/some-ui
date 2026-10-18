import { readFileSync } from "node:fs"
import { parseDecisions } from "@job-desk/decisions"
import type { Digest } from "@job-desk/digest"
import { parseDigest } from "@job-desk/digest"
import { digestFindings } from "@job-desk/findings"
import { fingerprint } from "@job-desk/fingerprint"
import { parseScouts } from "@job-desk/scouts"
import { describe, expect, it } from "vitest"

const SAMPLE = readFileSync(
  new URL("./sample.digest.json", import.meta.url),
  "utf8"
)

function sample(): Digest {
  const parsed = parseDigest(SAMPLE)
  if (!parsed.ok) throw new Error(parsed.problem)
  return parsed.value
}

function messages(digest: Digest): ReadonlyArray<string> {
  return digestFindings(digest).map((f) => `${f.path}: ${f.message}`)
}

describe("the sample digest", () => {
  it("parses and breaks no rule", () => {
    expect(messages(sample())).toEqual([])
  })
})

describe("parseDigest", () => {
  it("names what is wrong, by path", () => {
    const digest = sample()
    digest.picks[0]!.scores.fit = 1.4
    const parsed = parseDigest(JSON.stringify(digest))
    expect(parsed.ok).toBe(false)
    if (!parsed.ok)
      expect(parsed.problem).toMatch(/^Not a digest: picks\.0\.scores\.fit/)
  })

  it("refuses a file that isn't JSON", () => {
    expect(parseDigest("digest")).toEqual({
      ok: false,
      problem: "That file isn’t JSON.",
    })
  })

  it("takes a résumé only in a layout that accepts contact details", () => {
    const digest = sample()
    const [first, ...rest] = digest.picks
    const rail = { ...first, resume: { ...first!.resume, template: "rail" } }
    expect(
      parseDigest(JSON.stringify({ ...digest, picks: [rail, ...rest] })).ok
    ).toBe(false)
  })
})

describe("digestFindings", () => {
  it("holds each track to its daily count", () => {
    const digest = sample()
    const extra = digest.picks.filter((p) => p.track === "adjacent")[0]!
    digest.picks.push({ ...extra, id: "dup-0001" })
    expect(messages(digest)).toContain("picks: 3 adjacent picks; the most is 2")
  })

  it("finds a posting picked twice, or picked and set aside", () => {
    const digest = sample()
    digest.picks.push({ ...digest.picks[0]!, id: "avm-again" })
    digest.setAside.push({
      ...digest.setAside[0]!,
      fingerprint: digest.picks[1]!.fingerprint,
    })
    expect(messages(digest)).toEqual(
      expect.arrayContaining([
        "picks.4.fingerprint: same posting as picks.0",
        "setAside.4.fingerprint: also picked as picks.1",
      ])
    )
  })

  it("checks each fingerprint against its posting", () => {
    const digest = sample()
    digest.picks[0]!.fingerprint = "avmet|engineer|remote"
    expect(messages(digest)).toEqual([
      'picks.0.fingerprint: should be "avmet applications|software engineer|remote"',
    ])
  })

  it("never picks a customer-facing or phone role", () => {
    const digest = sample()
    digest.picks[2]!.posting.title = "Technical Support Engineer"
    digest.picks[2]!.fingerprint = fingerprint(digest.picks[2]!.posting)
    expect(messages(digest)).toEqual([
      "picks.2.posting.title: customer-facing or phone roles are never picked",
    ])
  })

  it("sets aside a stale posting", () => {
    const digest = sample()
    digest.picks[1]!.posting.postedOn = "2026-07-28"
    expect(messages(digest)).toEqual([
      "picks.1.posting.postedOn: older than 30 days on 2026-10-18",
    ])
  })

  it("asks an adjacent pick, and only one, for its family", () => {
    const digest = sample()
    digest.picks[0]!.family = "data"
    digest.picks[2]!.family = null
    expect(messages(digest)).toHaveLength(2)
  })

  it("finds a fit that claims what the pick rules out", () => {
    const digest = sample()
    digest.picks[0]!.fits[0]!.detail = "Ran it on Kubernetes."
    expect(messages(digest)).toEqual([
      'picks.0.fits.0: claims "Kubernetes", which dontClaim rules out',
    ])
  })

  it("finds a scout verdict naming a pick that isn't there", () => {
    const digest = sample()
    digest.scouts.push({
      scoutId: "sc-1234",
      verdict: "agree",
      note: "Good fit",
      pickId: "nope-123",
    })
    expect(messages(digest)).toEqual(["scouts.0.pickId: no pick nope-123"])
  })
})

describe("fingerprint", () => {
  it("ignores case, accents and punctuation", () => {
    expect(
      fingerprint({
        company: "Vissat Solutions, Inc",
        title: "Data Analyst - Jr./Mid.",
        location: "Remote",
      })
    ).toBe("vissat solutions inc|data analyst jr mid|remote")
    expect(
      fingerprint({
        company: "Café  Co.",
        title: "QA",
        location: "Berkeley, CA",
      })
    ).toBe("cafe co|qa|berkeley ca")
  })
})

describe("the files the phone shares back", () => {
  it("parses a day's decisions", () => {
    const parsed = parseDecisions(
      JSON.stringify({
        schema: "some-ui.job-decisions/1",
        day: "2026-10-18",
        digestDay: "2026-10-18",
        sharedAt: "2026-10-18T22:10:00Z",
        picks: [
          {
            pickId: "blu-7f2a",
            fingerprint: "bluesight|data analyst|remote",
            decision: "taken",
            reasons: [],
            note: "",
            voice: [],
            debrief: {
              minutes: 23,
              friction: 3,
              frictionChips: ["company-ats"],
              what: "Indeed sent me to Workday.",
              voice: ["2026-10-18_blu-7f2a_voice-1.webm"],
              result: "submitted",
            },
          },
          {
            pickId: "avm-0b77",
            fingerprint: "avmet applications|software engineer|remote",
            decision: "passed",
            reasons: ["seniority"],
            note: "Clearance for most contracts",
            voice: [],
            debrief: null,
          },
        ],
        disagreements: [],
        outcomes: [],
      })
    )
    expect(parsed.ok).toBe(true)
  })

  it("parses a scout and wants at least one", () => {
    const scout = {
      id: "sc-a1b2",
      url: "https://www.indeed.com/viewjob?jk=0123456789abcdef",
      track: "adjacent",
      family: "qa",
      title: "SDET · Second Dinner",
      why: "Game testing",
      postingText: null,
      voice: [],
      addedAt: "2026-10-18T20:00:00Z",
    }
    const file = {
      schema: "some-ui.job-scouts/1",
      sharedAt: "2026-10-18T20:05:00Z",
    }
    expect(parseScouts(JSON.stringify({ ...file, scouts: [scout] })).ok).toBe(
      true
    )
    expect(parseScouts(JSON.stringify({ ...file, scouts: [] })).ok).toBe(false)
  })
})

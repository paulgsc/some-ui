import { readFileSync } from "node:fs"
import { parseDecisions } from "@job-desk/decisions"
import type { Digest } from "@job-desk/digest"
import {
  parseDigest,
  RESUME_VARIANTS,
  SOFTWARE_VARIANTS,
  SUBMISSION_TEMPLATES,
} from "@job-desk/digest"
import { digestFindings } from "@job-desk/findings"
import { fingerprint } from "@job-desk/fingerprint"
import { parseScouts } from "@job-desk/scouts"
import { describe, expect, it } from "vitest"

const SAMPLE = readFileSync(
  new URL("../sample.digest.json", import.meta.url),
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

describe("the sample digest's postings", () => {
  // The web builds show it to anyone: it must name no posting I looked at.
  it("are made up, each linking to example.com", () => {
    for (const pick of sample().picks) {
      expect(new URL(pick.posting.applyUrl).hostname).toBe("jobs.example.com")
    }
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

  it("takes an apply link longer than home keeps a scout's", () => {
    const digest = sample()
    digest.picks[0]!.posting.applyUrl = `https://apply.example/?r=${"a".repeat(3_000)}`
    expect(parseDigest(JSON.stringify(digest)).ok).toBe(true)
  })

  it("refuses a file that isn't JSON", () => {
    expect(parseDigest("digest")).toEqual({
      ok: false,
      problem: "That file isn’t JSON.",
    })
  })

  it("refuses a software pick that names a family", () => {
    const digest = sample()
    const [first, ...rest] = digest.picks
    const named = { ...first, family: "data" }
    expect(
      parseDigest(JSON.stringify({ ...digest, picks: [named, ...rest] })).ok
    ).toBe(false)
  })
})

/** A file in `@some-ui/resume`, read as text: the lists below copy its own. */
function resumeFile(path: string): string {
  return readFileSync(
    new URL(`../../../ui/resume/${path}`, import.meta.url),
    "utf8"
  )
}

describe("the résumé lists a digest names", () => {
  it("are the compositions the résumé builds", () => {
    const [, list] = /export const variants = \[([^\]]*)\]/.exec(
      resumeFile("scripts/typst.mjs")
    )!
    const names = [...list!.matchAll(/"([^"]+)"/g)].map(([, name]) => name)
    expect(RESUME_VARIANTS).toEqual(names)
  })

  it("send a software pick only the compositions the résumé tracks as software", () => {
    const source = resumeFile("src/data/resume.typ")
    const software = [
      ...source.matchAll(/^ {2}([a-z-]+): \(\s*track: "software"/gm),
    ].map(([, name]) => name)
    expect(SOFTWARE_VARIANTS).toEqual(software)
  })

  it("are the layouts that take contact details", () => {
    const envelope: unknown = JSON.parse(resumeFile("src/pii/envelope.json"))
    expect(envelope).toMatchObject({ templates: SUBMISSION_TEMPLATES })
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
    digest.picks[0]!.fingerprint = "northwind|engineer|remote"
    expect(messages(digest)).toEqual([
      'picks.0.fingerprint: should be "northwind avionics|backend engineer|remote"',
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

  it("finds the same role picked from two places", () => {
    const digest = sample()
    const remote = digest.picks[1]!
    const posting = { ...remote.posting, location: "Oakland, CA" }
    digest.picks.push({
      ...remote,
      id: "apl-oak1",
      posting,
      fingerprint: fingerprint(posting),
    })
    expect(messages(digest)).toEqual([
      "picks.4.fingerprint: same role as picks.1, in another place",
    ])
  })

  it("finds the same role set aside from two places, or picked and set aside", () => {
    const digest = sample()
    const aside = digest.setAside[0]!
    digest.setAside.push({
      ...aside,
      fingerprint: fingerprint({ ...aside, location: "Oakland, CA" }),
    })
    const { company, title } = digest.picks[1]!.posting
    digest.setAside.push({
      company,
      title,
      why: "Seen again from Berkeley",
      fingerprint: fingerprint({ company, title, location: "Berkeley, CA" }),
    })
    expect(messages(digest)).toEqual([
      "setAside.4.fingerprint: same role as setAside.0, in another place",
      "setAside.5.fingerprint: same role as picks.1, in another place",
    ])
  })

  it("checks a set-aside fingerprint against its company and title", () => {
    const digest = sample()
    digest.setAside[0]!.title = "Frontend Engineer"
    expect(messages(digest)).toEqual([
      'setAside.0.fingerprint: should start "juniper row|frontend engineer|", from its company and title',
    ])
  })

  it("lists at most 40 set-aside postings", () => {
    const digest = sample()
    const many = Array.from({ length: 41 }, (_, n) => ({
      company: `Co ${n}`,
      title: "Engineer",
      why: "Stale",
      fingerprint: fingerprint({
        company: `Co ${n}`,
        title: "Engineer",
        location: "Remote",
      }),
    }))
    expect(parseDigest(JSON.stringify({ ...digest, setAside: many })).ok).toBe(
      false
    )
  })

  it("counts at least the postings it lists as seen", () => {
    const digest = sample()
    digest.seen = 3
    expect(messages(digest)).toEqual([
      "seen: 3 is fewer than the 8 postings picked or set aside",
    ])
  })

  it("builds at the commit the fits were checked at", () => {
    const digest = sample()
    digest.evidence.someUi = "e61af8f"
    expect(messages(digest)).toEqual([
      "picks.0.resume.ref: builds at cb503cb, but the fits were checked at e61af8f",
      "picks.1.resume.ref: builds at cb503cb, but the fits were checked at e61af8f",
      "picks.2.resume.ref: builds at cb503cb, but the fits were checked at e61af8f",
    ])
  })

  it("patches an adjacent pick with its own family's composition", () => {
    const digest = sample()
    const resume = digest.picks[3]!.resume
    if (resume.kind === "patch") resume.variant = "data"
    expect(messages(digest)).toEqual([
      "picks.3.resume.variant: a qa pick's patch is the qa composition",
    ])
  })

  it("links at most one résumé PR, and only to change a composition that exists", () => {
    const digest = sample()
    const [software, , , qa] = digest.picks
    if (qa!.resume.kind === "patch") qa!.resume.pr = 1901
    expect(messages(digest)).toEqual([])

    // Two picks may wait on one PR when both want the change it makes.
    const data = digest.picks[2]!
    const twin = structuredClone(qa!)
    twin.id = "kes-21c1"
    twin.posting.title = "SDET II"
    twin.fingerprint = fingerprint(twin.posting)
    digest.picks[2] = twin
    expect(messages(digest)).toEqual([])
    if (twin.resume.kind === "patch") twin.resume.variant = "data"
    expect(messages(digest)).toEqual([
      "picks.3.resume.pr: PR #1901 changes data, not qa",
      "picks.2.resume.variant: a qa pick's patch is the qa composition",
    ])
    digest.picks[2] = data

    software!.resume = {
      kind: "patch",
      variant: "embedded",
      template: "safe",
      fallback: "backend",
      pr: 1902,
      change: "A composition that leads with the firmware work.",
    }
    expect(messages(digest)).toEqual([
      "picks: links 2 résumé PRs; the most is 1",
      "picks.0.resume.pr: a run's PR changes an existing composition, not a new embedded",
    ])
  })

  it("sends each pick a composition of its own track", () => {
    const digest = sample()
    const [software, , data, qa] = digest.picks
    if (software!.resume.kind === "build") software!.resume.variant = "data"
    if (data!.resume.kind === "build") data!.resume.variant = "backend"
    if (qa!.resume.kind === "patch") qa!.resume.fallback = "solutions"
    expect(messages(digest)).toEqual([
      "picks.0.resume.variant: a software pick sends one of backend, platform, fullstack",
      "picks.2.resume.variant: a data pick sends the data composition",
      "picks.3.resume.fallback: a qa pick sends the qa composition",
    ])
  })

  it("links a scout to a pick only when the run agreed with it", () => {
    const digest = sample()
    digest.scouts.push({
      scoutId: "sc-1234",
      verdict: "disagree",
      note: "Senior only",
      pickId: "nor-0b77",
      rule: null,
      review: null,
    })
    expect(messages(digest)).toEqual([
      "scouts.1.pickId: a scout the run did not agree with became no pick",
    ])
  })

  it("finds a posting set aside twice", () => {
    const digest = sample()
    digest.setAside.push({ ...digest.setAside[0]! })
    expect(messages(digest)).toEqual([
      "setAside.4.fingerprint: same posting as setAside.0",
    ])
  })

  it("finds a posting dated after the digest", () => {
    const digest = sample()
    digest.picks[1]!.posting.postedOn = "2026-10-19"
    expect(messages(digest)).toEqual([
      "picks.1.posting.postedOn: after the digest's day, 2026-10-18",
    ])
  })

  it("matches what not to claim as a whole word", () => {
    const digest = sample()
    digest.picks[1]!.dontClaim.push("Java")
    digest.picks[1]!.fits[0]!.detail = "JavaScript and TypeScript services."
    expect(messages(digest)).toEqual([])
    digest.picks[1]!.fits[0]!.detail = "Services in Java."
    expect(messages(digest)).toEqual([
      'picks.1.fits.0: claims "Java", which dontClaim rules out',
    ])
  })

  it("finds a fit that claims what the pick rules out", () => {
    const digest = sample()
    digest.picks[0]!.fits[0]!.detail = "Ran it on Kubernetes."
    expect(messages(digest)).toEqual([
      'picks.0.fits.0: claims "Kubernetes", which dontClaim rules out',
    ])
  })

  it("reviews a scout it scored and didn't pick, and no other", () => {
    const digest = sample()
    const review = (
      fit: number
    ): NonNullable<Digest["scouts"][number]["review"]> => ({
      scores: { fit, odds: 0.4, fitWhy: "covers some", oddsWhy: "remote" },
      gaps: [{ kind: "learnable" as const, text: "Go" }],
      sends: { variant: "qa" as const, template: "classic" as const },
    })
    const scout = (
      verdict: "agree" | "disagree" | "not-found",
      more: { pickId?: string; rule?: string; fit?: number }
    ): Digest["scouts"][number] => ({
      scoutId: `sc-${digest.scouts.length}`,
      verdict,
      note: "Why.",
      pickId: more.pickId ?? null,
      rule: more.rule ?? null,
      review: more.fit === undefined ? null : review(more.fit),
    })
    digest.scouts.push(
      scout("agree", { fit: 0.7 }),
      scout("disagree", { fit: 0.3 }),
      scout("disagree", { rule: "phone screens" }),
      scout("not-found", {}),
      scout("agree", { pickId: "nor-0b77" })
    )
    expect(messages(digest)).toEqual([])

    digest.scouts.splice(1)
    digest.scouts.push(
      scout("agree", {}),
      scout("not-found", { fit: 0.7 }),
      scout("agree", { pickId: "nor-0b77", fit: 0.7 }),
      scout("disagree", { fit: 0.7 }),
      scout("agree", { fit: 0.4 }),
      scout("agree", { rule: "senior title" })
    )
    expect(messages(digest)).toEqual([
      "scouts.1.review: a scout the run scored and didn't pick carries its review",
      "scouts.2.review: a scout the run couldn't find has no review",
      "scouts.3.review: a scout that became a pick has no review",
      "scouts.4.verdict: fit 0.7 is an agree; the cutoff is 0.5",
      "scouts.5.verdict: fit 0.4 is a disagree; the cutoff is 0.5",
      "scouts.6.rule: a scout a set-aside rule decided is a disagree and no pick",
    ])
  })

  it("opens a digest written before scouts were reviewed", () => {
    const scout = {
      scoutId: "sc-1",
      verdict: "not-found",
      note: "Gone",
      pickId: null,
    }
    const parsed = parseDigest(JSON.stringify({ ...sample(), scouts: [scout] }))
    expect(parsed.ok && parsed.value.scouts[0]?.review).toBe(null)
  })

  it("finds a scout verdict naming a pick that isn't there", () => {
    const digest = sample()
    digest.scouts.push({
      scoutId: "sc-1234",
      verdict: "agree",
      note: "Good fit",
      pickId: "nope-123",
      rule: null,
      review: null,
    })
    expect(messages(digest)).toEqual(["scouts.1.pickId: no pick nope-123"])
  })
})

describe("fingerprint", () => {
  it("ignores case, accents and punctuation", () => {
    expect(
      fingerprint({
        company: "Cobalt Field Systems, Inc",
        title: "Data Analyst - Jr./Mid.",
        location: "Remote",
      })
    ).toBe("cobalt field systems inc|data analyst jr mid|remote")
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
            day: "2026-10-18",
            pickId: "tid-7f2a",
            fingerprint: "tidewater analytics|data analyst|remote",
            id: "4f1a2b3c-5d6e-4f70-8a9b-0c1d2e3f4a5b",
            decision: "taken",
            reasons: [],
            note: "",
            voice: [],
            debrief: {
              id: "0b3c9a52-6f1e-4d2a-9a43-8a1f0c7e2b11",
              minutes: 23,
              friction: 3,
              frictionChips: ["company-ats"],
              what: "Indeed sent me to Workday.",
              voice: ["2026-10-18_tid-7f2a_voice-1.webm"],
              result: "submitted",
            },
          },
          {
            day: "2026-10-18",
            pickId: "nor-0b77",
            fingerprint: "northwind avionics|software engineer|remote",
            id: "9e8d7c6b-5a49-4382-a1b0-c9d8e7f6a5b4",
            decision: "passed",
            reasons: ["seniority"],
            note: "Clearance for most contracts",
            voice: [],
            debrief: null,
          },
        ],
        disagreements: [],
        outcomes: [
          {
            id: "7d2e1f40-3b5a-4c8e-b1d9-2e6f8a0c4d53",
            fingerprint: "tidewater analytics|data analyst|remote",
            event: "reply",
            on: "2026-10-20",
            note: "",
          },
        ],
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

import { describe, expect, it } from "vitest"

import { buildCommand, parseBrief, resumeFile } from "@/lib/job-brief"

import raw from "./amplitude.brief.json?raw"

function edited(change: (json: Record<string, unknown>) => void): string {
  const json: Record<string, unknown> = JSON.parse(raw)
  change(json)
  return JSON.stringify(json)
}

describe("parseBrief", () => {
  it("reads the template a run copies", () => {
    const parsed = parseBrief(raw)
    expect(parsed.ok).toBe(true)
    if (parsed.ok) {
      expect(parsed.brief.id).toBe("am-9c43")
      expect(parsed.brief.resume).toMatchObject({
        variant: "backend",
        template: "safe",
      })
    }
  })

  it("says what is wrong instead of opening a file that is not a brief", () => {
    expect(parseBrief("not json")).toEqual({
      ok: false,
      problem: "That file isn’t JSON.",
    })

    const otherVersion = parseBrief(
      edited((json) => {
        json.schema = "some-ui.job-brief/2"
      })
    )
    expect(otherVersion).toMatchObject({ ok: false })
    if (!otherVersion.ok) expect(otherVersion.problem).toContain("schema")

    const plainHttp = parseBrief(
      edited((json) => {
        json.posting = {
          ...Object(json.posting),
          applyUrl: "http://example.com/apply",
        }
      })
    )
    expect(plainHttp).toMatchObject({ ok: false })
    if (!plainHttp.ok) expect(plainHttp.problem).toContain("posting.applyUrl")

    const noCommit = parseBrief(
      edited((json) => {
        json.resume = { ...Object(json.resume), ref: "main" }
      })
    )
    expect(noCommit).toMatchObject({ ok: false })
  })
})

describe("the résumé a brief names", () => {
  it("is the file scripts/compile.mjs writes, built at the brief's commit", () => {
    expect(resumeFile({ variant: "backend", template: "safe" })).toBe(
      "resume-backend-safe.pdf"
    )
    expect(resumeFile({ variant: "platform", template: "rail" })).toBe(
      "resume-platform.pdf"
    )
    expect(buildCommand({ ref: "b08c1ad" })).toBe(
      "git fetch origin && git checkout b08c1ad && pnpm --filter @some-ui/resume exec node scripts/compile.mjs"
    )
  })
})

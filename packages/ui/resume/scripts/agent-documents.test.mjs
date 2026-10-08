import { describe, expect, it } from "vitest"

import {
  evidenceUrl,
  toJsonResume,
  toLlmsTxt,
  toMarkdown,
} from "./agent-documents.mjs"

const claim = (text, ...paths) => ({
  text,
  evidence: paths.map(([repo, path]) => ({ repo, path })),
})

const data = (variant, overrides = {}) => ({
  variant,
  profile: {
    name: "Ada Example",
    title: "Software Engineer",
    email: "ada@example.com",
    github: "github.com/ada",
    portfolio: "ada.github.io/site",
    location: "Berkeley, CA",
  },
  label: `${variant} label`,
  summary: "Builds *typed* services.",
  skills: "Rust; TypeScript",
  projects: [
    {
      name: "file_host",
      kind: "Rust, Axum",
      premise: "Overload is a designed state.",
      bullets: [
        claim(
          "Authored [40+] routes in file_host.",
          ["paulgsc/server", "apps/servers/file_host/src/routes"],
          ["paulgsc/some-ui", "packages/contract-harness"]
        ),
      ],
    },
  ],
  platform: [claim("Ratcheted lints.", ["paulgsc/server", "deny.toml"])],
  highlights: [{ title: "Parity", body: "Contracts checked." }],
  toolbox: [{ label: "Languages", items: "Rust, TypeScript" }],
  repositories: [{ name: "paulgsc/server", body: "Rust workspace." }],
  engagement: {
    role: "Software Engineer",
    org: "paulgsc/server",
    dates: "2024 — Present",
    note: "Independent open-source project (no employer)",
  },
  additionalExperience: [
    {
      role: "Data Administrator",
      org: "CABA Design",
      detail: "Rancho Cordova, CA",
      dates: "2020 — 2023",
      bullets: ["Built dashboards."],
    },
  ],
  education: [],
  languages: [],
  certifications: [],
  interests: [],
  ...overrides,
})

describe("evidenceUrl", () => {
  it("links a path on the repository's default branch", () => {
    expect(evidenceUrl({ repo: "paulgsc/server", path: "deny.toml" })).toBe(
      "https://github.com/paulgsc/server/tree/main/deny.toml"
    )
  })
})

describe("toJsonResume", () => {
  const resume = toJsonResume(data("backend"))

  it("keeps the standard fields as plain claim text", () => {
    expect(resume.projects[0].highlights).toEqual([
      "Authored [40+] routes in file_host.",
    ])
    expect(resume.work[0].highlights).toEqual(["Ratcheted lints."])
  })

  it("pairs each claim with its source links", () => {
    expect(resume.projects[0].evidence).toEqual([
      {
        claim: "Authored [40+] routes in file_host.",
        sources: [
          "https://github.com/paulgsc/server/tree/main/apps/servers/file_host/src/routes",
          "https://github.com/paulgsc/some-ui/tree/main/packages/contract-harness",
        ],
      },
    ])
  })

  it("turns year ranges into ISO dates and leaves an open end open", () => {
    expect(resume.work[0]).toMatchObject({ startDate: "2024" })
    expect(resume.work[0]).not.toHaveProperty("endDate")
    expect(resume.work[1]).toMatchObject({
      startDate: "2020",
      endDate: "2023",
      location: "Rancho Cordova, CA",
    })
  })

  it("derives the site, profile and location from the profile", () => {
    expect(resume.basics).toMatchObject({
      url: "https://ada.github.io/site/",
      label: "Software Engineer — backend label",
      location: { city: "Berkeley", region: "CA" },
      profiles: [
        { network: "GitHub", username: "ada", url: "https://github.com/ada" },
      ],
    })
    expect(resume.meta.canonical).toBe(
      "https://ada.github.io/site/resume-backend.json"
    )
  })
})

describe("toMarkdown", () => {
  const markdown = toMarkdown(data("backend"), ["backend", "platform"])

  it("follows every claim with its evidence links", () => {
    expect(markdown).toContain(
      "- Authored \\[40+\\] routes in file_host.\n" +
        "  - Evidence: [paulgsc/server: apps/servers/file_host/src/routes]" +
        "(https://github.com/paulgsc/server/tree/main/apps/servers/file_host/src/routes)"
    )
  })

  it("escapes markup in prose but not intraword underscores", () => {
    expect(markdown).toContain("Builds \\*typed\\* services.")
    expect(markdown).toContain("#### file_host")
  })

  it("links the other compositions and leaves empty sections out", () => {
    expect(markdown).toContain(
      "Other compositions: https://ada.github.io/site/resume-platform.md"
    )
    expect(markdown).not.toContain("## Education")
  })
})

describe("toLlmsTxt", () => {
  const llms = toLlmsTxt({
    backend: data("backend"),
    platform: data("platform"),
  })

  it("opens with the name and the default composition's summary", () => {
    expect(llms.startsWith("# Ada Example\n\n> Builds *typed* services.")).toBe(
      true
    )
  })

  it("lists every composition as Markdown and JSON", () => {
    for (const variant of ["backend", "platform"]) {
      expect(llms).toContain(
        `(https://ada.github.io/site/resume-${variant}.md)`
      )
      expect(llms).toContain(
        `(https://ada.github.io/site/resume-${variant}.json)`
      )
    }
  })
})

import { describe, expect, it } from "vitest"

import type { CommitStat } from "@/lib/loc-report/collect"
import {
  assembleSnapshot,
  expandRenamedPath,
  foldCommits,
  isBot,
  isGeneratedPath,
  parseGitLog,
} from "@/lib/loc-report/collect"
import { readSnapshot } from "@/lib/loc-report/schema"

const RS = "\u001e"
const US = "\u001f"

describe("parseGitLog", () => {
  it("reads one record per commit with its numstat lines", () => {
    const raw =
      `${RS}2026-10-02${US}Paul\n\n3\t1\tsrc/a.ts\n10\t0\tsrc/b.ts\n` +
      `${RS}2026-10-03${US}Paul\n\n-\t-\tlogo.png\n`
    expect(parseGitLog(raw)).toEqual([
      {
        date: "2026-10-02",
        author: "Paul",
        files: [
          { path: "src/a.ts", added: 3, removed: 1 },
          { path: "src/b.ts", added: 10, removed: 0 },
        ],
      },
      {
        date: "2026-10-03",
        author: "Paul",
        // A binary file has no lines to count.
        files: [{ path: "logo.png", added: 0, removed: 0 }],
      },
    ])
  })

  it("keeps a commit that touched no files", () => {
    expect(parseGitLog(`${RS}2026-10-03${US}Paul\n\n`)).toEqual([
      { date: "2026-10-03", author: "Paul", files: [] },
    ])
  })
})

describe("expandRenamedPath", () => {
  it.each([
    ["src/{old => new}/file.ts", "src/new/file.ts"],
    ["src/{old => }/file.ts", "src/file.ts"],
    ["{ => sub}/file.ts", "sub/file.ts"],
    ["a.ts => b.ts", "b.ts"],
    ["plain/path.ts", "plain/path.ts"],
  ])("%s becomes %s", (input, expected) => {
    expect(expandRenamedPath(input)).toBe(expected)
  })
})

describe("isGeneratedPath", () => {
  it.each([
    "pnpm-lock.yaml",
    "Cargo.lock",
    "apps/www/src/routeTree.gen.ts",
    "packages/server-routes/src/generated/routes.ts",
    "packages/contract-harness/routes.server.json",
    ".sqlx/query-abc.json",
    "apps/servers/file_host/.sqlx/query-abc.json",
    ".github/docker-changesets/abc.json",
    "src/__snapshots__/a.snap",
    "apps/www/CHANGELOG.md",
    "packages/x/dist/index.js",
  ])("%s is generated", (path) => {
    expect(isGeneratedPath(path)).toBe(true)
  })

  it.each([
    "apps/www/src/lib/loc-report/collect.ts",
    "apps/servers/file_host/migrations/0001_init.up.sql",
    "docs/monorepo-boundaries.md",
    // Looks like a lockfile only by suffix.
    "docs/pnpm-lock.yaml.md",
    // A directory named like one, but not `generated/`.
    "packages/regenerated/index.ts",
  ])("%s is the person's own", (path) => {
    expect(isGeneratedPath(path)).toBe(false)
  })
})

describe("isBot", () => {
  it("recognises the apps that open release and dependency PRs", () => {
    expect(isBot("github-actions[bot]")).toBe(true)
    expect(isBot("dependabot[bot]")).toBe(true)
    expect(isBot("Paul Gathondu")).toBe(false)
  })
})

describe("foldCommits", () => {
  const commit = (
    date: string,
    author: string,
    path: string,
    added = 5
  ): CommitStat => ({
    date,
    author,
    files: [{ path, added, removed: 2 }],
  })

  it("keeps generated lines apart from the person's own", () => {
    const days = foldCommits(
      [
        commit("2026-10-03", "Paul", "src/a.ts", 5),
        commit("2026-10-03", "Paul", "pnpm-lock.yaml", 900),
      ],
      "2026-04-06",
      "2026-10-03"
    )
    expect(days.get("2026-10-03")).toEqual({
      add: 5,
      del: 2,
      genAdd: 900,
      genDel: 2,
    })
  })

  it("leaves out bots and anything outside the window", () => {
    const days = foldCommits(
      [
        commit("2026-10-03", "github-actions[bot]", "src/a.ts"),
        commit("2026-04-05", "Paul", "src/a.ts"),
        commit("2026-10-04", "Paul", "src/a.ts"),
        commit("2026-10-02", "Paul", "src/a.ts"),
      ],
      "2026-04-06",
      "2026-10-03"
    )
    expect([...days.keys()]).toEqual(["2026-10-02"])
  })
})

describe("assembleSnapshot", () => {
  const input = {
    from: "2026-04-07",
    through: "2026-10-03",
    generatedAt: "2026-10-03T12:00:00Z",
    repos: [
      {
        name: "some-ui",
        commits: [
          {
            date: "2026-10-03",
            author: "Paul",
            files: [{ path: "a.ts", added: 4, removed: 1 }],
          },
          {
            date: "2026-10-01",
            author: "Paul",
            files: [{ path: "a.ts", added: 2, removed: 0 }],
          },
        ],
      },
      {
        name: "server",
        commits: [
          {
            date: "2026-10-03",
            author: "Paul",
            files: [{ path: "main.rs", added: 7, removed: 3 }],
          },
        ],
      },
    ],
  } as const

  it("lists days oldest first, with each repository that worked that day", () => {
    const snapshot = assembleSnapshot(input)
    expect(snapshot.repos).toEqual(["some-ui", "server"])
    expect(snapshot.days.map((day) => day.date)).toEqual([
      "2026-10-01",
      "2026-10-03",
    ])
    expect(Object.keys(snapshot.days[1].repos)).toEqual(["some-ui", "server"])
  })

  it("writes what the widget's schema accepts", () => {
    // The generator runs with nothing installed, so it cannot check its own
    // output against zod; this is the check.
    const snapshot = assembleSnapshot(input)
    expect(readSnapshot(snapshot)).toEqual(snapshot)
  })
})

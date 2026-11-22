/**
 * scripts/bucket-prune.sh `plan`, which .github/workflows/bucket-prune.yml
 * runs after a bucket PR merges: which carried branches it deletes, and which
 * it keeps. Each case builds a real repository shaped like a bucket (worker
 * branches merged into `claude/bucket-…` with merge commits, main moving on
 * by a squash) and reads the plan, so the rules are git's own ancestry.
 */

import { execFileSync, spawnSync } from "node:child_process"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

const SCRIPT = fileURLToPath(
  new URL("../../../scripts/bucket-prune.sh", import.meta.url)
)

let dir = ""
let count = 0

// The caller's environment without git's own variables: run from a hook,
// GIT_DIR or GIT_INDEX_FILE would point the fixtures at the outer repo.
function cleanEnv(): Record<string, string> {
  return { PATH: process.env["PATH"] ?? "", HOME: dir }
}

function git(...args: Array<string>): string {
  return execFileSync("git", args, {
    cwd: dir,
    encoding: "utf8",
    env: cleanEnv(),
  }).trim()
}

function commit(message: string): string {
  count += 1
  writeFileSync(join(dir, `f${count}`), message)
  git("add", ".")
  git("commit", "-q", "-m", message)
  return git("rev-parse", "HEAD")
}

// A remote branch, as the workflow's fetch leaves it.
function remote(name: string, sha: string): void {
  git("update-ref", `refs/remotes/origin/${name}`, sha)
}

type Line = { action: string; branch: string; reason: string }

function plan(head: string, env: Record<string, string> = {}): Array<Line> {
  const out = execFileSync(
    "bash",
    [SCRIPT, "plan", head, "refs/remotes/origin/main"],
    // Only what the plan reads from its caller: a variable in the shell
    // running the tests must not change the result.
    {
      cwd: dir,
      encoding: "utf8",
      env: { ...cleanEnv(), ...env },
    }
  )
  return out
    .split("\n")
    .filter((line) => line !== "")
    .map((line) => {
      const [action = "", branch = "", , reason = ""] = line.split("\t")
      return { action, branch, reason }
    })
    .sort((a, b) => a.branch.localeCompare(b.branch))
}

/**
 * main ── m1 ─────────────────────── squash   (origin/main)
 *          ├─ a1 (claude/a)               \
 *          ├─ b1 (claude/b)                bucket: m1 ⟵ merge a1 ⟵ merge b1
 *          └─ (claude/fresh at m1)
 * Returns the bucket's head.
 */
function bucket(): { head: string; a1: string; b1: string; m1: string } {
  git("checkout", "-q", "-b", "main")
  const m1 = commit("m1")
  git("checkout", "-q", "-b", "claude/a")
  const a1 = commit("a1")
  git("checkout", "-q", "-b", "claude/b", m1)
  const b1 = commit("b1")
  git("checkout", "-q", "-b", "claude/bucket-some-ui-1", m1)
  git("merge", "-q", "--no-ff", "-m", "merge a", a1)
  git("merge", "-q", "--no-ff", "-m", "merge b", b1)
  const head = git("rev-parse", "HEAD")
  git("checkout", "-q", "main")
  git("merge", "-q", "--squash", head)
  git("commit", "-q", "-m", "bucket 1")
  remote("main", git("rev-parse", "HEAD"))
  remote("claude/a", a1)
  remote("claude/b", b1)
  remote("claude/fresh", m1)
  return { head, a1, b1, m1 }
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "bucket-prune-"))
  count = 0
  git("init", "-q")
  git("config", "user.email", "test@example.invalid")
  git("config", "user.name", "test")
  git("config", "commit.gpgsign", "false")
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe("bucket-prune plan", () => {
  it("deletes a branch whose tip is a commit the bucket merged", () => {
    const { head } = bucket()
    expect(plan(head)).toEqual([
      {
        action: "delete",
        branch: "claude/a",
        reason: "its tip is a commit the bucket merged",
      },
      {
        action: "delete",
        branch: "claude/b",
        reason: "its tip is a commit the bucket merged",
      },
    ])
  })

  it("leaves alone a branch the bucket never carried, even one at a main commit", () => {
    const { head } = bucket()
    expect(plan(head).map((line) => line.branch)).not.toContain("claude/fresh")
  })

  it("keeps a branch that moved on after the bucket took it", () => {
    const { head } = bucket()
    git("checkout", "-q", "claude/a")
    remote("claude/a", commit("a2"))
    expect(plan(head)).toContainEqual({
      action: "keep",
      branch: "claude/a",
      reason: "it has moved on since the bucket took it",
    })
    expect(plan(head)).toContainEqual(
      expect.objectContaining({ action: "delete", branch: "claude/b" })
    )
  })

  it("deletes an older point of a carried line", () => {
    git("checkout", "-q", "-b", "main")
    const m1 = commit("m1")
    git("checkout", "-q", "-b", "claude/c")
    const c1 = commit("c1")
    const c2 = commit("c2")
    git("checkout", "-q", "-b", "claude/bucket-some-ui-1", m1)
    git("merge", "-q", "--no-ff", "-m", "merge c", c2)
    const head = git("rev-parse", "HEAD")
    git("checkout", "-q", "main")
    git("merge", "-q", "--squash", head)
    git("commit", "-q", "-m", "bucket 1")
    remote("main", git("rev-parse", "HEAD"))
    remote("claude/c", c2)
    remote("claude/c-wip", c1)
    expect(plan(head)).toEqual([
      {
        action: "delete",
        branch: "claude/c",
        reason: "its tip is a commit the bucket merged",
      },
      {
        action: "delete",
        branch: "claude/c-wip",
        reason: "the bucket holds its tip",
      },
    ])
  })

  it("deletes a branch the bucket was started from", () => {
    git("checkout", "-q", "-b", "main")
    commit("m1")
    git("checkout", "-q", "-b", "claude/a")
    const a1 = commit("a1")
    git("checkout", "-q", "-b", "claude/b", "main")
    const b1 = commit("b1")
    // The bucket's first parent line runs through claude/a.
    git("checkout", "-q", "-b", "claude/bucket-some-ui-1", a1)
    git("merge", "-q", "--no-ff", "-m", "merge b", b1)
    const head = git("rev-parse", "HEAD")
    git("checkout", "-q", "main")
    git("merge", "-q", "--squash", head)
    git("commit", "-q", "-m", "bucket 1")
    remote("main", git("rev-parse", "HEAD"))
    remote("claude/a", a1)
    remote("claude/b", b1)
    expect(plan(head)).toEqual([
      {
        action: "delete",
        branch: "claude/a",
        reason: "the bucket holds its tip",
      },
      {
        action: "delete",
        branch: "claude/b",
        reason: "its tip is a commit the bucket merged",
      },
    ])
  })

  it("names a branch that moved on from the line the bucket started on", () => {
    git("checkout", "-q", "-b", "main")
    commit("m1")
    git("checkout", "-q", "-b", "claude/a")
    const a1 = commit("a1")
    git("checkout", "-q", "-b", "claude/b", "main")
    const b1 = commit("b1")
    git("checkout", "-q", "-b", "claude/bucket-some-ui-1", a1)
    git("merge", "-q", "--no-ff", "-m", "merge b", b1)
    const head = git("rev-parse", "HEAD")
    git("checkout", "-q", "main")
    git("merge", "-q", "--squash", head)
    git("commit", "-q", "-m", "bucket 1")
    remote("main", git("rev-parse", "HEAD"))
    git("checkout", "-q", "claude/a")
    remote("claude/a", commit("a2"))
    remote("claude/b", b1)
    expect(plan(head)).toContainEqual({
      action: "keep",
      branch: "claude/a",
      reason: "it has moved on since the bucket took it",
    })
  })

  it("fails, printing no plan, when git cannot read the bucket", () => {
    bucket()
    const result = spawnSync(
      "bash",
      [SCRIPT, "plan", "0".repeat(40), "refs/remotes/origin/main"],
      { cwd: dir, encoding: "utf8", env: cleanEnv() }
    )
    expect(result.status).not.toBe(0)
    expect(result.stdout).toBe("")
  })

  it("keeps a branch an open pull request uses", () => {
    const { head } = bucket()
    expect(plan(head, { OPEN_PR_BRANCHES: "claude/a\nmain" })).toContainEqual({
      action: "keep",
      branch: "claude/a",
      reason: "an open pull request uses it",
    })
  })

  it("keeps a protected name, whatever its history", () => {
    const { head, a1, b1 } = bucket()
    remote("bot/flake-update", a1)
    remote("changeset-release/main", a1)
    remote("claude/bucket-some-ui-2", b1)
    remote("release", b1)
    const lines = plan(head, { PROTECTED_BRANCHES: "release\nother" })
    expect(lines).toContainEqual({
      action: "keep",
      branch: "bot/flake-update",
      reason: "a bot's branch",
    })
    expect(lines).toContainEqual({
      action: "keep",
      branch: "changeset-release/main",
      reason: "a bot's branch",
    })
    expect(lines).toContainEqual({
      action: "keep",
      branch: "claude/bucket-some-ui-2",
      reason: "a bucket's branch",
    })
    expect(lines).toContainEqual({
      action: "keep",
      branch: "release",
      reason: "a protected branch",
    })
  })

  it("carries nothing through a merge of main into the bucket", () => {
    git("checkout", "-q", "-b", "main")
    const m1 = commit("m1")
    git("checkout", "-q", "-b", "claude/bucket-some-ui-1")
    commit("work")
    git("checkout", "-q", "main")
    const m2 = commit("m2")
    git("checkout", "-q", "claude/bucket-some-ui-1")
    git("merge", "-q", "--no-ff", "-m", "merge main", m2)
    const head = git("rev-parse", "HEAD")
    git("checkout", "-q", "main")
    git("merge", "-q", "--squash", head)
    git("commit", "-q", "-m", "bucket 1")
    remote("main", git("rev-parse", "HEAD"))
    remote("claude/at-m2", m2)
    remote("claude/at-m1", m1)
    expect(plan(head)).toEqual([])
  })
})

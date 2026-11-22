/**
 * scripts/bucket-prune.sh `plan`, which .github/workflows/bucket-prune.yml
 * runs after a bucket PR merges: which carried branches it deletes, and which
 * it keeps. Each case builds a real repository shaped like a bucket (worker
 * branches merged into `claude/bucket-…` with merge commits, main moving on
 * by a squash) and reads the plan, so the rules are git's own ancestry.
 *
 * `run`, the workflow's step, is driven end to end: a bare repository stands
 * in for GitHub's remote, and a stub `gh` serves the PR's JSON through jq,
 * as `gh api --jq` does. That covers each way GitHub merges (squash, merge
 * commit, rebase) and each payload `run` must refuse.
 *
 * BP1. Claim: `run` prunes only a merged bucket PR, one whose head is
 * `claude/bucket-<this repo>-<n>`, and deletes every branch whose tip is in
 * the bucket's head but not in main's merge base with it, unless a rule
 * names it to keep (the default branch, a protected branch, `bot/*`,
 * `changeset-release/*`, a bucket of this repo's name, an open PR's
 * branch). Family: branch names and the PR's head name, including those
 * that only start like a bucket's (`claude/bucket-prune`,
 * `claude/bucket-prune-2`, `claude/bucket-x-1-wip`); how GitHub merged the
 * bucket (squash, merge commit, rebase). Proof: these cases.
 */

import { execFileSync, spawnSync } from "node:child_process"
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs"
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
    // As the workflow runs it: main just before the bucket merged.
    [SCRIPT, "plan", head, "refs/remotes/origin/main^1"],
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

  it("reads a bucket GitHub merged with a merge commit, not a squash", () => {
    git("checkout", "-q", "-b", "main")
    const m1 = commit("m1")
    git("checkout", "-q", "-b", "claude/a")
    const a1 = commit("a1")
    git("checkout", "-q", "-b", "claude/bucket-some-ui-1", m1)
    git("merge", "-q", "--no-ff", "-m", "merge a", a1)
    const head = git("rev-parse", "HEAD")
    git("checkout", "-q", "main")
    git("merge", "-q", "--no-ff", "-m", "merge bucket 1", head)
    // main now holds the whole bucket; the plan measures from before it.
    remote("main", git("rev-parse", "HEAD"))
    remote("claude/a", a1)
    expect(plan(head)).toEqual([
      {
        action: "delete",
        branch: "claude/a",
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
    // A head that shares no history with main: there is no bucket to read.
    git("checkout", "-q", "--orphan", "unrelated")
    const orphan = commit("unrelated")
    const result = spawnSync(
      "bash",
      [SCRIPT, "plan", orphan, "refs/remotes/origin/main"],
      { cwd: dir, encoding: "utf8", env: cleanEnv() }
    )
    expect(result.status).not.toBe(0)
    expect(result.stdout).toBe("")
    expect(result.stderr).toContain("no merge base")
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
    // Starts like a bucket but is a worker's branch: not kept by name.
    remote("claude/bucket-prune", a1)
    remote("claude/bucket-x-1-wip", a1)
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
      action: "delete",
      branch: "claude/bucket-prune",
      reason: "its tip is a commit the bucket merged",
    })
    expect(lines).toContainEqual({
      action: "delete",
      branch: "claude/bucket-x-1-wip",
      reason: "its tip is a commit the bucket merged",
    })
    expect(lines).toContainEqual({
      action: "keep",
      branch: "release",
      reason: "a protected branch",
    })
  })

  it("knows this repository's buckets by name once told the repository", () => {
    const { head, a1, b1 } = bucket()
    remote("claude/bucket-prune-2", a1)
    remote("claude/bucket-some-ui-2", b1)
    const lines = plan(head, { BUCKET_REPO: "some-ui" })
    expect(lines).toContainEqual({
      action: "delete",
      branch: "claude/bucket-prune-2",
      reason: "its tip is a commit the bucket merged",
    })
    expect(lines).toContainEqual({
      action: "keep",
      branch: "claude/bucket-some-ui-2",
      reason: "a bucket's branch",
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

// gh, as `run` calls it: `api [--paginate] <path> --jq <expr>`. The PR comes
// from pr.json; the protected-branch and open-PR lists are empty.
const GH_STUB = `#!/usr/bin/env bash
set -euo pipefail
path="" expr=""
shift
while [ $# -gt 0 ]; do
  case $1 in
    --jq) expr=$2; shift 2 ;;
    repos/*) path=$1; shift ;;
    *) shift ;;
  esac
done
case $path in
  */pulls/[0-9]*) file="$STUB_DIR/pr.json" ;;
  *) file="$STUB_DIR/empty.json" ;;
esac
jq -r "$expr" "$file"
`

describe("bucket-prune run", () => {
  type Merge = "squash" | "merge" | "rebase"

  // origin.git holds main, the workers' branches and refs/pull/7/head, as
  // GitHub does once the bucket merged and delete-on-merge removed its
  // branch. Returns the shas a PR payload names.
  function merged(how: Merge): { head: string; a1: string; merge: string } {
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
    if (how === "squash") {
      git("merge", "-q", "--squash", head)
      git("commit", "-q", "-m", "bucket 1")
    } else if (how === "merge") {
      git("merge", "-q", "--no-ff", "-m", "merge bucket 1", head)
    } else {
      // GitHub's rebase writes new commits; main moving first makes sure
      // these differ from a1 and b1, as GitHub's would.
      commit("m2")
      git("cherry-pick", a1, b1)
    }
    const merge = git("rev-parse", "HEAD")
    git("init", "-q", "--bare", join(dir, "origin.git"))
    git("remote", "add", "origin", join(dir, "origin.git"))
    git("push", "-q", "origin", "main", "claude/a", "claude/b")
    git("push", "-q", "origin", `${head}:refs/pull/7/head`)
    return { head, a1, merge }
  }

  function payload(
    head: string,
    mergeSha: string | null,
    ref = "claude/bucket-some-ui-1"
  ): void {
    mkdirSync(join(dir, "stub"), { recursive: true })
    writeFileSync(join(dir, "stub", "gh"), GH_STUB)
    chmodSync(join(dir, "stub", "gh"), 0o755)
    writeFileSync(join(dir, "stub", "empty.json"), "[]")
    writeFileSync(
      join(dir, "stub", "pr.json"),
      JSON.stringify({
        merged: true,
        head: {
          ref,
          sha: head,
          repo: { full_name: "owner/some-ui" },
        },
        base: { repo: { full_name: "owner/some-ui" } },
        merge_commit_sha: mergeSha,
      })
    )
  }

  // The workflow's checkout: a clone of the remote, then the step.
  function run(env: Record<string, string> = {}): {
    status: number | null
    summary: string
    left: string
  } {
    const checkout = join(dir, "checkout")
    git("clone", "-q", join(dir, "origin.git"), checkout)
    const summary = join(dir, "summary.md")
    writeFileSync(summary, "")
    const result = spawnSync("bash", [SCRIPT, "run"], {
      cwd: checkout,
      encoding: "utf8",
      env: {
        ...cleanEnv(),
        PATH: `${join(dir, "stub")}:${process.env["PATH"] ?? ""}`,
        STUB_DIR: join(dir, "stub"),
        GH_TOKEN: "dummy",
        GITHUB_REPOSITORY: "owner/some-ui",
        DEFAULT_BRANCH: "main",
        PR: "7",
        GITHUB_STEP_SUMMARY: summary,
        ...env,
      },
    })
    const left = git("ls-remote", "--heads", join(dir, "origin.git"))
      .split("\n")
      .map((line) => line.replace(/^\S+\s+refs\/heads\//, ""))
      .sort()
      .join(" ")
    return {
      status: result.status,
      summary: readFileSync(summary, "utf8"),
      left,
    }
  }

  for (const how of ["squash", "merge", "rebase"] as const) {
    it(`deletes the carried branches after a ${how} merge`, () => {
      const { head, merge } = merged(how)
      payload(head, merge)
      const result = run()
      expect(result.status).toBe(0)
      expect(result.left).toBe("main")
      expect(result.summary).toContain("- deleted `claude/a`")
      expect(result.summary).toContain("- deleted `claude/b`")
    })
  }

  it("refuses a PR with no merge commit, deleting nothing", () => {
    const { head } = merged("squash")
    payload(head, null)
    const result = run()
    expect(result.status).not.toBe(0)
    expect(result.left).toBe("claude/a claude/b main")
    expect(result.summary).toBe("")
  })

  it("refuses a merge commit that is not on the default branch", () => {
    const { head, a1 } = merged("squash")
    payload(head, a1)
    const result = run()
    expect(result.status).not.toBe(0)
    expect(result.left).toBe("claude/a claude/b main")
    expect(result.summary).toBe("")
  })

  it("passes over a merged PR whose head only starts like a bucket's", () => {
    const { head, merge } = merged("squash")
    payload(head, merge, "claude/bucket-prune")
    const result = run({ GITHUB_EVENT_NAME: "pull_request" })
    expect(result.status).toBe(0)
    expect(result.left).toBe("claude/a claude/b main")
    expect(result.summary).toBe("")
  })

  it("refuses a dispatch for a PR that is not a bucket", () => {
    const { head, merge } = merged("squash")
    payload(head, merge, "claude/bucket-prune")
    const result = run({ GITHUB_EVENT_NAME: "workflow_dispatch" })
    expect(result.status).not.toBe(0)
    expect(result.left).toBe("claude/a claude/b main")
    expect(result.summary).toBe("")
  })
})

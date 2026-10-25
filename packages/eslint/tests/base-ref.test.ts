/**
 * The base ref a ratchet compares with (`--base <ref>`, else `origin/main`
 * where it exists), shared by site-count.ts and policy-docs' script.
 */

import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { gitOrNull, resolveBaseRef } from "@eslint/base-ref.js"
import { afterEach, describe, expect, it } from "vitest"

const dirs: Array<string> = []
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true })
})
function emptyRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), "base-ref-"))
  dirs.push(dir)
  gitOrNull(dir, ["init", "--quiet"])
  return dir
}

describe("resolveBaseRef", () => {
  it("names origin/main unresolved where there is none and none was asked for", () => {
    expect(resolveBaseRef(emptyRepo(), [])).toEqual({
      ref: "origin/main",
      resolved: false,
    })
  })

  it("throws for a --base with no ref, or one that does not resolve", () => {
    const root = emptyRepo()
    expect(() => resolveBaseRef(root, ["--base"])).toThrow("--base needs a ref")
    expect(() => resolveBaseRef(root, ["--base", ""])).toThrow(
      "--base needs a ref"
    )
    expect(() => resolveBaseRef(root, ["--base", "no-such-ref"])).toThrow(
      "--base no-such-ref does not resolve"
    )
  })

  it("resolves a ref that names a commit", () => {
    const root = emptyRepo()
    gitOrNull(root, [
      "-c",
      "user.name=t",
      "-c",
      "user.email=t@example.com",
      "-c",
      "commit.gpgsign=false",
      "-c",
      "core.hooksPath=/dev/null",
      "commit",
      "--allow-empty",
      "--quiet",
      "-m",
      "x",
    ])
    expect(resolveBaseRef(root, ["--base", "HEAD"])).toEqual({
      ref: "HEAD",
      resolved: true,
    })
  })
})

describe("gitOrNull", () => {
  it("is null for a command that fails", () => {
    expect(gitOrNull(emptyRepo(), ["rev-parse", "--verify", "nope"])).toBeNull()
  })
})

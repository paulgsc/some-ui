/**
 * The git reads the whole-tree checks share: the working tree's files, the
 * base ref, and the files as that ref holds them.
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import {
  gitOrNull,
  readFilesAt,
  resolveBaseRef,
  worktreeFiles,
} from "@eslint/git-tree.js"
import { afterEach, describe, expect, it } from "vitest"

const dirs: Array<string> = []
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true })
})
function emptyRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), "git-tree-"))
  dirs.push(dir)
  gitOrNull(dir, ["init", "--quiet"])
  return dir
}
function write(root: string, files: Record<string, string>): void {
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true })
    writeFileSync(join(root, path), text)
  }
}
function commit(root: string): void {
  gitOrNull(root, ["add", "-A"])
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
    commit(root)
    expect(resolveBaseRef(root, ["--base", "HEAD"])).toEqual({
      ref: "HEAD",
      resolved: true,
    })
  })
})

describe("worktreeFiles", () => {
  it("lists tracked and untracked files, not ignored or deleted ones", () => {
    const root = emptyRepo()
    write(root, {
      ".gitignore": "ignored.md\n",
      "kept.md": "k",
      "gone.md": "g",
      "sub/a.md": "a",
    })
    commit(root)
    rmSync(join(root, "gone.md"))
    write(root, { "new.md": "n", "ignored.md": "i" })
    expect(worktreeFiles(root).sort()).toEqual(
      [".gitignore", "kept.md", "new.md", "sub/a.md"].sort()
    )
    expect(worktreeFiles(root, ["sub"])).toEqual(["sub/a.md"])
  })
})

describe("readFilesAt", () => {
  it("reads the matching files as the ref holds them, not the working tree", () => {
    const root = emptyRepo()
    write(root, { "a.md": "old", "b.txt": "x", "sub/c.md": "c" })
    commit(root)
    write(root, { "a.md": "new" })
    expect(readFilesAt(root, "HEAD", ".md")).toEqual(
      new Map([
        ["a.md", "old"],
        ["sub/c.md", "c"],
      ])
    )
  })

  it("throws for a ref with no tree", () => {
    expect(() => readFilesAt(emptyRepo(), "no-such-ref", ".md")).toThrow(
      "could not list the files at no-such-ref"
    )
  })
})

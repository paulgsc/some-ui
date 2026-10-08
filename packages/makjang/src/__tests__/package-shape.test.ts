/**
 * makjang imports nothing from topik, speech or any other workspace: the
 * package boundary is half of MK1 (docs/makjang/README.md, "Invariants"), and
 * a reviewer skimming a diff cannot see a manifest; a test that reads it can.
 */

import { readFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

const HERE = dirname(fileURLToPath(import.meta.url))
const PACKAGE_JSON_PATH = resolve(HERE, "../../package.json")

type PackageManifest = {
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
  peerDependencies?: Record<string, string>
}

function readManifest(): PackageManifest {
  const raw: unknown = JSON.parse(readFileSync(PACKAGE_JSON_PATH, "utf8"))
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- parsing package.json into a typed shape has no assertion-free alternative.
  return raw as PackageManifest
}

const FORBIDDEN_SUBSTRINGS = ["react", "tanstack", "zod"]

describe("package.json stays dependency-free", () => {
  it("has no runtime dependencies at all", () => {
    const manifest = readManifest()
    expect(manifest.dependencies ?? {}).toEqual({})
  })

  // peerDependencies are covered by the test below, which wants none at all.
  it("has no devDependency on React, TanStack Query, or zod", () => {
    const manifest = readManifest()
    const names = Object.keys(manifest.devDependencies ?? {})

    for (const name of names) {
      const lower = name.toLowerCase()
      for (const forbidden of FORBIDDEN_SUBSTRINGS) {
        expect(
          lower.includes(forbidden),
          `${name} in devDependencies looks like it pulls in ${forbidden} - packages/makjang must not know what React, a query cache or a schema library is: it is the story schema and a pure engine (docs/makjang/README.md, "Where it lives")`
        ).toBe(false)
      }
    }
  })

  it("names no workspace but its build tooling, so topik and speech stay out (MK1)", () => {
    const manifest = readManifest()
    const workspaces = Object.keys(manifest.devDependencies ?? {}).filter(
      (name) => name.startsWith("@some-ui/")
    )
    expect(workspaces.sort()).toEqual([
      "@some-ui/tsconfig",
      "@some-ui/vite-config",
    ])
  })

  it("has no peerDependencies at all - nothing here needs runtime injection", () => {
    const manifest = readManifest()
    expect(manifest.peerDependencies ?? {}).toEqual({})
  })
})

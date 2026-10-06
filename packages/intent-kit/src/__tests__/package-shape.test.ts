/**
 * This package exists as a shared workspace on the condition that it stays
 * dependency-free (#935), which a reviewer skimming a diff cannot see; a test
 * that reads the manifest can.
 *
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

  it("has no devDependency or peerDependency on React, TanStack Query, or zod", () => {
    const manifest = readManifest()
    const names = [
      ...Object.keys(manifest.devDependencies ?? {}),
      ...Object.keys(manifest.peerDependencies ?? {}),
    ]

    for (const name of names) {
      const lower = name.toLowerCase()
      for (const forbidden of FORBIDDEN_SUBSTRINGS) {
        expect(
          lower.includes(forbidden),
          `${name} in devDependencies/peerDependencies looks like it pulls in ${forbidden} - packages/intent-kit must not know what HTTP, React, or a query cache is (see #935 Pushback 3)`
        ).toBe(false)
      }
    }
  })

  it("has no peerDependencies at all - nothing here needs runtime injection", () => {
    const manifest = readManifest()
    expect(manifest.peerDependencies ?? {}).toEqual({})
  })
})

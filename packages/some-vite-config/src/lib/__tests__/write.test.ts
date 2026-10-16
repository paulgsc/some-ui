import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs"
import { tmpdir } from "os"
import { join } from "path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { updatePackageJson } from "@/lib/package-json/write.js"

let root: string

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "some-ui-write-"))
  mkdirSync(join(root, "src"))
  writeFileSync(join(root, "src/index.ts"), "")
  writeFileSync(
    join(root, "package.json"),
    JSON.stringify({ name: "@some-ui/topik", style: "./dist/topik.css" })
  )
  vi.spyOn(console, "log").mockImplementation(() => undefined)
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

function manifest(): Record<string, unknown> {
  const parsed: Record<string, unknown> = JSON.parse(
    readFileSync(join(root, "package.json"), "utf-8")
  )
  return parsed
}

describe("updatePackageJson", () => {
  it("drops a stale style field and export when the build wrote no stylesheet", () => {
    updatePackageJson({ packageName: "some-ui-topik" }, root)

    expect(manifest()).not.toHaveProperty("style")
    expect(manifest().exports).not.toHaveProperty("./style.css")
  })

  it("points style at the stylesheet the build wrote", () => {
    mkdirSync(join(root, "dist"))
    writeFileSync(join(root, "dist/topik.css"), "")

    updatePackageJson({ packageName: "some-ui-topik" }, root)

    expect(manifest()).toHaveProperty("style", "./dist/topik.css")
    expect(manifest().exports).toHaveProperty("./style.css", "./dist/topik.css")
  })
})

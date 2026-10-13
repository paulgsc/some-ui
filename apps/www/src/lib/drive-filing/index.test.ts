import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it, vi } from "vitest"

import { DRIVE_FOLDERS, driveFiling, driveFolder } from "@/lib/drive-filing"

/** Every `dir` www shares from: `shareFiles("<dir>"` in its source. */
function sharedDirs(): Set<string> {
  const src = fileURLToPath(new URL("../..", import.meta.url))
  const files = readdirSync(src, { recursive: true, encoding: "utf8" }).filter(
    (file) => /\.tsx?$/.test(file) && !/\.test\.tsx?$/.test(file)
  )
  const dirs = new Set<string>()
  for (const file of files) {
    const text = readFileSync(join(src, file), "utf8")
    for (const [, dir] of text.matchAll(/shareFiles\(\s*"([^"]+)"/g)) {
      dirs.add(dir)
    }
  }
  return dirs
}

describe("driveFolder", () => {
  it("files an export under the day it leaves", () => {
    expect(driveFolder("agent-export", new Date(2026, 9, 13))).toBe(
      "Study ledger › study-context › 2026-10-13 (new folder)"
    )
  })

  it("names a folder for every share the app makes, and for nothing else", () => {
    expect(new Set(Object.keys(DRIVE_FOLDERS))).toEqual(sharedDirs())
  })
})

describe("driveFiling", () => {
  it("shows the folder while the sheet is open and takes it down once it settles", () => {
    const notice = { show: vi.fn(() => 7), dismiss: vi.fn() }
    const sidecar = driveFiling(notice, () => new Date(2026, 9, 13))

    const settle = sidecar.opening("reflections")
    expect(notice.show).toHaveBeenCalledWith(
      "In Drive, save to",
      "Study ledger › reflections"
    )
    expect(notice.dismiss).not.toHaveBeenCalled()
    settle?.()
    expect(notice.dismiss).toHaveBeenCalledWith(7)

    expect(sidecar.opening("elsewhere")).toBeUndefined()
    expect(notice.show).toHaveBeenCalledOnce()
  })
})

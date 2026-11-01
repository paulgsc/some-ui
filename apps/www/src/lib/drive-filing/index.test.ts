import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it, vi } from "vitest"

import {
  DRIVE_FOLDERS,
  DRIVE_LOOK_IN,
  driveFiling,
  driveFolder,
} from "@/lib/drive-filing"

/** The first argument of every `<call>("<arg>"` in www's source. */
function callArgs(call: string): Set<string> {
  const src = fileURLToPath(new URL("../..", import.meta.url))
  const files = readdirSync(src, { recursive: true, encoding: "utf8" }).filter(
    (file) => /\.tsx?$/.test(file) && !/\.test\.tsx?$/.test(file)
  )
  const pattern = new RegExp(`\\b${call}\\(\\s*"([^"]+)"`, "g")
  const args = new Set<string>()
  for (const file of files) {
    const text = readFileSync(join(src, file), "utf8")
    for (const [, arg] of text.matchAll(pattern)) {
      args.add(arg)
    }
  }
  return args
}

describe("driveFolder", () => {
  it("files an export under the day it leaves", () => {
    expect(driveFolder("agent-export", new Date(2026, 9, 13))).toBe(
      "Study ledger › study-context › 2026-10-13 (new folder)"
    )
  })

  it("names a folder for every share the app makes, and for nothing else", () => {
    expect(new Set(Object.keys(DRIVE_FOLDERS))).toEqual(callArgs("shareFiles"))
  })

  it("names where to look for every kind the app asks about, and for nothing else", () => {
    expect(new Set(Object.keys(DRIVE_LOOK_IN))).toEqual(callArgs("lookIn"))
  })
})

describe("driveFiling", () => {
  it("shows the folder while the sheet is open and takes it down once it settles", () => {
    const notice = { show: vi.fn(() => 7), dismiss: vi.fn() }
    const sidecar = driveFiling(notice, () => new Date(2026, 9, 13))

    const settle = sidecar.opening("studio-idea")
    expect(notice.show).toHaveBeenCalledWith(
      "In Drive, save to",
      "Build Journal › ideas"
    )
    expect(notice.dismiss).not.toHaveBeenCalled()
    settle?.()
    expect(notice.dismiss).toHaveBeenCalledWith(7)

    expect(sidecar.opening("elsewhere")).toBeUndefined()
    expect(notice.show).toHaveBeenCalledOnce()
  })

  it("says where a picked file waits, and nothing for a kind it doesn't file", () => {
    const sidecar = driveFiling()
    expect(sidecar.lookIn?.("drama-tree")).toBe(
      "In Drive, look in Dramas › requests"
    )
    expect(sidecar.lookIn?.("elsewhere")).toBeUndefined()
  })
})

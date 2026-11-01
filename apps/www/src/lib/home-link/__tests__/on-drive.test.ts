/** @vitest-environment node */
import type { HomeCall } from "@some-ui/core-utils"
import { describe, expect, it } from "vitest"

import {
  askOnDrive,
  ON_DRIVE_MAX_IDS,
  onDrivePath,
} from "@/lib/home-link/on-drive"

/** Home, answering each read with the asked ids it knows are on Drive. */
function home(onDrive: ReadonlySet<string>, paths: Array<string>): HomeCall {
  return (method, path) => {
    expect(method).toBe("GET")
    paths.push(path)
    const ids = decodeURIComponent(path.split("?ids=")[1] ?? "").split(",")
    return Promise.resolve({
      status: 200,
      body: JSON.stringify({
        onDrive: ids
          .filter((id) => onDrive.has(id))
          .map((note) => ({ note, listedAt: "2026-11-01T09:15:00.000Z" })),
      }),
    })
  }
}

describe("home's word that Drive has a Studio take (HF11)", () => {
  it("asks by the phone's ids, encoded, at most home's cap at a time, and names only what was asked", async () => {
    const ids = Array.from({ length: ON_DRIVE_MAX_IDS + 1 }, (_, n) => `t${n}`)
    const paths: Array<string> = []
    const found = await askOnDrive(home(new Set(["t0", "t100"]), paths), ids)
    expect(found).toEqual(new Set(["t0", "t100"]))
    expect(paths).toHaveLength(2)
    expect(onDrivePath(["a:b", "c"])).toBe("/voice-notes/on-drive?ids=a%3Ab,c")
  })

  it("LG1: an answer that is not home's word is no word at all", async () => {
    for (const answer of [
      { status: 404, body: "{}" },
      { status: 200, body: "not json" },
      { status: 200, body: JSON.stringify({ onDrive: "t1" }) },
    ]) {
      const send: HomeCall = () => Promise.resolve(answer)
      expect(await askOnDrive(send, ["t1"])).toBeNull()
    }
  })

  it("ignores a take home names that the phone did not ask about", async () => {
    const send: HomeCall = () =>
      Promise.resolve({
        status: 200,
        body: JSON.stringify({
          onDrive: [{ note: "other", listedAt: "2026-11-01T09:15:00.000Z" }],
        }),
      })
    expect(await askOnDrive(send, ["t1"])).toEqual(new Set())
  })
})

/** @vitest-environment node */
import { readProjectFile } from "@soundbites/lib/project/file"
import type { Project } from "@soundbites/lib/project/model"
import { newProject, step } from "@soundbites/lib/project/model"
import { cutListOf, fitted } from "@soundbites/lib/project/script"
import { studioFiles } from "@soundbites/lib/studio/export"
import { describe, expect, it } from "vitest"

import { AT, memoryProjectStore, primer } from "./fixture"

/** A take on "path" still on the phone, and one on "miss" that home holds. */
function project(): Project {
  const first = newProject("week-8", {
    author: "claude",
    message: "Primer",
    at: AT,
    cutList: cutListOf(primer()),
    primer: primer(),
  })
  const takes: Project["takes"] = [
    {
      id: "t1",
      shot: "path",
      recordedAt: AT,
      durationMs: 4_000,
      mimeType: "audio/webm;codecs=opus",
      keptBy: [],
      onPhone: true,
    },
    {
      id: "t2",
      shot: "miss",
      recordedAt: AT,
      durationMs: 3_000,
      mimeType: "audio/webm;codecs=opus",
      keptBy: ["drive", "home"],
      onPhone: false,
    },
  ]
  const withTakes = {
    ...first.project,
    takes,
    chosen: { path: "t1", miss: "t2" },
  }
  return step(
    { project: withTakes, taking: null, closing: null },
    {
      type: "revised",
      author: "owner",
      message: "Fitted",
      at: AT,
      cutList: takes.reduce(
        (cutList, take) => fitted(cutList, take.shot, take),
        cutListOf(primer())
      ),
    }
  ).state.project
}

describe("a project shared with Claude", () => {
  it("is its file, its takes in order, and the audio still on the phone", async () => {
    const kept = project()
    const memory = memoryProjectStore([kept])
    const written = await studioFiles(memory.store, kept, AT, "Europe/Paris")
    expect(written.files.map((file) => file.name)).toEqual([
      "project.json",
      "takes.json",
      "path-t1.webm",
    ])
    expect(written.sent).toEqual(["t1"])
    const projectJson = written.files[0]?.data
    expect(
      typeof projectJson === "string" && readProjectFile(projectJson).ok
    ).toBe(true)
    // The fixture's audio is the one byte "x".
    const sha256 =
      "2d711642b726b04401627ca9fbac32f5c8530fb1903cc4db02258717921a4881"
    expect(JSON.parse(String(written.files[1]?.data))).toMatchObject({
      cuts: [
        {
          id: "path",
          voice: "ad-lib",
          // The hash of the bytes sent, and the note home keeps them as.
          take: { file: "path-t1.webm", sha256, homeNote: "t1" },
        },
        // Sent with an earlier share: still named, so the splicer finds it,
        // with no hash, since this share does not carry its bytes.
        {
          id: "miss",
          voice: "read",
          take: { file: "miss-t2.webm", sha256: null, homeNote: "t2" },
        },
        { id: "next", voice: "ad-lib", take: null },
      ],
    })
  })
})

/** @vitest-environment node */
import { readProjectFile } from "@soundbites/lib/project/file"
import { memoryProjectStore } from "@soundbites/lib/project/memory-store"
import type { Project } from "@soundbites/lib/project/model"
import { newProject, step } from "@soundbites/lib/project/model"
import { cutListOf, fitted } from "@soundbites/lib/project/script"
import { studioFiles } from "@soundbites/lib/studio/export"
import { describe, expect, it } from "vitest"

import { AT, primer } from "./fixture"

/** A project with a take on "path" still on the phone and one on "miss" sent. */
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
      keptBy: ["drive"],
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
    expect(JSON.parse(String(written.files[1]?.data))).toMatchObject({
      cuts: [
        { id: "path", voice: "ad-lib", take: { file: "path-t1.webm" } },
        // Sent with an earlier share: still named, so the splicer finds it.
        { id: "miss", voice: "read", take: { file: "miss-t2.webm" } },
        { id: "next", voice: "ad-lib", take: null },
      ],
    })
  })
})

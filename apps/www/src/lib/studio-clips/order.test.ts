/** @vitest-environment node */
import type { Clip } from "@some-ui/video-render"
import { describe, expect, it } from "vitest"

import { newestFirst } from "./order"

const clip = (title: string, landed: string): Clip => ({
  id: title.toLowerCase(),
  title,
  app: "studio",
  change: { repo: "some-ui", kind: "pr", number: 1 },
  landed,
  before: null,
  after: { made: "session", video: "clip.webm" },
})

describe("the Library's order", () => {
  it("is the newest landed first, then A to Z", () => {
    const got = newestFirst([
      clip("Beta", "2026-11-01"),
      clip("Gamma", "2026-11-08"),
      clip("Alpha", "2026-11-01"),
    ])
    expect(got.map((c) => c.title)).toEqual(["Gamma", "Alpha", "Beta"])
  })
})

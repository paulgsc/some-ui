import type { Shot } from "@some-ui/video-render"
import { CUT_LIST_SCHEMA } from "@some-ui/video-render"
import type {
  CutListShape,
  ProjectEvent,
  ProjectState,
} from "@soundbites/lib/project/model"
import { newProject } from "@soundbites/lib/project/model"

export { run } from "@soundbites/fixtures"

export const AT = "2026-10-30T09:00:00.000Z"

export function shot(id: string, durationMs = 2_000): Shot {
  return {
    id,
    picture: {
      kind: "capture",
      source: "captures/walk.mp4",
      inMs: 0,
      speed: 1,
      cssWidth: 412,
      framing: { mode: "crop", zoom: 1, x: 0, y: 0 },
      taps: [],
    },
    durationMs,
    voiceInMs: 200,
    overrides: {},
    burnIns: [],
    idea: { origin: "agent" },
  }
}

export function shape(shots: ReadonlyArray<Shot>): CutListShape {
  return {
    schema: CUT_LIST_SCHEMA,
    title: "Fixture",
    series: { id: "fixture", version: 1 },
    look: "calm",
    voice: "ad-lib",
    shots: [...shots],
    burnIns: [],
  }
}

/** A project at rev 1 with shots a, b and c of 2 s each. */
export function started(): ProjectState {
  return newProject("p1", {
    author: "claude",
    message: "First cut",
    at: AT,
    cutList: shape([shot("a"), shot("b"), shot("c")]),
  })
}

export function take(id: string, shotId: string): ProjectEvent {
  return {
    type: "taken",
    take: {
      id,
      shot: shotId,
      recordedAt: AT,
      durationMs: 1_800,
      mimeType: "audio/webm",
    },
  }
}

// @vitest-environment jsdom
/**
 * Only a playing tab claims to be the source: marking a site turns every
 * open tab on it into a source at once, and the background keeps whichever
 * registers last, so an idle tab must not claim it (content.ts).
 */

import { isPlaying } from "@drama/effects/content/playback"
import { beforeEach, describe, expect, it } from "vitest"

function video(state: { paused: boolean; ended?: boolean }): HTMLVideoElement {
  const v = document.createElement("video")
  Object.defineProperty(v, "paused", { value: state.paused })
  Object.defineProperty(v, "ended", { value: state.ended ?? false })
  document.body.appendChild(v)
  return v
}

beforeEach(() => {
  document.body.innerHTML = ""
})

describe("isPlaying", () => {
  it("is false with no video, or only paused or ended ones", () => {
    expect(isPlaying()).toBe(false)
    video({ paused: true })
    video({ paused: false, ended: true })
    expect(isPlaying()).toBe(false)
  })

  it("is true while any video plays", () => {
    video({ paused: true })
    video({ paused: false })
    expect(isPlaying()).toBe(true)
  })
})

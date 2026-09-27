// @vitest-environment jsdom
/**
 * A source tab's GET_PLAYBACK answer describes one video — the primary one —
 * throughout: its time, whether it is playing, and when it started. A small
 * autoplaying ad beside a paused episode must not make the episode look live,
 * or the background would pick this tab over the one really playing.
 */

import { notePlay, readSourceReport } from "@drama/effects/content/playback"
import { beforeEach, describe, expect, it } from "vitest"

function video(state: {
  paused: boolean
  ended?: boolean
  size: number
  time?: number
}): HTMLVideoElement {
  const v = document.createElement("video")
  Object.defineProperty(v, "paused", { value: state.paused })
  Object.defineProperty(v, "ended", { value: state.ended ?? false })
  Object.defineProperty(v, "currentTime", { value: state.time ?? 0 })
  v.getBoundingClientRect = (): DOMRect =>
    DOMRect.fromRect({ width: state.size, height: state.size })
  document.body.appendChild(v)
  return v
}

beforeEach(() => {
  document.body.innerHTML = ""
})

describe("readSourceReport", () => {
  it("is null with no video", () => {
    expect(readSourceReport()).toBeNull()
  })

  it("reports the primary video as paused while a small ad autoplays", () => {
    video({ paused: true, size: 800, time: 1234 })
    const ad = video({ paused: false, size: 100, time: 5 })
    notePlay(ad, 999)

    const report = readSourceReport()
    expect(report?.playback.videoTime).toBe(1234)
    expect(report?.playing).toBe(false)
    expect(report?.lastPlayAt).toBe(0)
  })

  it("reports the primary video's own play time", () => {
    const episode = video({ paused: false, size: 800, time: 60 })
    notePlay(episode, 500)
    notePlay(video({ paused: false, size: 100 }), 900)

    const report = readSourceReport()
    expect(report?.playing).toBe(true)
    expect(report?.lastPlayAt).toBe(500)
  })

  it("an ended video is not playing", () => {
    video({ paused: false, ended: true, size: 800 })
    expect(readSourceReport()?.playing).toBe(false)
  })
})

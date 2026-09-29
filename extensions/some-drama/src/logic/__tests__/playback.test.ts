import {
  formatTimestamp,
  livePosition,
  livePublisher,
  predicts,
} from "@drama/logic/playback"
import type { SourceReport } from "@drama/types"
import { describe, expect, it } from "vitest"

const report = (over: Partial<SourceReport> = {}): SourceReport => ({
  playback: { videoTime: 600, duration: 3600, episode: "12화" },
  playing: true,
  lastPlayAt: 0,
  advancing: true,
  rate: 1,
  readAt: 1_000_000,
  ...over,
})

describe("livePosition", () => {
  it("moves on from the report while the video advances", () => {
    const p = livePosition(report(), 1_000_000 + 30_000)
    expect(p.videoTime).toBe(630)
    expect(p.timestamp).toBe("10:30")
    expect(p.progress).toBeCloseTo(630 / 3600)
  })

  it("stays at the reported time while paused or stalled", () => {
    expect(
      livePosition(report({ advancing: false }), 1_000_000 + 30_000).videoTime
    ).toBe(600)
  })

  it("runs at the playback rate", () => {
    expect(
      livePosition(report({ rate: 1.5 }), 1_000_000 + 10_000).videoTime
    ).toBe(615)
  })

  it("never runs past the end of the episode", () => {
    const p = livePosition(report(), 1_000_000 + 10_000_000)
    expect(p.videoTime).toBe(3600)
    expect(p.progress).toBe(1)
  })

  it("has no progress while the duration is unknown", () => {
    const pb = { videoTime: 90, duration: null, episode: "" }
    const p = livePosition(report({ playback: pb }), 1_000_000)
    expect(p.progress).toBe(0)
    expect(p.episode).toBe("")
  })

  it("names the episode canonically", () => {
    expect(livePosition(report(), 1_000_000).episode).toBe("Ep 12")
  })
})

describe("formatTimestamp", () => {
  it("adds hours past an hour", () => {
    expect(formatTimestamp(3725)).toBe("1:02:05")
    expect(formatTimestamp(65)).toBe("01:05")
    expect(formatTimestamp(Number.NaN)).toBe("00:00")
  })
})

describe("predicts", () => {
  const at = (videoTime: number, readAt: number, over = {}): SourceReport =>
    report({
      ...over,
      playback: { videoTime, duration: 3600, episode: "Ep 12" },
      readAt,
    })

  it("holds while the video plays on where the clock says", () => {
    expect(predicts(at(600, 0), at(630.4, 30_000))).toBe(true)
  })

  it("breaks on a seek, a pause, a speed change or a new episode", () => {
    expect(predicts(at(600, 0), at(900, 30_000))).toBe(false)
    expect(predicts(at(600, 0), at(630, 30_000, { advancing: false }))).toBe(
      false
    )
    expect(predicts(at(600, 0), at(630, 30_000, { rate: 2 }))).toBe(false)
    const next = at(630, 30_000)
    next.playback.episode = "Ep 13"
    expect(predicts(at(600, 0), next)).toBe(false)
  })

  it("breaks when the source appears or goes away, and holds with none", () => {
    expect(predicts(null, at(0, 0))).toBe(false)
    expect(predicts(at(0, 0), null)).toBe(false)
    expect(predicts(null, null)).toBe(true)
  })
})

describe("livePublisher", () => {
  function harness(answers: Array<SourceReport | null>): {
    publish: () => Promise<void>
    sent: Array<SourceReport | null>
  } {
    const sent: Array<SourceReport | null> = []
    const queue = [...answers]
    const publish = livePublisher(
      () => Promise.resolve(queue.shift() ?? null),
      (live) => {
        sent.push(live)
        return Promise.resolve()
      }
    )
    return { publish, sent }
  }

  it("always sends its first report, even none: displays' clocks are unknown", async () => {
    const { publish, sent } = harness([null])
    await publish()
    expect(sent).toEqual([null])
  })

  it("sends nothing while the last report sent still predicts the video", async () => {
    const playing = report({ readAt: 0 })
    const later = report({
      readAt: 60_000,
      playback: { videoTime: 660, duration: 3600, episode: "12화" },
    })
    const { publish, sent } = harness([playing, later, later, null, null])
    await publish()
    await publish() // a tab that isn't the drama's fired an event
    await publish() // a tab closed
    expect(sent).toEqual([playing])
    await publish() // the source went away
    await publish()
    expect(sent).toEqual([playing, null])
  })

  it("runs one call at a time, in the order they were made", async () => {
    const order: Array<number> = []
    let n = 0
    const publish = livePublisher(
      async () => {
        const i = n++
        // The first ask is the slowest; it must still finish first.
        await new Promise((r) => setTimeout(r, i === 0 ? 20 : 0))
        order.push(i)
        return report({ readAt: 0, advancing: i % 2 === 0 })
      },
      () => Promise.resolve()
    )
    await Promise.all([publish(), publish(), publish()])
    expect(order).toEqual([0, 1, 2])
  })
})

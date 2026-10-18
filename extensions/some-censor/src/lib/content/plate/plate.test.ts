import { asChannelId, asVideoId } from "@censor/types/ids"
import { describe, expect, it } from "vitest"

import { plateOf } from "./plate"

const inputs = {
  videoId: asVideoId("vid_a"),
  channelId: asChannelId("UC_a"),
  channelName: "《Lost Summer》",
}

describe("plateOf", () => {
  it("tones the fill by video and the disc by channel", () => {
    expect(plateOf(inputs)).toEqual({
      fill: "hsl(200 10% 18%)",
      disc: plateOf({ ...inputs, videoId: asVideoId("vid_b") }).disc,
      initial: "L",
    })
  })

  it("tones the disc by name until the channel resolves", () => {
    const byName = plateOf({ ...inputs, channelId: null }).disc
    expect(byName).not.toBe(plateOf(inputs).disc)
    expect(
      plateOf({ ...inputs, channelId: null, videoId: asVideoId("x") }).disc
    ).toBe(byName)
  })

  it.each([
    ["《Lost Summer》", "L"],
    ["@handle", "H"],
    ["3Blue1Brown", "3"],
    ["…한국", "한"],
    ["!!!", ""],
    [null, ""],
  ])("takes %j's initial as %j", (channelName, letter) => {
    expect(plateOf({ ...inputs, channelName }).initial).toBe(letter)
  })
})

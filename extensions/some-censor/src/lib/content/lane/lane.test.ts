import { describe, expect, it } from "vitest"

import { isMusic } from "./lane"

const titled = (title: string | null): boolean =>
  isMusic({ title, channelName: "Some Channel", artist: false })

describe("isMusic (QD15, #1806)", () => {
  it.each<[string, boolean]>([
    ["[MV] 너의 계절 (Spring Letters OST Part.3) Official Audio", true],
    ["【等风来】电视剧《Lost Summer》片尾曲 OST 2026", true],
    ["Goblin 도깨비 OST (Chanyeol, Punch) - Stay with me MV", true],
    ["[도깨비 OST Part 9] 에일리 (Ailee) - 첫눈처럼 너에게 가겠다", true],
    ["Kumpulan Lagu - OST GOBLIN (Lirik)", true],
    ["Beautiful (OST)", true],
    ["도깨비OST 모음", true],
    ["电视剧OST的片尾曲", true],
    // Not a whole token, or not as titles write it.
    ["The MVP of the season", false],
    ["Ghost stories, hosted live", false],
    ["Hvordan lage ost hjemme", false],
    ["Ost-Berlin 1961", false],
    ["mv command in Linux", false],
    // The token counts wherever it stands: a reaction or a ship titled "MV"
    // is admitted, the cost of the owner's token rule (2026-10-17).
    ["MV reaction 반응", true],
    ["MV Dali crashes into a bridge", true],
    // No music sign at all: held by the maturity rule, not admitted here.
    ["서울 브이로그 (Seoul vlog)", false],
    ["", false],
  ])("%s → %s", (title, music) => {
    expect(titled(title)).toBe(music)
  })

  it("reads an artist's Topic channel or badge as music, whatever the title", () => {
    expect(
      isMusic({
        title: "Untitled",
        channelName: "Ailee - Topic",
        artist: false,
      })
    ).toBe(true)
    expect(
      isMusic({ title: "Untitled", channelName: "Ailee", artist: true })
    ).toBe(true)
    expect(
      isMusic({ title: "Untitled", channelName: "Topic Talks", artist: false })
    ).toBe(false)
  })

  it("never admits on missing evidence", () => {
    expect(isMusic({ title: null, channelName: null, artist: false })).toBe(
      false
    )
  })
})

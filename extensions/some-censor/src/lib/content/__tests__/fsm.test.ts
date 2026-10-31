/**
 * The whole machine: `decide()` over a card's evidence, and the projection.
 *
 * The estimator's grammar is `maturity.test.ts`'s; these pin how its bands
 * become a view, and that every way of not knowing is absent.
 */

import type { ViewState } from "@censor/lib/content/fsm"
import { decide, decideWatch, project } from "@censor/lib/content/fsm"
import type { MusicSigns } from "@censor/lib/content/lane/lane"
import { DEFAULT_BOUNDARY_DAYS } from "@censor/lib/content/maturity/maturity"
import { plateOf } from "@censor/lib/content/plate/plate"
import { asChannelId, asVideoId } from "@censor/types/ids"
import { mkSession } from "@some-extension/common"
import { describe, expect, it } from "vitest"

const session = mkSession()
const NO_MUSIC = { title: null, channelName: null, artist: false }
const NOW = Date.UTC(2026, 9, 16)

function view(
  uploadDate: string | null,
  short = false,
  boundaryDays = DEFAULT_BOUNDARY_DAYS
): ViewState["kind"] {
  return decide(
    { ...NO_MUSIC, uploadDate, short },
    NOW,
    boundaryDays,
    "all",
    false,
    session
  ).kind
}

describe("decide", () => {
  it("plates a card at least the boundary old (QM3, QM4)", () => {
    expect(view("2 years ago")).toBe("plated")
    expect(view("10 years ago")).toBe("plated")
    expect(view("Jan 5, 2019")).toBe("plated")
  })

  it("holds a card younger than the boundary (QM1, QM2)", () => {
    expect(view("3 days ago")).toBe("absent")
    expect(view("11 months ago")).toBe("absent")
  })

  it("reads the band against the boundary it is given", () => {
    expect(view("11 months ago", false, 182)).toBe("plated")
  })

  it("holds a card whose age it cannot prove (QM0)", () => {
    expect(view(null)).toBe("absent")
    expect(view("")).toBe("absent")
    expect(view("1.2M views")).toBe("absent")
  })

  it("holds live and upcoming cards (present)", () => {
    expect(view("12K watching")).toBe("absent")
    expect(view("Premieres Dec 1, 2026")).toBe("absent")
  })

  it("holds every Short, whatever its date", () => {
    expect(view("10 years ago", true)).toBe("absent")
  })

  it("keeps the session it is given (F1)", () => {
    expect(
      decide(
        { ...NO_MUSIC, uploadDate: null, short: false },
        NOW,
        DEFAULT_BOUNDARY_DAYS,
        "all",
        false,
        session
      )
    ).toEqual({
      kind: "absent",
      session,
    })
  })

  it("plates a card with no date only where an undated card is shown (Music mix)", () => {
    const undated = (uploadDate: string | null, short = false): string =>
      decide(
        { ...NO_MUSIC, uploadDate, short },
        NOW,
        DEFAULT_BOUNDARY_DAYS,
        "all",
        true,
        session
      ).kind
    expect(undated(null)).toBe("plated")
    // A date it has still decides: shown undated is not shown young.
    expect(undated("3 hours ago")).toBe("absent")
    expect(undated(null, true), "a Short stays held").toBe("absent")
  })
})

describe("decideWatch (#1805)", () => {
  const page = (
    dates: ReadonlyArray<string>,
    overrides: { hydrated?: boolean; short?: boolean } = {}
  ): string =>
    decideWatch(
      {
        videoId: asVideoId("vid_w"),
        short: overrides.short ?? false,
        hydrated: overrides.hydrated ?? true,
        dates,
        miniplayer: false,
        ...NO_MUSIC,
      },
      NOW,
      DEFAULT_BOUNDARY_DAYS,
      "all"
    )

  it("plates the page's video on the youngest date it shows", () => {
    expect(page(["444M views", "21y ago", "Apr 23, 2005"])).toBe("plated")
    expect(page(["21y ago", "3 hours ago"])).toBe("absent")
    expect(page(["1.2K watching now"])).toBe("absent")
  })

  it("is pending until the metadata names the video and shows a date", () => {
    expect(page(["21y ago"], { hydrated: false })).toBe("pending")
    expect(page([])).toBe("pending")
  })

  it("holds a page with no date it can place, and every Short", () => {
    expect(page(["444M views", "SAN DIEGO ZOO"])).toBe("absent")
    expect(page([], { short: true })).toBe("absent")
  })
})

describe("the listening lane (QD15, #1806)", () => {
  const OST = "[MV] 너의 계절 (Spring Letters OST Part.3)"
  const card = (
    uploadDate: string | null,
    overrides: Partial<Parameters<typeof decide>[0]> = {},
    signs: MusicSigns = "all"
  ): ViewState["kind"] =>
    decide(
      { ...NO_MUSIC, title: OST, uploadDate, short: false, ...overrides },
      NOW,
      DEFAULT_BOUNDARY_DAYS,
      signs,
      false,
      session
    ).kind

  it("admits music whole at any age, once its date proves a past upload", () => {
    expect(card("3 days ago")).toBe("whole")
    expect(card("9 years ago")).toBe("whole")
    expect(
      card("2 hours ago", { title: "Untitled", channelName: "Ailee - Topic" })
    ).toBe("whole")
  })

  it("never admits live, upcoming, undated or Short music", () => {
    expect(card("1.2K watching")).toBe("absent")
    expect(card("Premieres in 3 hours")).toBe("absent")
    expect(card(null)).toBe("absent")
    expect(card("3 days ago", { short: true })).toBe("absent")
  })

  it("holds what is not music by the maturity rule", () => {
    expect(card("3 days ago", { title: "서울 브이로그" })).toBe("absent")
    expect(card("9 years ago", { title: "서울 브이로그" })).toBe("plated")
  })

  it("puts a whole card's video on the page whole, and the watch page too", () => {
    const inputs = {
      videoId: asVideoId("vid_a"),
      channelId: null,
      channelName: null,
    }
    expect(project({ kind: "whole", session }, inputs)).toEqual({
      dataBoyo: "whole",
      plate: null,
    })
    const page = {
      videoId: asVideoId("vid_w"),
      short: false,
      hydrated: true,
      dates: ["3 days ago"],
      miniplayer: false,
      ...NO_MUSIC,
      mix: null,
    }
    expect(
      decideWatch({ ...page, title: OST }, NOW, DEFAULT_BOUNDARY_DAYS, "all")
    ).toBe("whole")
    expect(decideWatch(page, NOW, DEFAULT_BOUNDARY_DAYS, "all")).toBe("absent")
  })

  it("threads the mode's music signs through (#1966)", () => {
    const page = {
      videoId: asVideoId("vid_w"),
      short: false,
      hydrated: true,
      dates: ["3 days ago"],
      miniplayer: false,
      ...NO_MUSIC,
      title: OST,
      mix: null,
    }
    expect(decideWatch(page, NOW, DEFAULT_BOUNDARY_DAYS, "channel")).toBe(
      "absent"
    )
    expect(card("3 days ago", {}, "channel")).toBe("absent")
  })
})

describe("project", () => {
  const inputs = {
    videoId: asVideoId("vid_a"),
    channelId: asChannelId("UC_a"),
    channelName: "《Lost Summer》",
  }

  it("stamps absent and plates nothing that is not rendered", () => {
    expect(project({ kind: "absent", session }, inputs)).toEqual({
      dataBoyo: "absent",
      plate: null,
    })
  })

  it("plates a plated card", () => {
    expect(project({ kind: "plated", session }, inputs)).toEqual({
      dataBoyo: "plated",
      plate: plateOf(inputs),
    })
  })
})

/**
 * The whole machine: `decide()` over a card's evidence, and the projection.
 *
 * The estimator's grammar is `maturity.test.ts`'s; these pin how its bands
 * become a view, and that every way of not knowing is absent.
 */

import type { ViewState } from "@censor/lib/content/fsm"
import { decide, decideWatch, project } from "@censor/lib/content/fsm"
import { DEFAULT_BOUNDARY_DAYS } from "@censor/lib/content/maturity/maturity"
import { plateOf } from "@censor/lib/content/plate/plate"
import { asChannelId, asVideoId } from "@censor/types/ids"
import { mkSession } from "@some-extension/common"
import { describe, expect, it } from "vitest"

const session = mkSession()
const NOW = Date.UTC(2026, 9, 16)

function view(
  uploadDate: string | null,
  short = false,
  boundaryDays = DEFAULT_BOUNDARY_DAYS
): ViewState["kind"] {
  return decide({ uploadDate, short }, NOW, boundaryDays, session).kind
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
        { uploadDate: null, short: false },
        NOW,
        DEFAULT_BOUNDARY_DAYS,
        session
      )
    ).toEqual({
      kind: "absent",
      session,
    })
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
      },
      NOW,
      DEFAULT_BOUNDARY_DAYS
    )

  it("plates the page's video on the youngest date it shows", () => {
    expect(page(["444M views", "21y ago", "Apr 23, 2005"])).toBe("plated")
    expect(page(["21y ago", "3 hours ago"])).toBe("absent")
    expect(page(["1.2K watching now"])).toBe("absent")
  })

  it("is pending until the metadata names the video", () => {
    expect(page(["21y ago"], { hydrated: false })).toBe("pending")
  })

  it("holds a page with no date it can place, and every Short", () => {
    expect(page(["444M views", "SAN DIEGO ZOO"])).toBe("absent")
    expect(page([])).toBe("absent")
    expect(page(["21y ago"], { short: true })).toBe("absent")
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

import type { PatternTake, Player } from "@some-ui/voice-capture"
import { ONE_TAKE, TAKE_WORDS } from "@some-ui/voice-capture"
import {
  simulatedPage,
  simulatedPattern,
  simulatedPlayer,
} from "@some-ui/voice-capture/testing"
import { TakeLibrary } from "@soundbites/components/take-library"
import { HEAR_AGAIN_WORDS } from "@soundbites/lib/hear-again/words"
import type { LibraryRead, LibraryTake } from "@soundbites/lib/library/model"
import type {
  LibraryAbout,
  LibraryOnPhone,
  LibraryPhone,
  LibraryStations,
  PhoneTake,
  TakesHome,
} from "@soundbites/lib/library/runtime"
import { LIBRARY_WORDS } from "@soundbites/lib/library/words"
import { STUDIO_WORDS } from "@soundbites/lib/studio/words"
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router"
import { act, fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

const W = LIBRARY_WORDS

const TAKE: LibraryTake = {
  id: "t1",
  ref: "week-8:intro:1",
  recordedAt: "2026-11-03T09:00:00.000Z",
  storedAt: "2026-11-03T09:01:00.000Z",
  size: 48_000,
  setAsideAt: null,
  heard: {
    text: "The brand comes first, then the week",
    language: "en",
    model: "ggml-base.en.bin",
    heardAt: "2026-11-03T09:02:00.000Z",
  },
}

const UNHEARD: LibraryTake = {
  ...TAKE,
  id: "t2",
  ref: "idea:i1:what",
  heard: null,
  setAsideAt: "2026-11-04T10:00:00.000Z",
}

const newest: LibraryRead = {
  kind: "read",
  page: { takes: [TAKE, UNHEARD], total: 2, matched: null, by: "newest" },
}

const quietPlayer: Player = {
  play: () => ({ ended: new Promise(() => undefined), stop: () => undefined }),
}

function home(more: Partial<TakesHome> = {}): TakesHome {
  return {
    hearAgain: () => Promise.resolve({ kind: "notTaken" }),
    takes: (q) =>
      Promise.resolve(
        q === null
          ? newest
          : {
              kind: "read",
              page: { takes: [TAKE], total: 2, matched: 1, by: "words" },
            }
      ),
    audio: () => Promise.resolve(new Blob(["take"])),
    ...more,
  }
}

const settle = (): Promise<void> => act(() => Promise.resolve())

describe("Takes on home (ST32)", () => {
  it("lists the takes home keeps with the words it heard, and says one it hasn't heard yet", async () => {
    render(
      <TakeLibrary ports={{ home: home(), player: quietPlayer }} pair={null} />
    )
    await settle()
    expect(screen.getByText(`“${TAKE.heard!.text}”`)).toBeTruthy()
    expect(screen.getByText(W.notHeard)).toBeTruthy()
    expect(screen.getByText(W.shown("newest", null, 2, 2, null))).toBeTruthy()
    expect(screen.getByText(W.setAside(UNHEARD.setAsideAt!))).toBeTruthy()
  })

  it("offers to ask home to try again on a take it heard, where home will, and says what came of it (#3339)", async () => {
    const asked: Array<string> = []
    render(
      <TakeLibrary
        ports={{
          home: home({
            takes: () =>
              Promise.resolve({
                kind: "read",
                page: {
                  takes: [
                    {
                      ...TAKE,
                      hearAgain: {
                        open: true,
                        hearing: false,
                        askAgainAt: null,
                      },
                    },
                    UNHEARD,
                  ],
                  total: 2,
                  matched: null,
                  by: "newest",
                },
              }),
            hearAgain: (id) => {
              asked.push(id)
              return Promise.resolve({ kind: "asked" })
            },
          }),
          player: quietPlayer,
        }}
        pair={null}
      />
    )
    await settle()
    // Only the take home says it will hear again offers it.
    const asks = screen.getAllByRole("button", { name: HEAR_AGAIN_WORDS.ask })
    expect(asks).toHaveLength(1)
    fireEvent.click(asks[0]!)
    await settle()
    expect(asked).toEqual(["t1"])
    expect(screen.getByText(HEAR_AGAIN_WORDS.said.asked)).toBeTruthy()
    expect(screen.getByText(HEAR_AGAIN_WORDS.hearing)).toBeTruthy()
    expect(
      screen.getByRole("button", { name: HEAR_AGAIN_WORDS.ask })
    ).toHaveProperty("disabled", true)
  })

  it("says where each take is on the conveyor, in the build's words, again on each change (CONVEYOR1)", async () => {
    let moved = 0
    const listeners = new Set<() => void>()
    const takes = [
      { ...TAKE, station: "cooking" },
      UNHEARD,
      { ...TAKE, id: "t3", station: null },
    ]
    render(
      <TakeLibrary
        ports={{
          home: home({
            takes: () =>
              Promise.resolve({
                kind: "read",
                page: { ...newest.page, takes },
              }),
          }),
          player: quietPlayer,
          stations: {
            subscribe: (listener): (() => void) => {
              listeners.add(listener)
              return (): void => {
                listeners.delete(listener)
              }
            },
            getSnapshot: (): number => moved,
            standing: (take): string | null =>
              take.station === null
                ? null
                : `${take.id} at ${take.station ?? "none"}, moves ${String(moved)}`,
            names: [],
            station: () => null,
          },
        }}
        pair={null}
      />
    )
    await settle()
    expect(screen.getByText("t1 at cooking, moves 0")).toBeTruthy()
    expect(screen.getByText("t2 at none, moves 0")).toBeTruthy()
    // A take on no conveyor (an idea's answer) says nothing of one.
    expect(screen.queryByText(/^t3 at/)).toBeNull()
    act(() => {
      moved = 1
      for (const listener of listeners) listener()
    })
    expect(screen.getByText("t1 at cooking, moves 1")).toBeTruthy()
  })

  it("puts what a page adds under each of home's takes (CONVEYOR2)", async () => {
    render(
      <TakeLibrary
        ports={{ home: home(), player: quietPlayer }}
        pair={null}
        row={(take) => <span>{`sorting ${take.id}`}</span>}
      />
    )
    await settle()
    expect(screen.getByText("sorting t1")).toBeTruthy()
    expect(screen.getByText("sorting t2")).toBeTruthy()
  })

  it("keeps a take playing here on its row, with its Stop, when it reaches home meanwhile", async () => {
    const reached: PatternTake = {
      id: "there",
      answers: "library",
      durationMs: 4000,
      recordedAt: "2026-11-05T09:00:00.000Z",
      standing: "current",
      kept: { place: "home", since: null },
    }
    const sim = simulatedPattern({
      options: {
        ...ONE_TAKE,
        takes: { per: "many", max: 40, full: "make-room" },
      },
      seed: [reached],
    })
    const playing = {
      ...sim.pattern.getSnapshot(),
      playback: { kind: "playing", id: "there" } as const,
    }
    const snapshot = { takes: [reached], full: false }
    render(
      <TakeLibrary
        ports={{
          home: home(),
          player: quietPlayer,
          phone: {
            pattern: { ...sim.pattern, getSnapshot: () => playing },
            line: "library",
            getSnapshot: () => snapshot,
            subscribe: (): (() => void) => () => undefined,
          },
        }}
        pair={null}
        compartment="here"
      />
    )
    await settle()
    expect(
      screen.getByRole("button", {
        name: TAKE_WORDS.rowLabel(TAKE_WORDS.stop, 4000),
      })
    ).toBeTruthy()
  })

  describe("in compartments (TAKES2, TAKES3)", () => {
    const NOTE_TAKE: LibraryTake = {
      ...TAKE,
      id: "n1",
      ref: "take:n1",
      heard: { ...TAKE.heard!, text: "The middle drags" },
    }
    const RAMBLE: LibraryTake = {
      ...TAKE,
      id: "r1",
      ref: "take:r1",
      heard: { ...TAKE.heard!, text: "An aside" },
    }
    const CANNED: LibraryTake = {
      ...TAKE,
      id: "c1",
      ref: "take:c1",
      setAsideAt: "2026-11-04T10:00:00.000Z",
      heard: { ...TAKE.heard!, text: "On the shelf" },
    }
    const all: LibraryRead = {
      kind: "read",
      page: {
        takes: [NOTE_TAKE, RAMBLE, CANNED, TAKE, UNHEARD],
        total: 5,
        matched: null,
        by: "newest",
      },
    }
    const about: LibraryAbout = {
      subscribe: () => () => undefined,
      getSnapshot: () => 0,
      about: (id) =>
        id === "n1"
          ? {
              kind: "note",
              feed: "The weekly call",
              episode: "Week of Nov 6",
              atMs: 192_000,
              picks: ["Pacing", "The voice"],
            }
          : null,
    }
    const station = new Map([
      ["n1", "Cooking"],
      ["r1", "In the oven"],
      ["c1", "Canned"],
      ["t1", "Cooking"],
    ])
    const stations: LibraryStations = {
      subscribe: () => () => undefined,
      getSnapshot: () => 0,
      standing: (take) => station.get(take.id) ?? null,
      names: ["In the oven", "Cooking", "Canned"],
      station: (take) => {
        const name = station.get(take.id)
        return name === undefined ? null : { name, canned: name === "Canned" }
      },
    }
    const ports = {
      home: home({ takes: () => Promise.resolve(all) }),
      player: quietPlayer,
      about,
      stations,
    }

    it("opens on a tile per kind and one for all, each with its count", async () => {
      render(
        <TakeLibrary
          ports={ports}
          pair={null}
          compartment={null}
          tile={(compartment, body) => (
            <a href={`#${compartment}`} aria-label={compartment}>
              {body}
            </a>
          )}
        />
      )
      await settle()
      const count = (name: string): string | null | undefined =>
        screen.getByRole("link", { name }).querySelector(".tabular-nums")
          ?.textContent
      expect(count("note")).toBe("1")
      expect(count("scene")).toBe("1")
      expect(count("idea")).toBe("1")
      expect(count("ask")).toBe("0")
      expect(count("here")).toBe("2")
      expect(count("all")).toBe("5")
      // The tiles list no take.
      expect(screen.queryByRole("button", { name: W.play })).toBeNull()
    })

    it("says what a note's take was said for, from what the phone knows", async () => {
      render(<TakeLibrary ports={ports} pair={null} compartment="note" />)
      await settle()
      // On its card, and as the chip of what it's about.
      expect(
        screen
          .getAllByText("The weekly call · Week of Nov 6")
          .map((each) => each.tagName)
      ).toEqual(expect.arrayContaining(["BUTTON", "P"]))
      expect(screen.getByText(/^At 3:12 · Said /)).toBeTruthy()
      expect(screen.getByText("Pacing")).toBeTruthy()
      expect(screen.getByText("“The middle drags”")).toBeTruthy()
      // Only the compartment's own takes.
      expect(screen.queryByText("“An aside”")).toBeNull()
    })

    it("filters by a chip in the top bar, each chip with its count, and folds the canned under the rest", async () => {
      render(<TakeLibrary ports={ports} pair={null} compartment="here" />)
      await settle()
      const bar = screen.getByRole("navigation", { name: W.chips })
      const chip = (name: RegExp): HTMLElement =>
        Array.from(bar.querySelectorAll("button")).find((button) =>
          name.test(button.textContent)
        )!
      expect(chip(/^On home2$/)).toBeTruthy()
      expect(chip(/^In the oven1$/)).toBeTruthy()
      expect(chip(/^Canned1$/)).toBeTruthy()
      // Canned folds under its own heading below the rest.
      expect(screen.getByRole("heading", { name: /Canned/ })).toBeTruthy()
      // A take on the conveyor says its station, not that it was set aside.
      expect(screen.queryByText(W.setAside(CANNED.setAsideAt!))).toBeNull()
      fireEvent.click(chip(/^In the oven/))
      expect(chip(/^In the oven/).getAttribute("aria-pressed")).toBe("true")
      expect(screen.getByText("“An aside”")).toBeTruthy()
      expect(screen.queryByText("“On the shelf”")).toBeNull()
      fireEvent.click(chip(/^In the oven/))
      expect(screen.getByText("“On the shelf”")).toBeTruthy()
    })

    it("stops a take of home's playing only when a chip takes its row away", async () => {
      const stop = vi.fn()
      const player: Player = {
        play: () => ({ ended: new Promise(() => undefined), stop }),
      }
      render(
        <TakeLibrary
          ports={{ ...ports, player }}
          pair={null}
          compartment="here"
        />
      )
      await settle()
      const bar = screen.getByRole("navigation", { name: W.chips })
      const chip = (name: RegExp): HTMLElement =>
        Array.from(bar.querySelectorAll("button")).find((button) =>
          name.test(button.textContent)
        )!
      // r1, "An aside", is the first of the compartment's cards.
      fireEvent.click(screen.getAllByRole("button", { name: W.play })[0]!)
      await settle()
      fireEvent.click(chip(/^In the oven/))
      expect(stop).not.toHaveBeenCalled()
      fireEvent.click(chip(/^In the oven/))
      fireEvent.click(chip(/^Canned/))
      expect(stop).toHaveBeenCalledTimes(1)
    })

    it("shows a take home already lists once, though the phone hasn't heard home has it", async () => {
      const going: PatternTake = {
        id: "r1",
        answers: "library",
        durationMs: 4000,
        recordedAt: "2026-11-05T09:00:00.000Z",
        standing: "current",
        kept: { place: "going" },
      }
      const sim = simulatedPattern({
        options: {
          ...ONE_TAKE,
          takes: { per: "many", max: 40, full: "make-room" },
        },
        seed: [going],
      })
      const snapshot = { takes: [going], full: false }
      render(
        <TakeLibrary
          ports={{
            ...ports,
            phone: {
              pattern: sim.pattern,
              line: "library",
              getSnapshot: () => snapshot,
              subscribe: (): (() => void) => () => undefined,
            },
          }}
          pair={null}
          compartment="here"
        />
      )
      await settle()
      expect(screen.getAllByText("“An aside”")).toHaveLength(1)
      expect(
        screen.queryByRole("button", {
          name: TAKE_WORDS.rowLabel(TAKE_WORDS.play, 4000),
        })
      ).toBeNull()
    })
  })

  it("searches the words, says the search ran on words, and goes back to the newest", async () => {
    const takes = vi.fn(home().takes)
    render(
      <TakeLibrary
        ports={{ home: home({ takes }), player: quietPlayer }}
        pair={null}
      />
    )
    await settle()
    fireEvent.change(screen.getByLabelText(W.searchLabel), {
      target: { value: "brand" },
    })
    fireEvent.click(screen.getByRole("button", { name: W.search }))
    await settle()
    expect(takes).toHaveBeenLastCalledWith(
      "brand",
      expect.any(Function),
      null,
      expect.anything()
    )
    expect(screen.getByText(W.shown("words", "brand", 1, 2, 1))).toBeTruthy()
    expect(screen.queryByText(W.notHeard)).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: W.newest }))
    await settle()
    expect(takes).toHaveBeenLastCalledWith(
      null,
      expect.any(Function),
      null,
      expect.anything()
    )
    expect(screen.getByText(W.notHeard)).toBeTruthy()
  })

  it("says a search is too long, and asks home nothing for it", async () => {
    const takes = vi.fn(home().takes)
    render(
      <TakeLibrary
        ports={{ home: home({ takes }), player: quietPlayer }}
        pair={null}
      />
    )
    await settle()
    fireEvent.change(screen.getByLabelText(W.searchLabel), {
      target: { value: "é".repeat(201) },
    })
    fireEvent.click(screen.getByRole("button", { name: W.search }))
    await settle()
    expect(screen.getByText(W.tooLong)).toBeTruthy()
    expect(takes).toHaveBeenCalledTimes(1)
  })

  it("plays a take from home, and says when home couldn't give it back", async () => {
    const play = vi.fn(quietPlayer.play)
    const audio = vi
      .fn<TakesHome["audio"]>()
      .mockResolvedValueOnce(new Blob(["take"]))
      .mockResolvedValueOnce(null)
    render(
      <TakeLibrary
        ports={{ home: home({ audio }), player: { play } }}
        pair={null}
      />
    )
    await settle()
    const [first, second] = screen.getAllByRole("button", { name: W.play })
    fireEvent.click(first!)
    await settle()
    expect(audio).toHaveBeenCalledWith("t1")
    expect(play).toHaveBeenCalledTimes(1)
    expect(screen.getByRole("button", { name: W.stop })).toBeTruthy()
    fireEvent.click(second!)
    await settle()
    expect(audio).toHaveBeenCalledWith("t2")
    expect(screen.getByText(W.unplayable)).toBeTruthy()
  })

  it("stops a take playing when the page is hidden, and its row offers Play again (VC4)", async () => {
    const page = simulatedPage()
    const player = simulatedPlayer(page.watch)
    render(<TakeLibrary ports={{ home: home(), player }} pair={null} />)
    await settle()
    fireEvent.click(screen.getAllByRole("button", { name: W.play })[0]!)
    await settle()
    expect(player.playing()).toBe(1)
    act(() => page.hide())
    await settle()
    expect(player.playing()).toBe(0)
    expect(screen.getAllByRole("button", { name: W.play })).toHaveLength(2)
  })

  it("stops a take playing when the person goes to another page of the app (VC4)", async () => {
    const player = simulatedPlayer()
    const root = createRootRoute({ component: Outlet })
    const router = createRouter({
      routeTree: root.addChildren([
        createRoute({
          getParentRoute: () => root,
          path: "/takes",
          component: () => (
            <TakeLibrary ports={{ home: home(), player }} pair={null} />
          ),
        }),
        createRoute({
          getParentRoute: () => root,
          path: "/elsewhere",
          component: () => <p>Elsewhere</p>,
        }),
      ]),
      history: createMemoryHistory({ initialEntries: ["/takes"] }),
    })
    render(<RouterProvider router={router} />)
    const [play] = await screen.findAllByRole("button", { name: W.play })
    fireEvent.click(play!)
    await settle()
    expect(player.playing()).toBe(1)
    await act(() => router.navigate({ to: "/elsewhere" }))
    expect(await screen.findByText("Elsewhere")).toBeTruthy()
    expect(player.playing()).toBe(0)
  })

  it("says why there is nothing, offering Try again only where it can help", async () => {
    const takes = vi.fn(() => Promise.resolve({ kind: "away" as const }))
    const { unmount } = render(
      <TakeLibrary
        ports={{ home: home({ takes }), player: quietPlayer }}
        pair={null}
      />
    )
    await settle()
    expect(screen.getByText(W.away)).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: W.readAgain }))
    await settle()
    expect(takes).toHaveBeenCalledTimes(2)
    unmount()
    render(
      <TakeLibrary
        ports={{
          home: home({
            takes: () => Promise.resolve({ kind: "unpaired" }),
          }),
          player: quietPlayer,
        }}
        pair={<a href="#pair">{STUDIO_WORDS.pair.pair}</a>}
      />
    )
    await settle()
    expect(screen.getByText(W.unpaired)).toBeTruthy()
    // The way to pairing is the app's link (ST34), never only "in Settings".
    expect(
      screen.getByRole("link", { name: STUDIO_WORDS.pair.pair })
    ).toBeTruthy()
    expect(screen.queryByRole("button", { name: W.readAgain })).toBeNull()
    expect(screen.queryByLabelText(W.searchLabel)).toBeNull()
  })

  it("records a take with no scene here, and lists apart, with where each is, only those home doesn't hold yet", async () => {
    const own = (id: string, kept: PatternTake["kept"]): PatternTake => ({
      id,
      answers: "library",
      durationMs: 4000,
      recordedAt: "2026-11-05T09:00:00.000Z",
      standing: "current",
      kept,
    })
    const takes = [
      own("going", { place: "going" }),
      own("there", { place: "home", since: null }),
    ]
    const sim = simulatedPattern({
      options: {
        ...ONE_TAKE,
        takes: { per: "many", max: 40, full: "make-room" },
      },
      seed: takes,
    })
    const phone = (full: boolean): LibraryPhone => {
      const snapshot = { takes, full }
      return {
        pattern: sim.pattern,
        line: "library",
        getSnapshot: () => snapshot,
        subscribe: () => () => undefined,
      }
    }
    const { unmount } = render(
      <TakeLibrary
        ports={{ home: home(), player: quietPlayer, phone: phone(false) }}
        pair={null}
      />
    )
    await settle()
    expect(screen.getByRole("heading", { name: W.record })).toBeTruthy()
    expect(screen.getByText(W.recordLine)).toBeTruthy()
    expect(
      screen.getByRole("button", { name: TAKE_WORDS.buttonLabel.ready })
    ).toBeTruthy()
    // Each row says where its take is, after its length.
    const place = (words: string): RegExp => new RegExp(`· ${words}$`)
    expect(screen.getByText(place(TAKE_WORDS.place.going))).toBeTruthy()
    // The one home holds shows in home's list, not twice.
    expect(screen.queryByText(place(TAKE_WORDS.place.home))).toBeNull()
    expect(
      screen.getAllByRole("button", {
        name: TAKE_WORDS.rowLabel(TAKE_WORDS.play, 4000),
      })
    ).toHaveLength(1)
    unmount()
    render(
      <TakeLibrary
        ports={{ home: home(), player: quietPlayer, phone: phone(true) }}
        pair={null}
      />
    )
    await settle()
    expect(screen.getByText(W.phoneFull(1))).toBeTruthy()
    expect(
      screen.getByRole("button", { name: TAKE_WORDS.buttonLabel.ready })
    ).toBeDisabled()
  })
})

describe("one home for every take", () => {
  const BITE: LibraryTake = {
    ...TAKE,
    id: "b1",
    of: "game",
    ref: "401772",
    recordedAt: "2026-11-16T21:00:00.000Z",
    fields: { strip: "Q3 4:12 · SF 17, LAR 13", scenario: "fourth-down" },
  }
  const OTHER_GAME: LibraryTake = {
    ...BITE,
    id: "b2",
    ref: "401999",
    recordedAt: "2026-11-09T21:00:00.000Z",
    fields: { strip: "Q1 9:00" },
  }
  const INTERVIEW: LibraryTake = {
    ...TAKE,
    id: "i1",
    of: "interview",
    ref: "2026-w47:time",
    recordedAt: "2026-11-17T09:00:00.000Z",
  }
  const every: LibraryRead = {
    kind: "read",
    page: {
      takes: [INTERVIEW, BITE, OTHER_GAME, { ...TAKE, of: "studio" }],
      total: 4,
      matched: null,
      by: "newest",
      covers: "every",
    },
  }
  const names = {
    game: (id: string): string | null =>
      id === "401772" ? "49ers vs Rams" : null,
    scenario: (id: string): string | null =>
      id === "fourth-down" ? "Fourth down" : null,
    question: (): string | null => "Tell me about a time",
  }
  const onPhone = (takes: ReadonlyArray<PhoneTake>): LibraryOnPhone => ({
    subscribe: () => () => undefined,
    getSnapshot: () => takes,
  })
  const OWN: PhoneTake = {
    id: "r1",
    of: "rust-round",
    ref: "2026-w46:QM-311",
    recordedAt: "2026-11-18T08:00:00.000Z",
    audio: () => Promise.resolve(new Blob(["own"])),
  }
  const ports = (
    more: object = {}
  ): Parameters<typeof TakeLibrary>[0]["ports"] => ({
    home: home({ takes: () => Promise.resolve(every) }),
    player: quietPlayer,
    names,
    ...more,
  })

  it("gives every kind its tile, counting the phone's own takes with home's", async () => {
    render(
      <TakeLibrary
        ports={ports({ onPhone: onPhone([OWN]) })}
        pair={null}
        compartment={null}
        tile={(compartment, body) => (
          <a href={`#${compartment}`} aria-label={compartment}>
            {body}
          </a>
        )}
      />
    )
    await settle()
    const count = (name: string): string | null | undefined =>
      screen.getByRole("link", { name }).querySelector(".tabular-nums")
        ?.textContent
    expect(count("bite")).toBe("2")
    expect(count("interview")).toBe("1")
    expect(count("round")).toBe("1")
    expect(count("all")).toBe("5")
    // No tile for a kind this phone doesn't know, while it holds none.
    expect(screen.queryByRole("link", { name: "other" })).toBeNull()
  })

  it("says each bite's game, moment and scenario in one row form, and opens filtered to one game", async () => {
    render(
      <TakeLibrary
        ports={ports()}
        pair={null}
        compartment="bite"
        initialChips={{
          topic: { key: "game:401772", label: "49ers vs Rams", asks: true },
        }}
      />
    )
    await settle()
    expect(screen.getAllByText("49ers vs Rams").length).toBeGreaterThan(0)
    expect(screen.getByText(/^Q3 4:12 · Fourth down · Said /)).toBeTruthy()
    // The other game's bite waits behind its own chip.
    expect(screen.queryByText(/^Q1 9:00/)).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: /^49ers vs Rams/ }))
    await settle()
    expect(screen.getByText(/^Q1 9:00/)).toBeTruthy()
  })

  it("places what the game holds with no bite among its bites, only while the game is the one chip picked", async () => {
    const asked: Array<[string, ReadonlyArray<string>]> = []
    render(
      <TakeLibrary
        ports={ports()}
        pair={null}
        compartment="bite"
        initialChips={{
          topic: { key: "game:401772", label: "49ers vs Rams", asks: true },
        }}
        gaps={(key, takes) => {
          asked.push([key, takes.map(({ id }) => id)])
          return [
            { key: "m1", at: "2026-11-16T22:00:00.000Z", body: "Later moment" },
            {
              key: "m0",
              at: "2026-11-16T20:00:00.000Z",
              body: "Earlier moment",
            },
          ]
        }}
      />
    )
    await settle()
    expect(asked.at(-1)).toEqual(["game:401772", ["b1"]])
    const rows = screen
      .getAllByRole("listitem")
      .map((each) => each.textContent)
      .filter((text) => text.length > 0)
    expect(rows[0]).toBe("Later moment")
    expect(rows[1]).toMatch(/^.*Q3 4:12/)
    expect(rows[2]).toBe("Earlier moment")
    // Every game's bites: no one game's moments among them.
    fireEvent.click(screen.getByRole("button", { name: /^49ers vs Rams/ }))
    await settle()
    expect(screen.queryByText("Later moment")).toBeNull()
  })

  it("orders newest, oldest, or by what each is about", async () => {
    render(<TakeLibrary ports={ports()} pair={null} compartment="bite" />)
    await settle()
    const said = (): Array<string> =>
      screen
        .getAllByText(/ · Said /)
        .map((each) => each.textContent.split(" · ")[0] ?? "")
    expect(said()).toEqual(["Q3 4:12", "Q1 9:00"])
    fireEvent.click(screen.getByRole("button", { name: W.order.oldest }))
    await settle()
    expect(said()).toEqual(["Q1 9:00", "Q3 4:12"])
  })

  it("lists the phone's own take of another kind with Play, from the phone, and finds it by what it's about", async () => {
    const played: Array<Blob> = []
    render(
      <TakeLibrary
        ports={ports({
          onPhone: onPhone([OWN]),
          player: {
            play: (audio: Blob) => {
              played.push(audio)
              return {
                ended: new Promise<void>(() => undefined),
                stop: (): void => undefined,
              }
            },
          },
        })}
        pair={null}
        compartment="round"
      />
    )
    await settle()
    expect(screen.getAllByText("Week 46").length).toBe(2)
    expect(screen.getByText(W.waitsHere)).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: W.play }))
    await settle()
    await settle()
    // The phone's own audio ("own"), not home's ("take").
    expect(played[0]?.size).toBe(3)
    const search = async (words: string): Promise<void> => {
      fireEvent.change(screen.getByLabelText(W.searchLabel), {
        target: { value: words },
      })
      fireEvent.submit(screen.getByRole("search"))
      await settle()
    }
    await search("week 46 qm-311")
    expect(screen.getByText(W.waitsHere)).toBeTruthy()
    await search("punt")
    expect(screen.queryByText(W.waitsHere)).toBeNull()
  })

  it("puts interview takes of both ref shapes in Interview week, by home's kind or the phone's, never by guessing from the ref", async () => {
    const read: LibraryTake = {
      ...INTERVIEW,
      id: "i2",
      ref: "2026-w47:read:intro",
    }
    render(
      <TakeLibrary
        ports={ports({
          home: home({
            takes: () =>
              Promise.resolve({
                kind: "read",
                page: { ...every.page, takes: [INTERVIEW, read] },
              }),
          }),
          onPhone: onPhone([
            { ...OWN, id: "i3", of: "interview", ref: "2026-w48:conflict" },
            { ...OWN, id: "i4", of: "interview", ref: "2026-w48:read:close" },
          ]),
        })}
        pair={null}
        compartment={null}
        tile={(compartment, body) => (
          <a href={`#${compartment}`} aria-label={compartment}>
            {body}
          </a>
        )}
      />
    )
    await settle()
    const count = (name: string): string | null | undefined =>
      screen.getByRole("link", { name }).querySelector(".tabular-nums")
        ?.textContent
    expect(count("interview")).toBe("4")
    // A ref of three parts or of two would read as a scene or one recorded
    // here, were it guessed.
    expect(count("scene")).toBe("0")
    expect(count("here")).toBe("0")
  })

  it("keeps a take that reached home showing until home's list has it, and plays a take home lists from home", async () => {
    const played: Array<Blob> = []
    render(
      <TakeLibrary
        ports={ports({
          onPhone: onPhone([
            { ...OWN, home: true },
            // Still on the phone too, and listed by home.
            { ...OWN, id: "i1", of: "interview", ref: INTERVIEW.ref },
          ]),
          player: {
            play: (audio: Blob) => {
              played.push(audio)
              return {
                ended: new Promise<void>(() => undefined),
                stop: (): void => undefined,
              }
            },
          },
        })}
        pair={null}
        compartment="all"
      />
    )
    await settle()
    // It reached home after the list was read: it stays, saying so.
    expect(screen.getByText(W.homeHasIt)).toBeTruthy()
    expect(screen.queryByText(W.homeLater)).toBeNull()
    // The interview take home lists, the newest on home's list.
    const listed = screen
      .getAllByText(/^Week 47/)
      .find((each) => each.tagName === "P")
      ?.closest("li")
      ?.querySelector("button")
    fireEvent.click(listed!)
    await settle()
    await settle()
    // Home's copy ("take"), not the phone's ("own").
    expect(played[0]?.size).toBe(4)
  })

  it("applies every chip picked to the takes recorded here, as to the rest", async () => {
    const takeHere: PatternTake = {
      id: "h1",
      answers: "here",
      durationMs: 3_000,
      recordedAt: "2026-11-18T07:00:00.000Z",
      standing: "current",
      kept: { place: "phone" },
    }
    const { pattern } = simulatedPattern({
      options: {
        ...ONE_TAKE,
        takes: { per: "many", max: 40, full: "make-room" },
      },
      seed: [takeHere],
    })
    const recordedSnapshot = { takes: [takeHere], full: false }
    render(
      <TakeLibrary
        ports={ports({
          phone: {
            pattern,
            line: "here",
            getSnapshot: () => recordedSnapshot,
            subscribe: (): (() => void) => () => undefined,
          },
        })}
        pair={null}
        compartment="all"
      />
    )
    await settle()
    // The take recorded here, in the recorder's own list.
    const recorded = (): boolean =>
      screen
        .getByRole("heading", { name: W.record })
        .closest("section")
        ?.textContent.includes("0:03") ?? false
    expect(recorded()).toBe(true)
    fireEvent.click(screen.getByRole("button", { name: /^Game day/ }))
    await settle()
    expect(recorded()).toBe(false)
  })

  it("still shows the phone's takes on a home that lists Studio's alone, saying what waits on a newer one", async () => {
    render(
      <TakeLibrary
        ports={ports({
          home: home({
            takes: () =>
              Promise.resolve({
                kind: "read",
                page: { ...newest.page, covers: "studio" },
              }),
          }),
          onPhone: onPhone([{ ...OWN, home: true }]),
        })}
        pair={null}
        compartment="all"
      />
    )
    await settle()
    expect(screen.getByText(W.studioOnly)).toBeTruthy()
    expect(screen.getByText(W.homeLater)).toBeTruthy()
  })
})

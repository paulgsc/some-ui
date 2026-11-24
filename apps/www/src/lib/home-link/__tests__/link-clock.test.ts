/**
 * HERD1 over the clocks a page can have (#3491): the real link, whose
 * every request takes the pace's turn, on a wall clock that stands still
 * (Snips Capture's page, at FROZEN_AT), is set back or jumps forward, while
 * the page's own clock (`since`) moves on. `pace.test.ts` holds the pace
 * itself across page loads.
 */
import type { FakeClock } from "@/test-support/fake-clock"
import { fakeClock } from "@/test-support/fake-clock"
import type { HomeAnswer } from "@some-ui/core-utils"
import { describe, expect, it } from "vitest"

import { BURST, MS_PER_REQUEST } from "@/lib/home-link/pace"
import type { HomeLink } from "@/lib/home-link/runtime"
import { createHomeLink } from "@/lib/home-link/runtime"

const BASE = "https://home.example/api/v1"
const settle = (): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, 0))

/** A paired link whose wall clock is `wall`, its own clock `clock`; how many requests reached home. */
async function linkOn(
  clock: FakeClock,
  wall: () => number
): Promise<{ link: HomeLink; reached: () => number }> {
  let reached = 0
  const link = createHomeLink({
    credential: {
      read: () =>
        Promise.resolve({
          record: JSON.stringify({ base: BASE, token: "t", id: "p" }),
          lost: false,
        }),
      write: () => Promise.resolve(),
      clear: () => Promise.resolve(),
    },
    request: (): Promise<HomeAnswer> => {
      reached += 1
      return Promise.resolve({ status: 200, body: "{}" })
    },
    onHidden: () => (): void => undefined,
    now: wall,
    since: clock.now,
    after: clock.after,
  })
  await link.load()
  return { link, reached: () => reached }
}

/** Asks `n` checks of home at once, each a request on the pace. */
function asks(link: HomeLink, n: number): Promise<Array<void>> {
  return Promise.all(Array.from({ length: n }, () => link.check()))
}

describe("the link's requests pace on the page's own clock, whatever its wall clock does (HERD1, #3491)", () => {
  for (const [what, wallOf] of [
    ["stands still", (): (() => number) => () => 1_793_611_800_000],
    [
      "is set back an hour once the burst is spent",
      (clock: FakeClock): (() => number) =>
        () =>
          clock.now() >= 1 ? clock.now() - 3_600_000 : clock.now(),
    ],
  ] as const) {
    it(`sends past the burst at one each ${String(MS_PER_REQUEST)} ms while the wall clock ${what}`, async () => {
      const clock = fakeClock()
      const home = await linkOn(clock, wallOf(clock))
      const asked = asks(home.link, BURST + 5)
      await settle()
      expect(home.reached()).toBe(BURST)
      for (let i = 1; i <= 5; i += 1) {
        clock.pass(MS_PER_REQUEST)
        await settle()
        expect(home.reached()).toBe(BURST + i)
      }
      await asked
    })
  }

  it("hands no second burst when the wall clock jumps forward within the page", async () => {
    const clock = fakeClock()
    let jumped = 0
    const home = await linkOn(clock, () => clock.now() + jumped)
    const first = asks(home.link, BURST)
    await settle()
    expect(home.reached()).toBe(BURST)
    await first
    jumped = 24 * 3_600_000
    const after = asks(home.link, 3)
    await settle()
    expect(home.reached()).toBe(BURST)
    clock.pass(MS_PER_REQUEST)
    await settle()
    expect(home.reached()).toBe(BURST + 1)
    clock.pass(2 * MS_PER_REQUEST)
    await settle()
    await after
    expect(home.reached()).toBe(BURST + 3)
  })
})

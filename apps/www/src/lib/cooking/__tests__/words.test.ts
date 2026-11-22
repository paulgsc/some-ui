/**
 * @vitest-environment node
 *
 * The Cooking page says everything in the owner's terms (CLAUDE.md, "State
 * in the person's terms").
 */
import { describe, expect, it } from "vitest"

import { COOKING_WORDS as W } from "@/lib/cooking/words"
import { MACHINERY, strings } from "@/lib/home-link/__tests__/machinery"

const all = [
  ...strings(W),
  W.now.checkFailed(1),
  W.now.checkFailed(2),
  W.now.checksRunning(3, 5),
  W.stepOf(0),
  W.waitsOn("Deploy home"),
  W.waitOnYou(1),
  W.waitOnYou(2),
  W.barYours("Now", "Install the APK", ["Watch the Rust essay"]),
  W.barOthers("Checks", "The checks finish", "Merge the bumps"),
  W.stopOf("Deploy home", 0, 4),
  W.passed("13:04"),
  W.here("13:04"),
  W.goTo("Deploy home"),
  W.overview(7),
  W.landsOn("Home"),
  W.trainsOf(1, 5, 7),
  W.overCap(12, 13),
  W.someUnread(1),
  W.someUnread(2),
]

describe("the Cooking page's words", () => {
  it("never name the machinery", () => {
    expect(all.filter((line) => MACHINERY.test(line))).toEqual([])
  })

  it("count stops and steps from one", () => {
    expect(W.stopOf("Deploy home", 0, 4)).toBe("Deploy home · stop 1 of 4")
    expect(W.stepOf(0)).toBe("Step 1 of the ask")
  })

  it("say who waits on a blocker", () => {
    expect(W.barYours("Now", "install the APK", ["Watch the Rust essay"])).toBe(
      "Now: install the APK. Watch the Rust essay waits on it."
    )
  })
})

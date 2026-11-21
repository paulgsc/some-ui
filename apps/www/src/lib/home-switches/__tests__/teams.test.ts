/**
 * Choosing the teams followed live: a chip for every team and for any team
 * home holds beyond them, a tap adds in order or takes off, and Save is
 * offered only for a list home doesn't already follow.
 */
import { describe, expect, it } from "vitest"

import {
  NFL_TEAMS,
  teamChips,
  teamsChanged,
  toggledTeam,
} from "@/lib/home-switches/teams"

describe("the teams followed live", () => {
  it("are the 32 teams, each once, as home takes them", () => {
    expect(NFL_TEAMS).toHaveLength(32)
    expect(new Set(NFL_TEAMS).size).toBe(32)
    for (const team of NFL_TEAMS) expect(team).toMatch(/^[A-Z]{2,4}$/)
  })

  it("offer a chip for a team home holds that the list lacks, so it can be taken off", () => {
    expect(teamChips(null)).toEqual(NFL_TEAMS)
    expect(teamChips(["SF"])).toEqual(NFL_TEAMS)
    expect(teamChips(["SF", "WAS"])).toEqual([...NFL_TEAMS, "WAS"])
  })

  it("add a team in order, and take one off", () => {
    expect(toggledTeam(["SF"], "SEA")).toEqual(["SEA", "SF"])
    expect(toggledTeam(["SEA", "SF"], "SEA")).toEqual(["SF"])
    expect(toggledTeam([], "ARI")).toEqual(["ARI"])
  })

  it("count as changed only when home would keep another list", () => {
    expect(teamsChanged(["SF"], ["SF"])).toBe(false)
    expect(
      teamsChanged(toggledTeam(toggledTeam(["SF"], "SEA"), "SEA"), ["SF"])
    ).toBe(false)
    expect(teamsChanged([], [])).toBe(false)
    expect(teamsChanged(["SEA", "SF"], ["SF"])).toBe(true)
    expect(teamsChanged([], ["SF"])).toBe(true)
    expect(teamsChanged(["SEA", "SF"], ["SF", "SEA"])).toBe(false)
  })
})

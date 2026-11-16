/**
 * IWR1 (#3056): ROUTINE.md's "Before you start" says a fetch that reaches
 * back past the facts' window, as `window.ts` names both, and the build of
 * the package's workspace dependencies before its first command. It holds
 * the routine's words to the code, for any window; that those commands make
 * a usable checkout is git's and turbo's, and the scheduled run shows it.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import {
  FACTS_DAYS,
  factsWindow,
  FETCH_DAYS,
} from "@interview-week/lib/monday/window"
import { describe, expect, it } from "vitest"

const ROUTINE = readFileSync(
  join(import.meta.dirname, "../../../../ROUTINE.md"),
  "utf8"
).replaceAll(/\s+/g, " ")

describe("the routine's setup on a fresh clone (IWR1)", () => {
  it("fetches back past the facts' first day", () => {
    expect(FETCH_DAYS).toBeGreaterThan(FACTS_DAYS)
    expect(ROUTINE).toContain(
      `git fetch --shallow-since="$(date -u -d '${FETCH_DAYS} days ago' +%F)" origin main`
    )
  })

  it("builds the package's workspace dependencies before the commands run", () => {
    const build = ROUTINE.indexOf(
      'npx turbo run build --filter="@some-ui/interview-week^..." --continue'
    )
    expect(build).toBeGreaterThan(-1)
    expect(build).toBeLessThan(ROUTINE.indexOf("pnpm monday pull"))
  })

  it("reads the seven days that ended yesterday", () => {
    expect(factsWindow("2026-11-16")).toEqual({
      from: "2026-11-09",
      to: "2026-11-15",
    })
  })
})

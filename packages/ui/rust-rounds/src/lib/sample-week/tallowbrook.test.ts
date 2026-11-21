import { execFileSync, spawnSync } from "node:child_process"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { expectMatches, RustcRunSchema } from "@rust-rounds/lib/formats"
import { isWhole } from "@rust-rounds/lib/rustc-view"
import {
  TALLOWBROOK_HELD,
  TALLOWBROOK_WEEK_FILE,
  TB_101_RUN,
} from "@rust-rounds/lib/sample-week/tallowbrook"
import { describe, expect, it } from "vitest"
import { z } from "zod"

/** Which rustc is on the PATH, or null for none. */
function rustcVersion(): string | null {
  try {
    return execFileSync("rustc", ["--version"], { encoding: "utf8" })
  } catch {
    return null
  }
}

/** What rustc prints for `program`, as home compiles one, with or without JSON. */
function compile(program: string, json: boolean): string {
  const dir = mkdtempSync(join(tmpdir(), "tallowbrook-"))
  try {
    writeFileSync(join(dir, "main.rs"), program)
    const flags = ["--edition", "2024", "-C", "opt-level=0"]
    const done = spawnSync(
      "rustc",
      [...flags, ...(json ? ["--error-format=json"] : []), "main.rs"],
      { cwd: dir, env: { PATH: process.env.PATH ?? "" }, encoding: "utf8" }
    )
    return done.stderr
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

const TB_101 = TALLOWBROOK_WEEK_FILE.tickets[0]

describe("the Tallowbrook week as a phone holds it", () => {
  it("holds TB-101's run, which is what the ticket expects, its diagnostics joining to what was printed", () => {
    expect(TB_101?.id).toBe("TB-101")
    expect(TALLOWBROOK_HELD.runs["TB-101"]).toBe(TB_101_RUN)
    expect(TB_101 && expectMatches(TB_101.expect, TB_101_RUN)).toBe(true)
    expect(RustcRunSchema.parse(TB_101_RUN)).toEqual(TB_101_RUN)
    expect(isWhole(TB_101_RUN.diagnostics ?? [], TB_101_RUN.stderr)).toBe(true)
  })

  // CI has no rustc.
  it.skipIf(!(rustcVersion() ?? "").startsWith("rustc 1.97.0 "))(
    "is what rustc 1.97.0 prints for TB-101, where it is installed",
    () => {
      const program = TB_101?.program ?? ""
      expect(compile(program, false)).toBe(TB_101_RUN.stderr)
      const rendered = compile(program, true)
        .split("\n")
        .filter((line) => line.trim() !== "")
        .map(
          (line) =>
            z.object({ rendered: z.string() }).parse(JSON.parse(line)).rendered
        )
      expect(rendered).toEqual(
        (TB_101_RUN.diagnostics ?? []).map((d) => d.rendered)
      )
    },
    60_000
  )
})

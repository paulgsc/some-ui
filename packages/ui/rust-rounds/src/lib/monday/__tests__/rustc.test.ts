import { recorded, toolchainOf } from "@rust-rounds/lib/monday/rustc"
import type { Ran } from "@rust-rounds/lib/monday/rustc"
import { describe, expect, it } from "vitest"

const ran = (
  run: Ran["run"],
  compile: Ran["compile"] = { status: 0, stderr: "" }
): Ran => ({
  toolchain: "1.97.0",
  compile,
  run,
})
const exited = (status: number | null, timedOut = false): Ran["run"] => ({
  status,
  timedOut,
  stdout: "out\n",
  stderr: "err",
})

describe("recorded", () => {
  it("reads a compile error's first code, or none", () => {
    const stderr =
      "warning: unused\nerror[E0507]: cannot move out of index\nerror[E0382]: later\n"
    expect(recorded(ran(null, { status: 1, stderr }))).toMatchObject({
      outcome: "compile-error",
      code: "E0507",
      span: null,
    })
    expect(
      recorded(ran(null, { status: 1, stderr: "error: aborting\n" }))
    ).toMatchObject({ code: null })
  })

  it("reads a run's end as home does", () => {
    expect(recorded(ran(exited(0)))).toMatchObject({
      outcome: "prints",
      stdout: "out\n",
    })
    expect(recorded(ran(exited(101)))).toMatchObject({ outcome: "panics" })
    expect(recorded(ran(exited(null, true)))).toMatchObject({
      outcome: "stopped",
      why: "time",
    })
    expect(recorded(ran(exited(3)))).toMatchObject({
      outcome: "stopped",
      why: "exit",
    })
  })

  it("names the toolchain by its version", () => {
    expect(toolchainOf("rustc 1.97.0 (2d8144b78 2026-07-07)\n")).toBe("1.97.0")
  })
})

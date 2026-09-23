import { AlgorithmSchema } from "@leetype/types/algorithm"
import { describe, expect, it } from "vitest"

const VALID = {
  source: "export function solve(n: number): number {\n  return n * 2\n}",
  language: "typescript",
  entryPoint: "solve",
  inputAlphabet: "a single non-negative integer n on stdin",
} as const

describe("AlgorithmSchema", () => {
  it("accepts a complete algorithm", () => {
    expect(AlgorithmSchema.parse(VALID)).toEqual(VALID)
  })

  it("rejects an empty source", () => {
    expect(() => AlgorithmSchema.parse({ ...VALID, source: "" })).toThrow()
  })

  it("rejects a language outside the closed set", () => {
    expect(() =>
      AlgorithmSchema.parse({ ...VALID, language: "python" })
    ).toThrow()
  })

  it("rejects an empty entry point", () => {
    expect(() => AlgorithmSchema.parse({ ...VALID, entryPoint: "" })).toThrow()
  })

  it("rejects an empty input alphabet", () => {
    expect(() =>
      AlgorithmSchema.parse({ ...VALID, inputAlphabet: "" })
    ).toThrow()
  })
})

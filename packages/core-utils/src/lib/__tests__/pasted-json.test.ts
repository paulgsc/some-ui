import { fencedBodies, jsonValues } from "@core-utils/lib/pasted-json"
import { describe, expect, it } from "vitest"

describe("fencedBodies", () => {
  // The pattern the scan replaced. Kept here only as the reference the scan
  // must agree with on ordinary input; it is not safe on hostile input.
  const OLD_FENCE = /```(?:json)?\s*\n([\s\S]*?)```/g
  const oldBodies = (text: string): Array<string> =>
    [...text.matchAll(OLD_FENCE)].map((match) => match[1] ?? "")

  it("finds exactly the fences the old pattern did", () => {
    const cases = [
      "no fences",
      "```json\n[1]\n```",
      "```\n[1]\n```\ntext\n```json\n{}\n```",
      "```json  \r\n[1]\n```",
      "```json\n[1]",
      "```ts\nconst x = 1\n```\n```json\n[2]\n```",
      "prose\n```json\n{}\n```\nmore prose\n```\n[]\n```\n",
      [
        "intro",
        "```json",
        "[1]",
        "```",
        "```ts",
        "const x = 1",
        "```",
        "```  ",
        '{"a":2}',
        "```",
      ].join("\n"),
    ]
    for (const text of cases) {
      expect(fencedBodies(text), text).toEqual(oldBodies(text))
    }
  })

  it("stays linear on the input that made the old pattern backtrack", () => {
    const hostile = `\`\`\`\n${"\n ".repeat(100_000)}`
    const started = performance.now()
    expect(fencedBodies(hostile)).toEqual([])
    expect(jsonValues(hostile)).toEqual([])
    expect(performance.now() - started).toBeLessThan(1_000)
  })
})

describe("jsonValues", () => {
  it("reads every fenced block that parses, skipping the rest", () => {
    const text = '```json\n{"a":1}\n```\n```\nnot json\n```\n```\n[2]\n```'
    expect(jsonValues(text)).toEqual([{ a: 1 }, [2]])
  })

  it("reads bare JSON when the reply has no fence", () => {
    expect(jsonValues(' {"a":1} ')).toEqual([{ a: 1 }])
    expect(jsonValues("no JSON here")).toEqual([])
  })
})

import { describe, expect, it } from "vitest"

import type { CodeToken, CodeTokenStream } from "."
import { tokenizeCode } from "."

/** Each token's type and its text, depth first: what a surface paints. */
function typed(stream: CodeTokenStream | null): Array<[string, string]> {
  const out: Array<[string, string]> = []
  const walk = (content: string | CodeToken | CodeTokenStream): void => {
    if (typeof content === "string") return
    if (Array.isArray(content)) {
      for (const part of content) walk(part)
      return
    }
    if (typeof content.content === "string") {
      out.push([content.type, content.content])
    } else {
      walk(content.content)
    }
  }
  if (stream !== null) walk(stream)
  return out
}

function text(stream: CodeTokenStream | null): string {
  const join = (content: string | CodeToken | CodeTokenStream): string =>
    typeof content === "string"
      ? content
      : Array.isArray(content)
        ? content.map(join).join("")
        : join(content.content)
  return stream === null ? "" : join(stream)
}

describe("tokenizeCode", () => {
  it("reads Rust with Rust's grammar", () => {
    const tokens = tokenizeCode('fn main() {\n    let s = "aéz";\n}', "rust")
    expect(typed(tokens)).toContainEqual(["keyword", "fn"])
    expect(typed(tokens)).toContainEqual(["function-definition", "main"])
    expect(typed(tokens)).toContainEqual(["string", '"aéz"'])
  })

  it("loads every language LeetType's exercises are written in", () => {
    expect(typed(tokenizeCode("int x;", "c"))).toContainEqual([
      "keyword",
      "int",
    ])
    // C++ extends C's grammar, which must have run first.
    expect(typed(tokenizeCode("class A {};", "cpp"))).toContainEqual([
      "keyword",
      "class",
    ])
    expect(
      typed(tokenizeCode("let n: number = 1", "typescript"))
    ).toContainEqual(["builtin", "number"])
  })

  it("reads a language it does not load as JavaScript", () => {
    expect(typed(tokenizeCode("const x = 1", "haskell"))).toContainEqual([
      "keyword",
      "const",
    ])
  })

  it("keeps every character, in order", () => {
    const code =
      "fn f<'a>(s: &'a str) -> u8 {\n    /* é */ s.as_bytes()[2]\n}\n"
    expect(text(tokenizeCode(code, "rust"))).toBe(code)
  })
})

import type { JSX } from "react"
import { CodeCard } from "@some-ui/shared"

/**
 * The worked example's program (#2231), with its last line long enough to
 * outrun every phone width, in rustc 1.97's terms: line 4's `s[r]` is E0277,
 * its primary span 4:15 to 4:16. The variant changes line 4 to
 * `s.as_bytes()[r]`, which compiles and prints the byte (195).
 */
const PROGRAM = [
  "fn main() {",
  '    let s = String::from("aéz");',
  "    let r: usize = 1;",
  "    let c = s[r];",
  '    println!("byte {r} of {s:?} would start the char {c:?}, if a usize could index a str by chars");',
  "}",
].join("\n")

const VARIANT = PROGRAM.replace("s[r]", "s.as_bytes()[r]")

const E0277 = { lineStart: 4, columnStart: 15, lineEnd: 4, columnEnd: 16 }

/**
 * The phone's code card (RR2, #2233), as Rust Rounds shows it: the program
 * with rustc's span, then a variant with its changed line, in the `code`
 * appearance (`../code-card-fit.spec.ts`).
 */
export const CodeCardFixture = (): JSX.Element => (
  <div
    style={{
      boxSizing: "border-box",
      padding: 16,
      display: "flex",
      flexDirection: "column",
      gap: 12,
    }}
  >
    <CodeCard
      code={PROGRAM}
      spans={[E0277]}
      label="The program"
      appearance="code"
    />
    <CodeCard
      code={VARIANT}
      changedLines={[4]}
      label="The variant"
      appearance="code"
    />
  </div>
)

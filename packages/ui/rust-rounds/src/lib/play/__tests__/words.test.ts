/**
 * The owner's rules for what reaches the screen (#2231, #2235): no score,
 * verdict, "you said", level, streak, duration, timer or "done", and no
 * status code or internal name. And nowhere in the package's own source is
 * there a duration, a timer or a completion to show.
 */
import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { BLOOM_STEPS } from "@rust-rounds/lib/formats"
import { entryLine, runHeading, WORDS } from "@rust-rounds/lib/play/words"
import { INDEXING_01_RUNS } from "@rust-rounds/lib/worked-example"
import { describe, expect, it } from "vitest"

/** Every string the table can produce, with sample arguments. */
function everyWord(value: unknown): Array<string> {
  if (typeof value === "string") return [value]
  if (typeof value === "function") {
    const args =
      value.length === 2
        ? [
            ["indexing", 3],
            ["indexing", 1],
          ]
        : [[1], [12], ["1.97.0"]]
    return args.flatMap((sample) => {
      const said: unknown = Reflect.apply(value, undefined, sample)
      return typeof said === "string" ? [said] : []
    })
  }
  if (typeof value === "object" && value !== null) {
    return Object.values(value).flatMap(everyWord)
  }
  return []
}

const SHOWN = [
  ...everyWord(WORDS),
  ...Object.values(INDEXING_01_RUNS).map(runHeading),
  ...(["time", "memory", "output", "exit"] as const).map((why) =>
    runHeading({
      outcome: "stopped",
      toolchain: "1.97.0",
      compileStderr: "",
      why,
      stdout: "",
      stderr: "",
    })
  ),
  entryLine(null),
  entryLine({ concept: "indexing", number: 3 }),
]

const BANNED: ReadonlyArray<[string, RegExp]> = [
  [
    "a score or verdict",
    /\b(score|points?|correct|incorrect|wrong|right answer|verdict|grade|pass|fail(ed)?\b)/i,
  ],
  ["what you said, judged", /\byou said\b/i],
  ["a level, streak or XP", /\b(level|streak|xp)\b/i],
  [
    "a duration or timer",
    /\b(minutes?|seconds?|hours?|timer|duration|\d+\s?(s|min)\b)/i,
  ],
  ["a completion", /\b(done|complete[ds]?|completion|finish(ed)?|the end)\b/i],
  ["a status code", /\b[1-5]\d\d\b/],
  [
    "an internal name",
    /\b(schema|rust-round|outcome|compile-error|stopped|kind|null|undefined|bloom|pending|sync|grant|session)\b/i,
  ],
]

describe("the words on screen", () => {
  it("are all here to check", () => {
    expect(SHOWN.length).toBeGreaterThan(60)
  })

  it.each(BANNED)("hold no %s", (_, pattern) => {
    expect(SHOWN.filter((word) => pattern.test(word))).toEqual([])
  })

  it("name every Bloom step only inside a refine prompt's aim", () => {
    expect(Object.keys(WORDS.aim).sort()).toEqual([...BLOOM_STEPS].sort())
  })
})

/** The package's own source, tests and fixtures aside. */
function sources(dir: string): Array<string> {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) {
      return entry.name === "__tests__" ? [] : sources(path)
    }
    return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)
      ? [path]
      : []
  })
}

describe("the package", () => {
  const files = sources(join(import.meta.dirname, "..", "..", ".."))

  it("is all here to check", () => {
    expect(files.some((file) => file.endsWith("machine.ts"))).toBe(true)
    expect(files.some((file) => file.endsWith("index.tsx"))).toBe(true)
  })

  it("has no duration, timer, portion or completion anywhere", () => {
    const pattern =
      /\b(duration\w*|timer|setTimeout|setInterval|portion|completed?|completion|endScreen|wind-?down)\b/i
    const found = files.flatMap((file) =>
      readFileSync(file, "utf8")
        .split("\n")
        .flatMap((line, index) =>
          pattern.test(line) ? [`${file}:${index + 1}: ${line.trim()}`] : []
        )
    )
    expect(found).toEqual([])
  })
})

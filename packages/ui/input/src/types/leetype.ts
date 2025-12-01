export type GameState = "idle" | "playing" | "finished" | "timeout"

export type DisplayMode = "shown" | "hidden"
export type Language = "typescript" | "rust" | "cpp" | "c"

export type CodeSample = {
  title: string
  description: string
  code: string
}

export type CodeSamplesMap = {
  [L in Language]: CodeSample
}

export type CanonicalUnit = { kind: "char"; value: string } | { kind: "sep" }

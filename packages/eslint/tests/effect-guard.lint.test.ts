/**
 * Lint-time tests for effect-guard/no-latest-ref-effect. The firing cases are
 * shapes the rule replaced with useEffectEvent; the quiet ones are refs an
 * Effect Event cannot stand in for, because something outside an effect
 * reads them.
 */

import { effectGuardPlugin } from "@eslint/configs/react.config.js"
import typescriptParser from "@typescript-eslint/parser"
import type { Linter } from "eslint"
import { defineConfig } from "eslint/config"
import { describe, expect, it } from "vitest"

import {
  expectMessageForRule,
  expectNoMessageForRule,
  lintSnippet,
} from "./helpers/eslint-resolver.js"

const TSX_FILE = "src/example.tsx"
const RULE = "effect-guard/no-latest-ref-effect"

function makeConfig(): Array<Linter.Config> {
  return defineConfig([
    {
      files: ["**/*.tsx"],
      languageOptions: {
        parser: typescriptParser,
        parserOptions: { ecmaFeatures: { jsx: true } },
      },
      plugins: { "effect-guard": effectGuardPlugin },
      rules: { [RULE]: "error" },
    },
  ])
}

describe("lint: effect-guard/no-latest-ref-effect", () => {
  it("fires on a callback copied into a ref read by an interval effect", async () => {
    const code = `
function useTicker(onTick: () => void) {
  const onTickRef = useRef(onTick)
  useEffect(() => {
    onTickRef.current = onTick
  })
  useEffect(() => {
    const id = setInterval(() => onTickRef.current(), 1000)
    return () => clearInterval(id)
  }, [])
}
`
    const msgs = await lintSnippet(makeConfig(), code, TSX_FILE)
    expectMessageForRule(msgs, RULE, "latest ref read in an interval")
  })

  it("fires on each ref of a multi-copy layout effect", async () => {
    const code = `
const Player = ({ time, src }: { time: number; src: string }) => {
  const timeRef = useRef(time)
  const srcRef = useRef(src)
  useLayoutEffect(() => {
    timeRef.current = time
    srcRef.current = src
  }, [time, src])
  useEffect(() => () => save(srcRef.current, timeRef.current), [])
  return null
}
`
    const msgs = await lintSnippet(makeConfig(), code, TSX_FILE)
    expect(msgs.filter((m) => m.ruleId === RULE)).toHaveLength(2)
  })

  it.each<readonly [string, string]>([
    [
      "the ref is read from an event handler",
      `
function useRun(fn: () => void) {
  const fnRef = useRef(fn)
  useEffect(() => { fnRef.current = fn })
  return useCallback(() => fnRef.current(), [])
}
`,
    ],
    [
      "the ref is passed on as an object",
      `
function useWatch(cb: () => void) {
  const cbRef = useRef(cb)
  useEffect(() => { cbRef.current = cb })
  useEffect(() => subscribe(cbRef), [])
}
`,
    ],
    [
      "the effect does more than copy",
      `
function useLog(value: number) {
  const lastRef = useRef(value)
  useEffect(() => {
    lastRef.current = value
    log(value)
  })
  useEffect(() => () => log(lastRef.current), [])
}
`,
    ],
    [
      "another effect also writes the ref",
      `
function useSeen(value: number) {
  const seenRef = useRef(value)
  useEffect(() => { seenRef.current = value })
  useEffect(() => {
    if (seenRef.current === value) return
    seenRef.current = value
    notify(value)
  })
}
`,
    ],
    [
      "the ref is not a useRef",
      `
function useBox(value: number, box: { current: number }) {
  useEffect(() => { box.current = value })
  useEffect(() => () => log(box.current), [])
}
`,
    ],
  ])("does not fire when %s", async (_title, code) => {
    const msgs = await lintSnippet(makeConfig(), code, TSX_FILE)
    expectNoMessageForRule(msgs, RULE, _title)
  })
})

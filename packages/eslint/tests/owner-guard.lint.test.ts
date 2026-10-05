/**
 * Lint-time tests for owner-guard/no-mount-snapshot (#1659). The firing
 * cases are the shapes #1659's review found in aph and soundbites, each a
 * value read once at mount whose owner kept changing it.
 */

import { ownerGuardPlugin } from "@eslint/configs/owner-guard.config.js"
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
const RULE = "owner-guard/no-mount-snapshot"

function makeConfig(): Array<Linter.Config> {
  return defineConfig([
    {
      files: ["**/*.tsx"],
      languageOptions: {
        parser: typescriptParser,
        parserOptions: { ecmaFeatures: { jsx: true } },
      },
      plugins: { "owner-guard": ownerGuardPlugin },
      rules: { [RULE]: "error" },
    },
  ])
}

describe("lint: owner-guard/no-mount-snapshot", () => {
  it("fires on copy derived once from a destructured prop", async () => {
    // soundbites: the "Talk now" copy stayed after the runtime moved on.
    const code = `
const Page = ({ source }: { source: string }) => {
  const [ask] = useState(() => askFor(source))
  return <h1>{ask.title}</h1>
}
`
    const msgs = await lintSnippet(makeConfig(), code, TSX_FILE)
    expectMessageForRule(msgs, RULE, "useState seeded from a prop")
  })

  it("fires on the clock read at mount", async () => {
    // aph: Log, History and Trend each kept the time they were opened at.
    const code = `
const Log = () => {
  const [mounted] = useState(() => new Date())
  return <p>{mounted.getHours()}</p>
}
`
    const msgs = await lintSnippet(makeConfig(), code, TSX_FILE)
    expectMessageForRule(msgs, RULE, "useState seeded from new Date()")
  })

  it("fires on Date.now() and on useReducer's initial argument", async () => {
    const code = `
function useTimer(props: { side: string }) {
  const [started] = useState(Date.now())
  const [draft] = useReducer(step, props.side, newDraft)
  return [started, draft]
}
`
    const msgs = await lintSnippet(makeConfig(), code, TSX_FILE)
    expect(msgs.filter((m) => m.ruleId === RULE)).toHaveLength(2)
  })

  it("fires inside a component declared through memo or forwardRef", async () => {
    const code = `
const Page = memo(({ value }: { value: string }) => {
  const [copy] = useState(value)
  return <p>{copy}</p>
})
const Field = React.forwardRef(({ label }: { label: string }, ref) => {
  const [text] = useState(label)
  return <input ref={ref} defaultValue={text} />
})
`
    const msgs = await lintSnippet(makeConfig(), code, TSX_FILE)
    expect(msgs.filter((m) => m.ruleId === RULE)).toHaveLength(2)
  })

  it("fires on the clock function passed uncalled, which React calls at mount", async () => {
    const code = `
const Timer = () => {
  const [started] = useState(Date.now)
  const [state] = useReducer(step, null, performance.now)
  return <p>{started}{state}</p>
}
`
    const msgs = await lintSnippet(makeConfig(), code, TSX_FILE)
    expect(msgs.filter((m) => m.ruleId === RULE)).toHaveLength(2)
  })

  it("reports a called clock once, not again for its callee", async () => {
    const code = `
const Timer = () => {
  const [started] = useState(() => Date.now())
  return <p>{started}</p>
}
`
    const msgs = await lintSnippet(makeConfig(), code, TSX_FILE)
    expect(msgs.filter((m) => m.ruleId === RULE)).toHaveLength(1)
  })

  it("does NOT fire for a parameter named initial* or default*", async () => {
    const code = `
const Log = ({ initialSide, defaultOpen }: Props) => {
  const [draft] = useReducer(step, initialSide, newDraft)
  const [open] = useState(defaultOpen)
  return <p>{draft.side}{String(open)}</p>
}
`
    const msgs = await lintSnippet(makeConfig(), code, TSX_FILE)
    expectNoMessageForRule(msgs, RULE, "an initial*/default* parameter")
  })

  it("does NOT fire for a prop read at use, or a constant seed", async () => {
    const code = `
const Page = ({ source }: { source: string }) => {
  const [open, setOpen] = useState(false)
  const ask = askFor(source)
  return <h1 onClick={() => setOpen(!open)}>{ask.title}</h1>
}
`
    const msgs = await lintSnippet(makeConfig(), code, TSX_FILE)
    expectNoMessageForRule(msgs, RULE, "derived at use")
  })

  it("does NOT fire outside a component or hook", async () => {
    const code = `
function helper(source: string) {
  return useState(() => askFor(source))
}
`
    const msgs = await lintSnippet(makeConfig(), code, TSX_FILE)
    expectNoMessageForRule(msgs, RULE, "a plain function")
  })
})

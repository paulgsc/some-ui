/**
 * Lint-time integration tests for query-guard/no-loading-elided-default
 * (#968/MS8). Purely syntactic (VariableDeclarator/ObjectPattern shape
 * checks, no type information needed) - same rationale as
 * intent-guard.lint.test.ts.
 *
 * The last two cases are U-3 from the route-arrival handoff (r1): the issue
 * proposing this rule doubted its own stated AST pattern would catch the
 * sibling `if (isLoading || !data)` skeleton-forever family (F-1/F-5) -
 * these fixtures confirm that doubt rather than leaving it asserted but
 * untested.
 */

import { queryGuardPlugin } from "@eslint/configs/query-guard.config.js"
import typescriptParser from "@typescript-eslint/parser"
import type { Linter } from "eslint"
import { defineConfig } from "eslint/config"
import { describe, it } from "vitest"

import {
  expectMessageForRule,
  expectNoMessageForRule,
  lintSnippet,
} from "./helpers/eslint-resolver.js"

const TSX_FILE = "src/example.tsx"
const RULE = "query-guard/no-loading-elided-default"

function makeConfig(options?: Record<string, unknown>): Array<Linter.Config> {
  return defineConfig([
    {
      files: ["**/*.tsx"],
      languageOptions: {
        parser: typescriptParser,
        parserOptions: { ecmaFeatures: { jsx: true } },
      },
      plugins: { "query-guard": queryGuardPlugin },
      rules: {
        [RULE]: options ? ["error", options] : "error",
      },
    },
  ])
}

describe("lint: query-guard/no-loading-elided-default", () => {
  it("fires on the #968 dashboard pattern: a defaulted data with no sibling state key", async () => {
    const code = `
function DashboardHome() {
  const { data: sessions = [] } = useSessions()
  return <RecentSessions sessions={sessions} />
}
`
    const msgs = await lintSnippet(makeConfig(), code, TSX_FILE)
    expectMessageForRule(
      msgs,
      RULE,
      "a defaulted data destructure with no isLoading/error/status sibling"
    )
  })

  it("does NOT fire when isLoading is destructured alongside the default", async () => {
    const code = `
function Widget() {
  const { data: sessions = [], isLoading } = useSessions()
  return isLoading ? <Skeleton /> : <List sessions={sessions} />
}
`
    const msgs = await lintSnippet(makeConfig(), code, TSX_FILE)
    expectNoMessageForRule(
      msgs,
      RULE,
      "a defaulted data destructure with isLoading also destructured"
    )
  })

  it("does NOT fire when error is destructured alongside the default", async () => {
    const code = `
function Widget() {
  const { data: sessions = [], error } = useSessions()
  return error ? <Failure /> : <List sessions={sessions} />
}
`
    const msgs = await lintSnippet(makeConfig(), code, TSX_FILE)
    expectNoMessageForRule(
      msgs,
      RULE,
      "a defaulted data destructure with error also destructured"
    )
  })

  it("does NOT fire on a destructure with no default value at all", async () => {
    const code = `
function Widget() {
  const { data: sessions } = useSessions()
  return <List sessions={sessions} />
}
`
    const msgs = await lintSnippet(makeConfig(), code, TSX_FILE)
    expectNoMessageForRule(msgs, RULE, "a destructure with no default value")
  })

  it("does NOT fire on a call that doesn't look like a hook", async () => {
    const code = `
function build() {
  const { data: sessions = [] } = loadConfig()
  return sessions
}
`
    const msgs = await lintSnippet(makeConfig(), code, TSX_FILE)
    expectNoMessageForRule(msgs, RULE, "a non-hook-named callee")
  })

  it("fires on a configured dataKeys entry", async () => {
    const code = `
function Widget() {
  const { profile: p = null } = useProfile()
  return p
}
`
    const msgs = await lintSnippet(
      makeConfig({ dataKeys: ["profile"] }),
      code,
      TSX_FILE
    )
    expectMessageForRule(msgs, RULE, "a configured dataKeys entry")
  })

  // U-3: the rule's stated AST pattern (a *defaulted* data property) has no
  // default value to key off in this family at all - `isLoading` is always
  // destructured here, just misused three lines later - so this rule cannot
  // be the enforcement mechanism for F-1/F-5. `query-outcome`'s sealed
  // three-state type is; see that module's own header.
  it("U-3: does NOT fire on the isLoading-forever family's actual shape (no default value present)", async () => {
    const code = `
function SessionsRoute() {
  const { data: sessions, isLoading } = useSessions()
  if (isLoading || !sessions) {
    return <SessionsSkeleton />
  }
  return <List sessions={sessions} />
}
`
    const msgs = await lintSnippet(makeConfig(), code, TSX_FILE)
    expectNoMessageForRule(
      msgs,
      RULE,
      "the isLoading-forever family's un-defaulted destructure - this rule cannot see that bug"
    )
  })

  it("U-3: does NOT fire on the profile.tsx/settings.tsx/ProfileSummary shape either", async () => {
    const code = `
function ProfileRoute() {
  const { data: profile, isLoading } = useProfile()
  if (isLoading || !profile) {
    return <ProfileSkeleton />
  }
  return <ProfileForm profile={profile} />
}
`
    const msgs = await lintSnippet(makeConfig(), code, TSX_FILE)
    expectNoMessageForRule(
      msgs,
      RULE,
      "the same family's shape in profile/settings/ProfileSummary"
    )
  })
})

/**
 * Lint-time integration tests for query-guard/no-loading-elided-default
 * (#968). Syntactic, so no type information is needed. The last two cases
 * pin what the rule does not catch: the `if (isLoading || !data)`
 * skeleton-forever family.
 */

import { queryGuardPlugin } from "@eslint/configs/query-guard.config.js"
import typescriptParser from "@typescript-eslint/parser"
import type { Linter } from "eslint"
import { defineConfig } from "eslint/config"
import { describe, it } from "vitest"

import type { SnippetCase } from "./helpers/eslint-resolver.js"
import {
  expectMessageForRule,
  expectSnippet,
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
  it.each<SnippetCase>([
    [
      "fires on the #968 dashboard pattern: a defaulted data with no sibling state key",
      `
function DashboardHome() {
  const { data: sessions = [] } = useSessions()
  return <RecentSessions sessions={sessions} />
}
`,
      RULE,
      true,
    ],
    [
      "does NOT fire when isLoading is destructured alongside the default",
      `
function Widget() {
  const { data: sessions = [], isLoading } = useSessions()
  return isLoading ? <Skeleton /> : <List sessions={sessions} />
}
`,
      RULE,
      false,
    ],
    [
      "does NOT fire when error is destructured alongside the default",
      `
function Widget() {
  const { data: sessions = [], error } = useSessions()
  return error ? <Failure /> : <List sessions={sessions} />
}
`,
      RULE,
      false,
    ],
    [
      "does NOT fire on a destructure with no default value at all",
      `
function Widget() {
  const { data: sessions } = useSessions()
  return <List sessions={sessions} />
}
`,
      RULE,
      false,
    ],
    [
      "does NOT fire on a call that doesn't look like a hook",
      `
function build() {
  const { data: sessions = [] } = loadConfig()
  return sessions
}
`,
      RULE,
      false,
    ],
    [
      "U-3: does NOT fire on the isLoading-forever family's actual shape (no default value present)",
      `
function SessionsRoute() {
  const { data: sessions, isLoading } = useSessions()
  if (isLoading || !sessions) {
    return <SessionsSkeleton />
  }
  return <List sessions={sessions} />
}
`,
      RULE,
      false,
    ],
    [
      "U-3: does NOT fire on the profile.tsx/settings.tsx/ProfileSummary shape either",
      `
function ProfileRoute() {
  const { data: profile, isLoading } = useProfile()
  if (isLoading || !profile) {
    return <ProfileSkeleton />
  }
  return <ProfileForm profile={profile} />
}
`,
      RULE,
      false,
    ],
  ])("%s", (title, code, rule, fires) =>
    expectSnippet(makeConfig(), code, TSX_FILE, rule, fires, title)
  )

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

  // This family has no defaulted data to key off (`isLoading` is
  // destructured, just misused), so this rule cannot enforce it;
  // `query-outcome`'s sealed three-state type does (see its header).
})

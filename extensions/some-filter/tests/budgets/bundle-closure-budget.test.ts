/**
 * some-filter's wiring of the shared admission rule.
 *
 * The rule itself — what "page-affecting effect" means, how the shipped
 * artifact is scanned, which cost and retention classes are admissible, and
 * what the four conditions are — lives in `@some-extension/common/budgets`
 * and knows nothing about this extension. What lives here is the only part
 * that is genuinely some-filter's: the ledger of which primitives this
 * extension actually ships and at what declared cost.
 *
 * That split is the test of whether the rule was over-fitted. If making it
 * apply to a second extension ever requires editing the shared package to
 * know something about a particular one, the rule has stopped being a rule.
 * Today it requires only the three arguments below.
 */

import { join } from "path"
import { describeAdmissionGate } from "@some-extension/common/budgets/vitest"

import { EFFECT_LEDGER } from "./effect-ledger"

describeAdmissionGate({
  extension: "some-filter",
  distDir: join(import.meta.dirname, "..", "..", "dist"),
  ledger: EFFECT_LEDGER,
  buildCommand: "pnpm --filter @some-extension/filter build:chromium",
})

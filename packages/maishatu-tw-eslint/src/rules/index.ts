import type { Linter } from "@typescript-eslint/utils/ts-eslint"

import classNameOrder from "./enforce-order"

const rules = {
  "classname-order": classNameOrder,
} satisfies Linter.PluginRules

export = rules

import type { Linter } from "@typescript-eslint/utils/ts-eslint"

import recommended from "./configs/recommended"
import rules from "./rules"

// note - cannot migrate this to an import statement because it will make TSC copy the package.json to the dist folder
const { name, version } = require("../package.json") as {
  name: string
  version: string
}

const configs = {
  recommended,
}

const meta = {
  name,
  version,
}

export = {
  configs,
  meta,
  rules,
} satisfies Linter.Plugin

// fixture: consistent-type-imports should NOT fire
import type { Linter } from "eslint"
export type Bar = Linter.Config

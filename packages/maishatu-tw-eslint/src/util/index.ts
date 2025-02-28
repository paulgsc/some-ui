import { ESLintUtils } from "@typescript-eslint/utils"

export * from "./create-rule"
export * from "./get-constrained-type-allocation"
export * from "./get-option"

export const {
  applyDefault,
  deepMerge,
  getParserServices,
  isObjectNotArray,
  nullThrows,
  NullThrowsReasons,
} = ESLintUtils
export type InferMessageIdsTypeFromRule<T> =
  ESLintUtils.InferMessageIdsTypeFromRule<T>
export type InferOptionsTypeFromRule<T> =
  ESLintUtils.InferOptionsTypeFromRule<T>

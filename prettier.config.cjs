/** @type {import('prettier').Config} */
module.exports = {
  semi: false,
  trailingComma: "es5",
  importOrder: [
    "^(react/(.*)$)|^(react$)",
    "<THIRD_PARTY_MODULES>",
    "",
    "^@/types/(.*)$",
    "^@/lib/(.*)$",
    "^@/hooks/(.*)$",
    "^@/components/(.*)$",
    "",
    "^[./]",
  ],
  importOrderParserPlugins: ["typescript", "jsx", "decorators-legacy"],
  plugins: ["@ianvs/prettier-plugin-sort-imports"],
}

type OptionName =
  | "callees"
  | "ignoredKeys"
  | "classRegex"
  | "cssFiles"
  | "cssFilesRefreshRate"
  | "removeDuplicates"
  | "skipClassAttribute"
  | "tags"
  | "whitelist"

type TailwindSettings = {
  tailwindcss?: Partial<Record<OptionName, unknown>>
}

type ESLintContext = {
  options: Array<Record<string, unknown>>
  settings?: TailwindSettings
}

function getOption(context: ESLintContext, name: OptionName): unknown {
  // Options (defined at rule level)
  const options = context.options[0] || {}
  if (options[name] !== undefined) {
    return options[name]
  }

  // Settings (defined at plugin level, shared across rules)
  if (context.settings.tailwindcss?.[name] !== undefined) {
    return context.settings.tailwindcss[name]
  }

  // Fallback to defaults
  switch (name) {
    case "callees":
      return ["classnames", "clsx", "ctl", "cva", "tv"]
    case "ignoredKeys":
      return ["compoundVariants", "defaultVariants"]
    case "classRegex":
      return "^class(Name)?$"
    case "cssFiles":
      return ["**/*.css", "!**/node_modules", "!**/.*", "!**/dist", "!**/build"]
    case "cssFilesRefreshRate":
      return 5_000
    case "removeDuplicates":
      return true
    case "skipClassAttribute":
      return false
    case "tags":
      return []
    case "whitelist":
      return []
    default: {
      name satisfies never
      return []
    }
  }
}

export default getOption

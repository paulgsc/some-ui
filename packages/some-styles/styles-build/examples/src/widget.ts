// Scan fixture for the single-pass compiler, authored the way a component
// would use these classes. compile.mjs scans file TEXT for class candidates,
// so no framework is needed here — what matters is that every class is a
// complete literal string (the tailwind-idiom/no-interpolated-classname
// rule's requirement): a container with static + arbitrary-value utilities,
// and a lookup table of whole class strings selected at runtime.

export const CONTAINER =
  "flex items-center gap-[6px] rounded-lg p-[9px] text-[13px]"

export const STATE_CLASS: Record<"on" | "off", string> = {
  on: "bg-primary text-primary-foreground",
  off: "bg-muted text-muted-foreground",
}

export function widgetClass(active: boolean): string {
  return `${CONTAINER} ${STATE_CLASS[active ? "on" : "off"]}`
}

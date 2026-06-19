import { themes } from "@some-ui/styles"
import type { Decorator } from "@storybook/react-vite"
import { cn } from "some-ui-utils"

/**
 * Storybook toolbar controls for the design system: a light/dark mode toggle
 * and a theme picker driven by the `@some-ui/styles` theme registry, so the
 * list stays in sync with the shipped themes automatically.
 */
export const themeGlobalTypes = {
  mode: {
    name: "Mode",
    description: "Light / dark",
    defaultValue: "light",
    toolbar: {
      icon: "mirror",
      dynamicTitle: true,
      items: [
        { value: "light", title: "Light", icon: "sun" },
        { value: "dark", title: "Dark", icon: "moon" },
      ],
    },
  },
  theme: {
    name: "Theme",
    description: "Design theme",
    defaultValue: "none",
    toolbar: {
      icon: "paintbrush",
      dynamicTitle: true,
      items: [
        { value: "none", title: "None" },
        ...themes.map((t) => ({
          value: t.id,
          title: `${t.label} · ${t.kind}`,
        })),
      ],
    },
  },
}

/**
 * Applies the selected mode + theme to a wrapper around every story.
 *
 * - `dark` toggles the color scheme.
 * - Color themes (`.theme-blue`) restyle `--primary` on a `.theme-container`
 *   descendant, so the wrapper carries the theme class and an inner element
 *   carries `theme-container`.
 * - App themes (`.scheduler`, `.code`) are full palettes applied to the same
 *   wrapper.
 */
export const withTheme: Decorator = (Story, context) => {
  const mode = String(context.globals.mode ?? "light")
  const themeId = String(context.globals.theme ?? "none")
  const meta = themes.find((t) => t.id === themeId)

  return (
    <div
      className={cn(
        "min-h-screen bg-background text-foreground",
        mode === "dark" && "dark",
        meta?.className
      )}
      style={{ padding: "1.5rem" }}
    >
      <div className="theme-container">
        <Story />
      </div>
    </div>
  )
}

import {
  ACCENT_THEMES,
  applyPreference,
  FEATURE_APPEARANCES,
  isThemePreference,
  SESSION_THEMES,
  SYSTEM_PREFERENCE,
} from "@some-ui/styles/theme"
import type { Decorator } from "@storybook/react-vite"
import { cn } from "some-ui-utils"

/**
 * Storybook toolbar controls, one per layer of the theme protocol
 * (`@some-ui/styles/theme`). Every list is generated from the canonical
 * registry, so the toolbar and apps/www's switcher can never offer different
 * themes.
 *
 * The three controls are separate because the layers compose differently, and
 * collapsing them is what let the old "mode + theme" pair imply things that
 * are not true — that `.code` is a peer of `.dark`, or that a component
 * wrapped in an app-specific class is demonstrating theme *inheritance*.
 *
 * - **Session** is the user's palette. It goes on the document root, exactly
 *   where a real host puts it, so a story proves the thing that actually
 *   matters: does this component follow the ambient boundary?
 * - **Appearance** is an opt-in feature palette on a *nested* wrapper — what a
 *   host does when it deliberately wants a self-contained branded surface.
 *   Leaving it at "inherit" is the reusable default.
 * - **Accent** layers a `--primary` family onto `.theme-container`.
 */
export const themeGlobalTypes = {
  session: {
    name: "Session",
    description: "User theme (applied to the document root, as a host would)",
    defaultValue: SYSTEM_PREFERENCE,
    toolbar: {
      icon: "mirror",
      dynamicTitle: true,
      // Deliberately the *same* option set as apps/www's ThemeSwitcher —
      // "System" plus every selectable palette — because Storybook is a dev
      // server for these components and a theme you can only reach in one of
      // the two servers is a theme nobody checks their work against.
      items: [
        { value: SYSTEM_PREFERENCE, title: "System" },
        ...SESSION_THEMES.map((t) => ({ value: t.id, title: t.label })),
      ],
    },
  },
  appearance: {
    name: "Appearance",
    description: "Opt-in feature palette on a nested boundary",
    defaultValue: "inherit",
    toolbar: {
      icon: "paintbrush",
      dynamicTitle: true,
      items: [
        { value: "inherit", title: "Inherit" },
        ...FEATURE_APPEARANCES.map((t) => ({ value: t.id, title: t.label })),
      ],
    },
  },
  accent: {
    name: "Accent",
    description: "Primary-color overlay on .theme-container",
    defaultValue: "none",
    toolbar: {
      icon: "contrast",
      dynamicTitle: true,
      items: [
        { value: "none", title: "None" },
        ...ACCENT_THEMES.map((t) => ({ value: t.id, title: t.label })),
      ],
    },
  },
}

/**
 * Applies the selected session theme to `<html>` and wraps the story in the
 * selected appearance / accent boundaries.
 *
 * The session theme goes on the real document root rather than on the wrapper.
 * That is the point: a component that renders correctly here is one that
 * inherits its tokens across an arbitrary depth of DOM, which is the property
 * the protocol is built to guarantee. A wrapper-scoped class would pass even
 * for a component that only works when the theme is its immediate parent.
 *
 * `parameters.neutralCanvas` opts a story out of all of the above (#735):
 * the toolbar globals persist across Storybook sessions, so a story reviewed
 * after someone left the toolbar on "Dark" gets wrapped in a near-black canvas
 * it never asked for. Harmless for ordinary component stories, but Comfort
 * Lab's fixtures are explicit-background HTML a human is asked to eye-score in
 * isolation — a dark surround around a white fixture biases that judgment
 * (simultaneous contrast) regardless of what the fixture's own DOM says.
 * Render the story with no wrapper at all so the canvas stays neutral no
 * matter what the toolbar is set to.
 */
export const withTheme: Decorator = (Story, context) => {
  if (context.parameters.neutralCanvas === true) {
    // The session theme now lands on the document root rather than on this
    // wrapper, so "render no wrapper" is no longer enough to neutralise the
    // canvas — a previously-rendered story would have left `.dark` on <html>
    // and it would show through. Pin the root to light for these.
    if (typeof document !== "undefined") {
      applyPreference(document.documentElement, "light")
    }
    return <Story />
  }

  const sessionId = String(context.globals.session ?? SYSTEM_PREFERENCE)
  const appearanceId = String(context.globals.appearance ?? "inherit")
  const accentId = String(context.globals.accent ?? "none")

  const appearance = FEATURE_APPEARANCES.find((t) => t.id === appearanceId)
  const accent = ACCENT_THEMES.find((t) => t.id === accentId)

  // The same controller call apps/www's provider makes, against the same
  // element — including "system", which resolves through the same OS-preference
  // path. Storybook owns no theme logic of its own.
  if (typeof document !== "undefined") {
    applyPreference(
      document.documentElement,
      isThemePreference(sessionId) ? sessionId : SYSTEM_PREFERENCE
    )
  }

  return (
    <div
      className={cn(
        "min-h-screen bg-background text-foreground",
        appearance?.boundary.classNames,
        accent?.boundary.classNames
      )}
      data-appearance={appearance?.boundary.dataTheme}
      style={{ padding: "1.5rem" }}
    >
      <div className="theme-container">
        <Story />
      </div>
    </div>
  )
}

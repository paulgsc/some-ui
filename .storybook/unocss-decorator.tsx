import { useEffect } from "react"
import type { Decorator } from "@storybook/react-vite"

/**
 * UnoCSS's generated stylesheet (`virtual:uno.css`) is a single global CSS
 * file — scoping `content.pipeline.include` in `.storybook/uno.config.ts`
 * only controls which source files UnoCSS *scans* to decide what utilities
 * to generate, not where the resulting CSS *applies*. Once loaded, it styles
 * any element in the page with a matching class name, regardless of which
 * story is on screen.
 *
 * Extension stories and the design-system catalog are the only consumers
 * that actually need it (see uno.config.ts's include patterns), so it's
 * loaded lazily, only for those stories, instead of unconditionally in
 * preview.tsx — everything else (all of `packages/ui/**`, which is meant to
 * be pure Tailwind) never pulls it in and can't collide with it.
 */
const UNOCSS_SCOPED_TITLE_PREFIXES = ["Extensions/", "Design System/"]

let unoCssRequested = false

const UnoCssLoader = ({ enabled }: { enabled: boolean }): null => {
  useEffect(() => {
    if (!enabled || unoCssRequested) return
    unoCssRequested = true
    // eslint-disable-next-line import/no-unresolved -- virtual module provided by the UnoCSS vite plugin
    void import("virtual:uno.css")
  }, [enabled])

  return null
}

export const withUnoCss: Decorator = (Story, context) => {
  const needsUnoCss = UNOCSS_SCOPED_TITLE_PREFIXES.some((prefix) =>
    context.title.startsWith(prefix)
  )

  return (
    <>
      <UnoCssLoader enabled={needsUnoCss} />
      <Story />
    </>
  )
}

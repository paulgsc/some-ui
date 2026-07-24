import { createContext, useContext } from "react"
import type { ComponentType, JSX } from "react"

/**
 * The current session's identity, for registry components that need to
 * distinguish "a new session started" from "the same session continues" -
 * e.g. a stateful WASM engine singleton deciding whether to reset. Plain
 * `session.id`; this module doesn't interpret it, only carries it.
 */
const SessionKeyContext = createContext<string | undefined>(undefined)

export const SessionKeyProvider = SessionKeyContext.Provider

type SessionScopedProps = { sessionKey?: string }

/**
 * A stable, module-scope enhancer (not a factory - used directly as
 * `enhanceComponent={withSessionKey}`, never `withSessionKey(x)`) that
 * injects the current session's identity as a `sessionKey` prop.
 *
 * This must read the value live via context inside the wrapper's own render,
 * not close over a parameter the way `withFocus(region)` closes over
 * `region` - the registry renderer's enhancer cache
 * (`renderer.tsx::getEnhanced`) keys only by the wrapped component, not by
 * which enhancer produced the wrapper, so a wrapper built from a
 * closure-captured value would keep injecting whatever session was current
 * the *first* time this component was ever rendered. Reading through
 * context instead means the wrapper type stays stable (cache-friendly)
 * while its output still reflects whichever session is live right now.
 */
export function withSessionKey<P extends object>(
  Component: ComponentType<P & SessionScopedProps>
): ComponentType<P & SessionScopedProps> {
  const SessionKeyWrapped = (props: P & SessionScopedProps): JSX.Element => {
    const sessionKey = useContext(SessionKeyContext)
    return <Component {...props} sessionKey={sessionKey} />
  }

  SessionKeyWrapped.displayName = `withSessionKey(${Component.displayName || Component.name || "Component"})`

  return SessionKeyWrapped
}

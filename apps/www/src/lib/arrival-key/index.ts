import { useState } from "react"

/**
 * A number that moves each time a new request arrives in `request`: a value
 * appearing, or changing to another. Its going away (a page clearing the
 * request once honoured) is not an arrival and leaves the number as it was.
 *
 * For keying a component that reads its request once, on mount. The
 * soundbites page is one: "Talk now" while already on that page changes only
 * the search, and without a new key the mounted recorder would ignore it.
 * Clearing `?say=` once listening starts must not remount it mid-take.
 *
 * The previous request is kept in state and compared during render, React's
 * own pattern for state derived from a changing prop.
 */
export function useArrivalKey(request: string | undefined): number {
  // eslint-disable-next-line owner-guard/no-mount-snapshot -- the previous request, compared against the live one on every render below
  const [seen, setSeen] = useState({ request, key: 0 })
  if (request === seen.request) return seen.key
  const next = {
    request,
    key: request === undefined ? seen.key : seen.key + 1,
  }
  setSeen(next)
  return next.key
}

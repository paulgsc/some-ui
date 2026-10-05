import { useState } from "react"

/**
 * A number that moves each time a new request arrives in `request` (a value
 * appearing or changing); its going away leaves the number as it was.
 *
 * For keying a component that reads its request once (the soundbites
 * recorder: "Talk now" while on the page must remount it; clearing `?say=`
 * must not). Uses React's state-derived-from-prop pattern.
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

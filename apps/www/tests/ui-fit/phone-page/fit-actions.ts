/**
 * What a stays-put walk does to a fixture that no tap on its screen does (a
 * save refused, home answering, the phone filling up): a control for it
 * would be one more target. The spec calls one by name with one argument it
 * serializes (`happens`, `../harness.ts`).
 */
import { useEffect } from "react"

/** A fixture's actions, by name, each taking at most one argument. */
export type FitActions = Readonly<Record<string, (arg: never) => void>>

declare global {
  // eslint-disable-next-line @typescript-eslint/consistent-type-definitions -- only an interface merges into Window
  interface Window {
    /** Set while a fixture that has actions is mounted. */
    fitActions?: FitActions
  }
}

/** Hands the spec `actions` while the fixture is mounted. */
export function useFitActions(actions: FitActions): void {
  useEffect(() => {
    window.fitActions = actions
    return (): void => {
      delete window.fitActions
    }
  })
}

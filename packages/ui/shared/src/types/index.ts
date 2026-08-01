import type { CSSProperties } from "react"

export * from "./icons"

/**
 * Lets a `style` object carry CSS custom properties without an `as` cast.
 *
 * The dist-built UI workspaces get this from a global `declare module "react"`
 * augmentation (`src/types/react-css-vars.d.ts`). That idiom does not work
 * here: this workspace is consumed from source (`main: ./src/index.ts`), so
 * consumers type-check these files without ever loading an ambient `.d.ts`
 * that nothing imports. A plain alias travels with the source instead.
 */
export type CSSVarProperties = CSSProperties &
  Record<`--${string}`, string | number | undefined>

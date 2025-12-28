import type { ZodIssue } from "zod"
import { z } from "zod"

/**
 * Content item schema - mirrors WasmItem in Rust
 */
export const WasmItemSchema = z.object({
  kind: z.string().optional(),
  props: z.record(z.string(), z.unknown()).optional(),
  contentIndex: z.number().int().nonnegative(),
  durationMs: z.number().int().nonnegative(),
})

export type WasmItem = z.infer<typeof WasmItemSchema>

/**
 * Polyhedron type schema - mirrors WasmPolyhedronType in Rust
 */
export const WasmPolyhedronTypeSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("cube") }),
  z.object({ type: z.literal("hexPrism") }),
  z.object({
    type: z.literal("carousel"),
    faces: z.number().int().min(1),
  }),
])

export type WasmPolyhedronType = z.infer<typeof WasmPolyhedronTypeSchema>

export const WasmCycleNameSchema = z.enum([
  "cube:y",
  "cube:x",
  "hex:circumference",
  "hex:vertical",
  "carousel:circular",
])

export type WasmCycleName = z.infer<typeof WasmCycleNameSchema>

/**
 * Transition schema - mirrors WasmTransition in Rust
 */
export const WasmTransitionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("nextItem") }),
  z.object({ type: z.literal("rotateNext") }),
  z.object({ type: z.literal("rotatePrev") }),
  z.object({
    type: z.literal("jumpToFace"),
    face: z.number().int().nonnegative(),
  }),
  z.object({
    type: z.literal("switchCycle"),
    index: z.number().int().nonnegative(),
  }),
  z.object({
    type: z.literal("switchCycleByKind"),
    cycle_name: WasmCycleNameSchema,
  }),
  z.object({
    type: z.literal("jumpToContent"),
    index: z.number().int().nonnegative(),
  }),
])

export type WasmTransition = z.infer<typeof WasmTransitionSchema>

/**
 * Viewport state schema - mirrors WasmViewportState in Rust
 */
export const WasmViewportStateSchema = z.object({
  faceLayout: z.array(z.array(z.number().int().nonnegative())),
  activeFace: z.number().int().nonnegative(),
  activeItemInFace: z.number().int().nonnegative(),
  cursor: z.number().int().nonnegative(),
  cycleIndex: z.number().int().nonnegative(),
  cyclePosition: z.number().int().nonnegative(),
  cycleLength: z.number().int().nonnegative(),
  cycleName: WasmCycleNameSchema,
  progress: z.number().min(0).max(1),
})

export type WasmViewportState = z.infer<typeof WasmViewportStateSchema>

/**
 * Viewport configuration schema (TypeScript-only, for initialization)
 */
export const ViewportConfigSchema = z.object({
  id: z.string().min(1),
  items: z.array(WasmItemSchema).min(1),
  polyhedron: WasmPolyhedronTypeSchema,
  cycleName: WasmCycleNameSchema,
  faceCapacity: z.number().int().min(1),
})

export type ViewportConfig = z.infer<typeof ViewportConfigSchema>

/**
 * Type guards using schemas
 */
export const isWasmItem = (value: unknown): value is WasmItem => {
  return WasmItemSchema.safeParse(value).success
}

export const isWasmPolyhedronType = (
  value: unknown
): value is WasmPolyhedronType => {
  return WasmPolyhedronTypeSchema.safeParse(value).success
}

export const isWasmTransition = (value: unknown): value is WasmTransition => {
  return WasmTransitionSchema.safeParse(value).success
}

export const isWasmViewportState = (
  value: unknown
): value is WasmViewportState => {
  return WasmViewportStateSchema.safeParse(value).success
}

export const isViewportConfig = (value: unknown): value is ViewportConfig => {
  return ViewportConfigSchema.safeParse(value).success
}

/**
 * Validation utilities
 */
export function validateWasmItem(value: unknown): WasmItem {
  return WasmItemSchema.parse(value)
}

export function validateWasmItems(value: unknown): Array<WasmItem> {
  return z.array(WasmItemSchema).parse(value)
}

export function validateWasmPolyhedronType(value: unknown): WasmPolyhedronType {
  return WasmPolyhedronTypeSchema.parse(value)
}

export function validateWasmTransition(value: unknown): WasmTransition {
  return WasmTransitionSchema.parse(value)
}

export function validateWasmViewportState(value: unknown): WasmViewportState {
  return WasmViewportStateSchema.parse(value)
}

export function validateViewportConfig(value: unknown): ViewportConfig {
  return ViewportConfigSchema.parse(value)
}

/**
 * Safe parsing with error messages
 */
export function safeParseViewportConfig(
  value: unknown
): { success: true; data: ViewportConfig } | { success: false; error: string } {
  const result = ViewportConfigSchema.safeParse(value)

  if (result.success) {
    return { success: true, data: result.data }
  }

  return {
    success: false,
    error: result.error.issues
      .map((e: ZodIssue) => `${e.path.join(".")}: ${e.message}`)
      .join(", "),
  }
}

/**
 * Factory helpers with validation
 */
export const PolyhedronFactory = {
  cube: (): WasmPolyhedronType => {
    return WasmPolyhedronTypeSchema.parse({ type: "cube" })
  },

  hexPrism: (): WasmPolyhedronType => {
    return WasmPolyhedronTypeSchema.parse({ type: "hexPrism" })
  },

  carousel: (faces: number): WasmPolyhedronType => {
    return WasmPolyhedronTypeSchema.parse({ type: "carousel", faces })
  },
} as const

export const TransitionFactory = {
  nextItem: (): WasmTransition => ({ type: "nextItem" }),
  rotateNext: (): WasmTransition => ({ type: "rotateNext" }),
  rotatePrev: (): WasmTransition => ({ type: "rotatePrev" }),
  jumpToFace: (face: number): WasmTransition => ({ type: "jumpToFace", face }),
  switchCycle: (index: number): WasmTransition => ({
    type: "switchCycle",
    index,
  }),
  switchCycleByKind: (cycle_name: WasmCycleName): WasmTransition => ({
    type: "switchCycleByKind",
    cycle_name,
  }),
  jumpToContent: (index: number): WasmTransition => ({
    type: "jumpToContent",
    index,
  }),
} as const

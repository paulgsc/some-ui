/**
 * @module conformance
 *
 * Compares a response body against the schema the client believes describes it,
 * and reports the two kinds of divergence that ordinary validation cannot see.
 *
 * `schema.parse(body)` answers one question: is this body acceptable? That is
 * not the question a boundary check is asking. Two failure modes pass
 * validation while the two sides are meaningfully out of step:
 *
 * **Unknown fields.** zod strips keys it does not declare. A server that grows
 * a field keeps validating cleanly forever, so the client never learns there is
 * something new to consume.
 *
 * **Phantom fields.** A field declared `.optional()` that the server never
 * sends also validates cleanly, forever. This is not hypothetical here:
 * `MoodEventSchema` in `packages/ui/nfl/src/hooks/hopium/use-hopium-queries.ts`
 * declares `time: z.string().optional()`, and the server's `MoodEvent` has no
 * `time` field at all. A pure pass/fail check scores that boundary as healthy.
 *
 * Both are reported rather than failed by default, because both are usually
 * "the other side moved and you have not caught up yet" rather than "this is
 * broken right now".
 *
 * # Deliberate limits
 *
 * Unions and records are walked into but not audited for unknown keys: for a
 * union there is no single declared shape to diff against, and for a record the
 * keys are data, so an "undeclared" key is meaningless. Those subtrees are
 * counted in `opaqueSubtrees` so a report can say what it did not look at
 * instead of implying clean coverage.
 */

import type { z } from "zod"

export type FieldFinding = {
  kind: "unknown-field" | "phantom-field"
  /** Dotted path, with `[]` marking array traversal, e.g. `items[].label`. */
  path: string
  /** How many sampled values the judgement is based on. */
  samples: number
}

export type ConformanceResult = {
  /** Whether `schema.parse` accepted the body. */
  valid: boolean
  /** zod issues, flattened to `path: message`. Empty when `valid`. */
  issues: Array<string>
  /** Fields the server sent that the schema does not declare. */
  unknownFields: Array<FieldFinding>
  /** Optional fields the schema declares that no sampled value carried. */
  phantomFields: Array<FieldFinding>
  /**
   * How many values the walk actually inspected. Zero means the response was
   * an empty collection and the field findings prove nothing — reported so an
   * empty result is not mistaken for a clean one.
   */
  sampleCount: number
  /** Paths skipped because their schema has no single declared shape. */
  opaqueSubtrees: Array<string>
}

/*
 * Reading zod's runtime structure.
 *
 * These read schemas as plain values rather than casting to a mirror of zod's
 * internal types. The property names (`def.type`, `shape`, `element`) are the
 * stable, documented introspection surface; the layout underneath them is not.
 * Narrowing with `in` means an unexpected shape degrades into "cannot see
 * inside this node" and the walk simply reports less, instead of throwing on a
 * cast that turned out to be a lie.
 */

type SchemaDef = { type: string; innerType: unknown }

function readDef(schema: unknown): SchemaDef | undefined {
  if (typeof schema !== "object" || schema === null || !("def" in schema)) {
    return undefined
  }
  const { def } = schema
  if (typeof def !== "object" || def === null || !("type" in def)) {
    return undefined
  }
  const { type } = def
  if (typeof type !== "string") return undefined
  return { type, innerType: "innerType" in def ? def.innerType : undefined }
}

function readShape(
  schema: unknown
): ReadonlyArray<readonly [string, unknown]> | undefined {
  if (typeof schema !== "object" || schema === null || !("shape" in schema)) {
    return undefined
  }
  const { shape } = schema
  if (typeof shape !== "object" || shape === null) return undefined
  return Object.keys(shape).map((key): readonly [string, unknown] => [
    key,
    Object.getOwnPropertyDescriptor(shape, key)?.value,
  ])
}

function readElement(schema: unknown): unknown {
  if (typeof schema !== "object" || schema === null || !("element" in schema)) {
    return undefined
  }
  return schema.element
}

const WRAPPERS_MAKING_OPTIONAL = new Set(["optional", "default", "prefault"])
const TRANSPARENT_WRAPPERS = new Set([
  "nullable",
  "readonly",
  "catch",
  "nonoptional",
  "lazy",
])

type Peeled = { node: unknown; optional: boolean }

/**
 * Strips wrapper types down to the schema that actually describes structure,
 * remembering whether anything on the way made the value omittable.
 */
function peel(schema: unknown): Peeled {
  let node = schema
  let optional = false

  // Bounded rather than `while (true)`: a self-referential lazy schema would
  // otherwise spin here, and a stack overflow is a worse diagnostic than a
  // slightly incomplete walk.
  for (let depth = 0; depth < 32; depth += 1) {
    const def = readDef(node)
    if (def?.innerType === undefined) break

    if (WRAPPERS_MAKING_OPTIONAL.has(def.type)) {
      optional = true
      node = def.innerType
      continue
    }
    if (TRANSPARENT_WRAPPERS.has(def.type)) {
      node = def.innerType
      continue
    }
    break
  }

  return { node, optional }
}

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

type Walker = {
  /** For each declared-optional path: how often looked for, how often found. */
  declaredOptional: Map<string, { seen: number; present: number }>
  /** For each undeclared path the server sent: how many times seen. */
  unknown: Map<string, number>
  opaque: Set<string>
}

function walk(
  schema: unknown,
  value: unknown,
  path: string,
  acc: Walker
): void {
  const { node } = peel(schema)
  const type = readDef(node)?.type

  if (type === "object") {
    if (!isPlainObject(value)) return

    const shape = readShape(node) ?? []
    const declared = new Set(shape.map(([key]) => key))

    for (const [key, child] of shape) {
      const childPath = path === "" ? key : `${path}.${key}`
      const present = Object.hasOwn(value, key)

      if (peel(child).optional) {
        const stat = acc.declaredOptional.get(childPath) ?? {
          seen: 0,
          present: 0,
        }
        stat.seen += 1
        if (present) stat.present += 1
        acc.declaredOptional.set(childPath, stat)
      }

      if (present) walk(child, value[key], childPath, acc)
    }

    for (const key of Object.keys(value)) {
      if (declared.has(key)) continue
      const childPath = path === "" ? key : `${path}.${key}`
      acc.unknown.set(childPath, (acc.unknown.get(childPath) ?? 0) + 1)
    }
    return
  }

  if (type === "array") {
    if (!Array.isArray(value)) return
    const element = readElement(node)
    if (element === undefined) return
    for (const item of value) walk(element, item, `${path}[]`, acc)
    return
  }

  if (type === "union" || type === "record" || type === "tuple") {
    // No single declared shape to diff against — see the module note.
    if (isPlainObject(value) || Array.isArray(value)) {
      acc.opaque.add(path === "" ? "<root>" : path)
    }
  }
}

/** How many top-level values a result represents, for honest sample counts. */
function countSamples(schema: unknown, value: unknown): number {
  const { node } = peel(schema)
  if (readDef(node)?.type === "array" && Array.isArray(value)) {
    return value.length
  }
  return value === undefined || value === null ? 0 : 1
}

export function checkConformance<T>(
  schema: z.ZodType<T>,
  body: unknown
): ConformanceResult {
  const parsed = schema.safeParse(body)

  const issues = parsed.success
    ? []
    : parsed.error.issues.map((issue) => {
        const where = issue.path.length > 0 ? issue.path.join(".") : "<root>"
        return `${where}: ${issue.message}`
      })

  const acc: Walker = {
    declaredOptional: new Map(),
    unknown: new Map(),
    opaque: new Set(),
  }

  // Walk the raw body, not the parsed one — parsing is what strips the unknown
  // keys this is trying to find. Runs even when validation failed, since a
  // renamed field shows up as both a violation and an unknown key, and seeing
  // the pair together is what makes the rename obvious.
  walk(schema, body, "", acc)

  const sampleCount = countSamples(schema, body)

  const phantomFields: Array<FieldFinding> = [...acc.declaredOptional.entries()]
    .filter(([, stat]) => stat.seen > 0 && stat.present === 0)
    .map(([path, stat]) => ({
      kind: "phantom-field" as const,
      path,
      samples: stat.seen,
    }))
    .sort((a, b) => a.path.localeCompare(b.path))

  const unknownFields: Array<FieldFinding> = [...acc.unknown.entries()]
    .map(([path, samples]) => ({
      kind: "unknown-field" as const,
      path,
      samples,
    }))
    .sort((a, b) => a.path.localeCompare(b.path))

  return {
    valid: parsed.success,
    issues,
    unknownFields,
    phantomFields,
    sampleCount,
    opaqueSubtrees: [...acc.opaque].sort(),
  }
}

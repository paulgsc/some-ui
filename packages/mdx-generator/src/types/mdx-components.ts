import { ComponentType } from "react"
import type { Node } from "unist-builder"
import { z } from "zod"

export type MDXComponentsProps = Record<string, ComponentType>

export type MdxProps = {
  code: string
  component?: MDXComponentsProps
}

const eventSchema = z.object({
  name: z.enum([
    "copy_npm_command",
    "copy_usage_import_code",
    "copy_usage_code",
    "copy_primitive_code",
    "copy_theme_code",
    "copy_block_code",
    "copy_chunk_code",
    "enable_lift_mode",
  ]),
  // declare type AllowedPropertyValues = string | number | boolean | null
  properties: z
    .record(z.union([z.string(), z.number(), z.boolean(), z.null()]))
    .optional(),
})

export type Event = z.infer<typeof eventSchema>

export interface UnistNode extends Node {
  type: string
  name?: string
  tagName?: string
  value?: string
  properties?: {
    __rawString__?: string
    __className__?: string
    __event__?: string
    [key: string]: unknown
  } & NpmCommands
  attributes?: Array<{
    name: string
    value: unknown
    type?: string
  }>
  children?: Array<UnistNode>
}

export interface UnistTree extends Node {
  children: Array<UnistNode>
}

export interface NpmCommands {
  __npmCommand__?: string
  __yarnCommand__?: string
  __pnpmCommand__?: string
  __bunCommand__?: string
}

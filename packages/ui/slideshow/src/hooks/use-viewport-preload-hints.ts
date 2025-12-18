import { useEffect } from "react"
import type { ComponentType, LazyExoticComponent } from "react"
import type { ViewportConfig } from "some-types-utils"

export type RegistryEntry = {
  Component: LazyExoticComponent<ComponentType<any>>
  preload: () => Promise<{ default: ComponentType<any> }>
}

export type ComponentRegistry = Record<string, RegistryEntry>

type Args = {
  viewportConfig: ViewportConfig
  cursor: number
  facesAhead: number
  registry: ComponentRegistry
}

export function useViewportPreloadHints({
  viewportConfig,
  cursor,
  facesAhead,
  registry,
}: Args) {
  useEffect(() => {
    const { items, faceCapacity } = viewportConfig
    const currentFace = Math.floor(cursor / faceCapacity)

    const kinds = new Set<string>()

    for (let i = 1; i <= facesAhead; i++) {
      const start = (currentFace + i) * faceCapacity
      const end = Math.min(start + faceCapacity, items.length)

      for (let j = start; j < end; j++) {
        const kind = items[j]?.kind
        if (kind) kinds.add(kind)
      }
    }

    kinds.forEach((kind) => {
      registry[kind].preload()
    })
  }, [cursor, facesAhead, viewportConfig, registry])
}

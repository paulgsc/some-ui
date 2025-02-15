import type { TSESTree } from "@typescript-eslint/typescript-estree"
import { __unstable__loadDesignSystem } from "tailwindcss"

function loadDesign() {
  return __unstable__loadDesignSystem(`
                                            @theme {
                                                    --spacing-1: 0.25rem;
                                                          --spacing-3: 0.75rem;
                                                                --spacing-4: 1rem;
                                                                      --color-red-500: red;
                                                                            --color-blue-500: blue;
                                                                                }
                                                                                  `)
}
const design = await loadDesign()
type DesignSystem = typeof design

// Simplified version inspired by Tailwind's AST
type TailwindClass = {
  kind: "class"
  name: string
  variants: Array<string>
  importance: "normal" | "important"
}

type ClassGroup = {
  kind: "group"
  prefix: string
  classes: Array<TailwindClass>
}

type ClassNode = TailwindClass | ClassGroup

export class TailwindClassParser {
  private static variantRegex = /^([^:]+:)*([^:]+)$/

  /**
   * Extract className from JSX element
   */
  static extractClassNameFromJSX(node: TSESTree.JSXElement): string | null {
    const classNameAttr = node.openingElement.attributes.find(
      (attr): attr is TSESTree.JSXAttribute =>
        attr.type === "JSXAttribute" &&
        attr.name.type === "JSXIdentifier" &&
        attr.name.name === "className"
    )

    if (!classNameAttr?.value || classNameAttr.value.type !== "Literal") {
      return null
    }

    return String(classNameAttr.value.value)
  }

  /**
   * Parse className string into structured format
   */
  static parseClasses(classNames: string): Array<ClassNode> {
    const classes = classNames.split(/\s+/).filter(Boolean)

    return classes
      .map((cls) => {
        const match = cls.match(this.variantRegex)
        if (!match) return null

        const [, variantGroup, baseName] = match
        const variants = variantGroup
          ? variantGroup.slice(0, -1).split(":")
          : []

        return {
          kind: "class",
          name: baseName,
          variants,
          importance: cls.endsWith("!") ? "important" : "normal",
        }
      })
      .filter((cls): cls is TailwindClass => cls !== null)
  }

  /**
   * Group classes by their prefix (e.g., 'p-', 'm-', etc.)
   */
  static groupClasses(classes: Array<TailwindClass>): Array<ClassGroup> {
    const groups = new Map<string, Array<TailwindClass>>()

    for (const cls of classes) {
      const prefix = cls.name.split("-")[0] + "-"
      if (!groups.has(prefix)) {
        groups.set(prefix, [])
      }
      groups.get(prefix)!.push(cls)
    }

    return Array.from(groups.entries()).map(([prefix, classes]) => ({
      kind: "group",
      prefix,
      classes: classes.sort((a, b) => {
        // Sort by variants first, then by name
        if (a.variants.length !== b.variants.length) {
          return a.variants.length - b.variants.length
        }
        return a.name.localeCompare(b.name)
      }),
    }))
  }

  /**
   * Sort classes according to Tailwind's recommended order
   */
  static sortClasses(input: string, design: DesignSystem) {
    return defaultSort(design.getClassOrder(input.split(" ")))
  }
}

function defaultSort(arrayOfTuples: Array<[string, bigint | null]>): string {
  return arrayOfTuples
    .sort(([, a], [, z]) => {
      if (a === z) return 0
      if (a === null) return -1
      if (z === null) return 1
      return bigSign(a - z)
    })
    .map(([className]) => className)
    .join(" ")
}

function bigSign(value: bigint) {
  if (value > 0n) {
    return 1
  } else if (value === 0n) {
    return 0
  }
  return -1
}

import type { TSESTree } from "@typescript-eslint/typescript-estree"
import { __unstable__loadDesignSystem } from "tailwindcss"
import { describe, expect, it } from "vitest"

import { TailwindClassParser } from "./parsers"

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

describe("TailwindClassParser", () => {
  describe("extractClassNameFromJSX", () => {
    it("should extract className from JSX element", () => {
      const jsxNode: TSESTree.JSXElement = {
        type: "JSXElement",
        openingElement: {
          type: "JSXOpeningElement",
          name: { type: "JSXIdentifier", name: "div" },
          attributes: [
            {
              type: "JSXAttribute",
              name: { type: "JSXIdentifier", name: "className" },
              value: { type: "Literal", value: "text-red-500 px-4" },
            },
          ],
        },
        children: [],
        closingElement: null,
      }
      expect(TailwindClassParser.extractClassNameFromJSX(jsxNode)).toBe(
        "text-red-500 px-4"
      )
    })

    it("should return null if className is missing", () => {
      const jsxNode: TSESTree.JSXElement = {
        type: "JSXElement",
        openingElement: {
          type: "JSXOpeningElement",
          name: { type: "JSXIdentifier", name: "div" },
          attributes: [],
        },
        children: [],
        closingElement: null,
      }
      expect(TailwindClassParser.extractClassNameFromJSX(jsxNode)).toBeNull()
    })
  })

  describe("parseClasses", () => {
    it("should parse simple class names", () => {
      expect(TailwindClassParser.parseClasses("text-red-500 px-4")).toEqual([
        {
          kind: "class",
          name: "text-red-500",
          variants: [],
          importance: "normal",
        },
        { kind: "class", name: "px-4", variants: [], importance: "normal" },
      ])
    })

    it("should parse classes with variants", () => {
      expect(
        TailwindClassParser.parseClasses("hover:text-blue-500 sm:px-2")
      ).toEqual([
        {
          kind: "class",
          name: "text-blue-500",
          variants: ["hover"],
          importance: "normal",
        },
        { kind: "class", name: "px-2", variants: ["sm"], importance: "normal" },
      ])
    })

    it("should recognize important classes", () => {
      expect(TailwindClassParser.parseClasses("text-green-500!")).toEqual([
        {
          kind: "class",
          name: "text-green-500",
          variants: [],
          importance: "important",
        },
      ])
    })
  })

  describe("groupClasses", () => {
    it("should group classes by prefix", () => {
      const classes = TailwindClassParser.parseClasses("m-4 p-2 m-6 p-4")
      expect(TailwindClassParser.groupClasses(classes)).toEqual([
        {
          kind: "group",
          prefix: "m-",
          classes: [
            { kind: "class", name: "m-4", variants: [], importance: "normal" },
            { kind: "class", name: "m-6", variants: [], importance: "normal" },
          ],
        },
        {
          kind: "group",
          prefix: "p-",
          classes: [
            { kind: "class", name: "p-2", variants: [], importance: "normal" },
            { kind: "class", name: "p-4", variants: [], importance: "normal" },
          ],
        },
      ])
    })
  })

  describe("sortClasses", () => {
    it("should sort classes based on Tailwind order", async () => {
      expect(
        TailwindClassParser.sortClasses(
          "a-class px-3 p-1 b-class py-3 bg-red-500 bg-blue-500",
          await loadDesign()
        )
      ).toBe("a-class b-class bg-blue-500 bg-red-500 p-1 px-3 py-3")
    })
  })
})

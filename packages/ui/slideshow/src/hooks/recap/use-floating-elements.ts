import { useCallback, useEffect } from "react"

export type FloatingElementsConfig = {
  /** Array of text content to display in floating elements */
  content: Array<string>
  /** Maximum number of floating elements at once (default: 15) */
  maxElements?: number
  /** Interval between creating new elements in ms (default: 2000) */
  spawnInterval?: number
  /** Base animation duration in seconds (default: 15) */
  baseDuration?: number
  /** Random duration range to add to base duration (default: 10) */
  durationRange?: number
  /** Maximum animation delay in seconds (default: 2) */
  maxDelay?: number
  /** Element removal timeout in ms (default: 25000) */
  removalTimeout?: number
  /** CSS classes to apply to floating elements */
  className?: string
  /** Container element ID (default: "floating-elements") */
  containerId?: string
}

const DEFAULT_CONFIG: Required<Omit<FloatingElementsConfig, "content">> = {
  maxElements: 15,
  spawnInterval: 2000,
  baseDuration: 15,
  durationRange: 10,
  maxDelay: 2,
  removalTimeout: 25000,
  className:
    "absolute font-mono text-xs text-teal-400/10 animate-float pointer-events-none",
  containerId: "floating-elements",
}

/**
 * Hook for creating floating animated elements with customizable content and behavior
 */
export function useFloatingElements(config: FloatingElementsConfig): void {
  const {
    content,
    maxElements = DEFAULT_CONFIG.maxElements,
    spawnInterval = DEFAULT_CONFIG.spawnInterval,
    baseDuration = DEFAULT_CONFIG.baseDuration,
    durationRange = DEFAULT_CONFIG.durationRange,
    maxDelay = DEFAULT_CONFIG.maxDelay,
    removalTimeout = DEFAULT_CONFIG.removalTimeout,
    className = DEFAULT_CONFIG.className,
    containerId = DEFAULT_CONFIG.containerId,
  } = config

  const createFloatingElement = useCallback(() => {
    const container = document.getElementById(containerId)
    if (
      !container ||
      container.children.length >= maxElements ||
      content.length === 0
    ) {
      return
    }

    const element = document.createElement("div")
    element.className = className
    element.textContent =
      content[Math.floor(Math.random() * content.length)] ?? ""
    element.style.left = `${Math.random() * 100}vw`
    element.style.animationDuration = `${baseDuration + Math.random() * durationRange}s`
    element.style.animationDelay = `${Math.random() * maxDelay}s`

    container.appendChild(element)

    // Remove element after animation
    setTimeout(() => {
      if (element.parentNode) {
        element.parentNode.removeChild(element)
      }
    }, removalTimeout)
  }, [
    containerId,
    maxElements,
    content,
    className,
    baseDuration,
    durationRange,
    maxDelay,
    removalTimeout,
  ])

  useEffect(() => {
    if (content.length === 0) {
      return
    }

    const interval = setInterval(createFloatingElement, spawnInterval)
    return (): void => clearInterval(interval)
  }, [createFloatingElement, spawnInterval])
}

/**
 * Preset configurations for common use cases
 */
export const FloatingElementsPresets = {
  /** Code snippets for developer-themed backgrounds */
  codeSnippets: {
    content: [
      "const",
      "function",
      "{}",
      "=>",
      "async",
      "await",
      "import",
      "export",
      "[]",
      "()",
      "return",
      "if",
      "else",
      "for",
      "map",
      "filter",
      "reduce",
      "===",
      "!==",
      "&&",
      "||",
      "true",
      "false",
      "null",
      "undefined",
    ],
  } as FloatingElementsConfig,

  /** Mathematical symbols and equations */
  mathematics: {
    content: [
      "π",
      "∑",
      "∆",
      "∞",
      "α",
      "β",
      "γ",
      "θ",
      "λ",
      "μ",
      "σ",
      "φ",
      "∫",
      "∂",
      "√",
      "±",
      "≤",
      "≥",
      "≠",
      "≈",
      "∈",
      "∉",
      "⊂",
      "⊃",
    ],
    className:
      "absolute font-mono text-sm text-blue-400/10 animate-float pointer-events-none",
  } as FloatingElementsConfig,

  /** Design and UI elements */
  design: {
    content: [
      "✨",
      "🎨",
      "🌈",
      "💫",
      "⭐",
      "🔥",
      "💎",
      "🚀",
      "⚡",
      "💡",
      "🎯",
      "🎪",
      "🌟",
      "💥",
      "🎭",
      "🎨",
    ],
    className:
      "absolute text-lg text-purple-400/10 animate-float pointer-events-none",
    spawnInterval: 3000,
  } as FloatingElementsConfig,

  /** Minimal dots and shapes */
  minimal: {
    content: [
      "·",
      "○",
      "●",
      "◦",
      "◯",
      "▪",
      "▫",
      "◾",
      "◽",
      "▴",
      "▵",
      "▾",
      "▿",
    ],
    className:
      "absolute text-xs text-gray-400/5 animate-float pointer-events-none",
    maxElements: 25,
    spawnInterval: 1500,
  } as FloatingElementsConfig,

  /** Binary/tech themed */
  binary: {
    content: [
      "0",
      "1",
      "01",
      "10",
      "001",
      "010",
      "011",
      "100",
      "101",
      "110",
      "111",
    ],
    className:
      "absolute font-mono text-xs text-green-400/8 animate-float pointer-events-none",
    spawnInterval: 1000,
    maxElements: 20,
  } as FloatingElementsConfig,
}

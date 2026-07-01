import { useState } from "react"

type Theme = {
  name: string
  color: string
  temp: string
}

type UseThemeReturn = {
  theme: Theme | undefined
  themes: Array<Theme>
  currentTheme: number
  cycleTheme: () => void
}

export const useTheme = (): UseThemeReturn => {
  const themes = [
    { name: "Amber", color: "#eab308", temp: "hot" },
    { name: "Sky", color: "#0ea5e9", temp: "cool" },
    { name: "Purple", color: "#a855f7", temp: "cool" },
    { name: "Cyan", color: "#06b6d4", temp: "cool" },
  ]

  const [currentTheme, setCurrentTheme] = useState(0)

  const cycleTheme = (): void => {
    setCurrentTheme((prev) => (prev + 1) % themes.length)
  }

  return {
    theme: themes[currentTheme],
    themes,
    currentTheme,
    cycleTheme,
  }
}

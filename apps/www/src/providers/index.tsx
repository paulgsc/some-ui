import type { ReactNode } from "react"

import { QueryProvider } from "./tanstack-query"
import { TTSProvider } from "./tts"

export const AppProviders = ({ children }: { children: ReactNode }) => {
  return (
    <QueryProvider>
      <TTSProvider>{children}</TTSProvider>
    </QueryProvider>
  )
}

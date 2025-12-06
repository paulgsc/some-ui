import { useEffect, useState } from "react"
import { loadCodeFile } from "@input/lib/leetype/load-code-file"
import type { FormattedCodeState } from "@input/types/load-code-file"

type Options = {
  prettierParser: "typescript" | "babel" | "rust" | "cpp"
}

const MAX_RETRIES = 3
const TIMEOUT_MS = 5000

// Helper function for exponential backoff delay
function exponentialBackoff(attempt: number): Promise<void> {
  // Delay grows exponentially: (2^attempt * 100ms) + random jitter
  const baseDelay = 100 // ms
  const jitter = Math.random() * 100 // up to 100ms of random jitter
  const delay = Math.pow(2, attempt) * baseDelay + jitter
  console.log(`Attempt ${attempt} failed. Retrying in ${delay.toFixed(0)}ms...`)
  return new Promise((resolve) => setTimeout(resolve, delay))
}

const initialState: FormattedCodeState = {
  status: "IDLE",
  code: undefined,
  error: undefined,
  attempt: 0,
}

export function useFormattedCode(
  path: string,
  { prettierParser }: Options
): FormattedCodeState {
  const [state, setState] = useState<FormattedCodeState>(initialState)

  useEffect(() => {
    if (!path) {
      setState(initialState)
      return
    }

    let cancelled = false

    async function run() {
      // Reset state to LOADING on effect run
      setState({
        status: "LOADING",
        code: undefined,
        error: undefined,
        attempt: 1,
      })
      for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        // Update state with current attempt number
        setState((s) =>
          s.status === "LOADING"
            ? { ...s, attempt }
            : { status: "LOADING", code: undefined, error: undefined, attempt }
        )

        try {
          // 1. Set up Timeout (using Promise.race)
          const timeoutPromise = new Promise((_, reject) =>
            setTimeout(
              () => reject(new Error(`Timeout after ${TIMEOUT_MS}ms`)),
              TIMEOUT_MS
            )
          )

          const fetchAndFormatPromise = async (): Promise<string> => {
            // Step 1: Load File
            const raw = await loadCodeFile(path) // Step 2: Load Prettier Plugins (using Promise.all for concurrent loading)

            const [{ format }, { default: typescript }, { default: estree }] =
              await Promise.all([
                import("prettier/standalone"),
                import("prettier/parser-typescript"),
                import("prettier/plugins/estree"),
              ]) // Step 3: Format Code

            return format(raw, {
              parser: prettierParser,
              plugins: [typescript, estree],
            })
          } // Race the actual work against the timeout

          const formatted = await Promise.race([
            fetchAndFormatPromise(),
            timeoutPromise,
          ])

          if (!cancelled) {
            // SUCCESS
            setState({
              status: "SUCCESS",
              code: formatted as string,
              error: undefined,
            })
            return // Exit the loop and function on success
          }
        } catch (err) {
          if (cancelled) return // Exit if effect cleanup ran
          // Log error for current attempt
          const error =
            err instanceof Error
              ? err
              : new Error(`Unknown error: ${String(err)}`)
          console.error(`Attempt ${attempt} failed:`, error.message) // If this was the last attempt, transition to final ERROR state

          if (attempt === MAX_RETRIES) {
            setState({ status: "ERROR", code: undefined, error })
            return
          } // Wait using exponential backoff before the next loop iteration
          await exponentialBackoff(attempt)
        }
      }
    }

    run()
    return () => {
      cancelled = true
    }
  }, [path, prettierParser])

  return state
}

/**
 * Prism itself, alone in its own module so that it has run before any
 * grammar does: `./grammars` explains why (`../code-tokens` imports this
 * first).
 */

import Prism from "prismjs"

export { Prism }

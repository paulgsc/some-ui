/**
 * Syntax tokens for a program's source: the one place Prism is set up, for
 * every surface that shows code (LeetType's typing game, the phone's code
 * card). Moved here from LeetType's `CodeDisplay` (#2233), so a surface that
 * may not import LeetType reads the same grammar, and nobody writes a second
 * highlighter.
 *
 * It returns tokens, not markup: what each surface paints them with (Prism's
 * theme, the `code` appearance's tokens, a gradient) stays that surface's.
 */

import type { Token } from "prismjs"

// The order is load-bearing: Prism has to have run before any grammar does
// (`./grammars` says why). Alphabetical, so the import sorter keeps it.
import { Prism } from "./core"
import { GRAMMAR_MODULES } from "./grammars"

/** A language this module loads a grammar for. */
export type CodeLanguage = keyof typeof GRAMMAR_MODULES

/** One token: its type, any aliases, and its content (text, or tokens nested inside it). */
export type CodeToken = Token

/** A program as Prism reads it: plain text between tokens. */
export type CodeTokenStream = Array<string | CodeToken>

function isCodeLanguage(language: string): language is CodeLanguage {
  return Object.hasOwn(GRAMMAR_MODULES, language)
}

/**
 * Prism's tokens for `code`. A language not loaded here is read with Prism's
 * built-in JavaScript grammar, as LeetType always did. `null` only when the
 * grammar is missing, which means a bundler dropped its module: the caller
 * shows the text unhighlighted rather than not at all.
 */
export function tokenizeCode(
  code: string,
  language: string
): CodeTokenStream | null {
  const grammar =
    Prism.languages[isCodeLanguage(language) ? language : "javascript"]
  if (grammar === undefined) return null
  return Prism.tokenize(code, grammar)
}

import type { FC } from "react"

type CodeSnippetProps = {
  language: string
  children: React.ReactNode
}

export const CodeSnippet: FC<CodeSnippetProps> = ({ language, children }) => {
  return (
    <div className="relative my-5 overflow-x-auto rounded-md border border-gray-600 bg-gray-950/80 p-5 text-left font-mono text-sm text-gray-200">
      <div className="absolute right-2.5 top-1 text-xs uppercase tracking-wider text-gray-500">
        {language}
      </div>
      <pre className="whitespace-pre-wrap">{children}</pre>
    </div>
  )
}

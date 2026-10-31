// Prism's language components are plain scripts: each one adds its grammar to
// the global `Prism.languages` when it runs, and exports nothing. They ship no
// types, so this names them for `./grammars.ts`, which binds each one to make
// sure it runs (see `GRAMMAR_MODULES` there).
declare module "prismjs/components/prism-*"

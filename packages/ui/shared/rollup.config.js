import { cwd } from "process"

import {
  alias,
  babel,
  CONFIG_BABEL,
  CONFIG_EXTERNAL_MODULE_SUPPRESS,
  CONFIG_EXTERNAL_MODULES,
  CONFIG_GLOBALS,
  CONFIG_TYPESCRIPT,
  createBuildPath,
  createNodeNextSupport,
  FOLDERS,
  kebabToPascalCase,
  path,
  resolve,
  terser,
  typescript,
} from "../../../rollup.config"
import packageJson from "./package.json"

const CONFIG_GLOBALS_MODULE = {
  ...CONFIG_GLOBALS,
  react: "React",
  "react/jsx-runtime": "jsxRuntime",
}

const CONFIG_GLOBALS_UMD = {
  react: "React",
  "react/jsx-runtime": "jsxRuntime",
}

const aliasEntries = [
  { find: "@shared", replacement: path.resolve(cwd(), "./src") },
]

export default [
  {
    input: "src/index.ts",
    output: [
      {
        file: createBuildPath(packageJson, FOLDERS.CJS),
        format: FOLDERS.CJS,
        globals: CONFIG_GLOBALS_MODULE,
        strict: true,
        sourcemap: true,
        exports: "auto",
        plugins: [resolve(CONFIG_EXTERNAL_MODULES)],
      },
      {
        file: createBuildPath(packageJson, FOLDERS.ESM),
        format: FOLDERS.ESM,
        globals: CONFIG_GLOBALS_MODULE,
        strict: true,
        sourcemap: true,
        plugins: [resolve(CONFIG_EXTERNAL_MODULES)],
      },
    ],
    onwarn: CONFIG_EXTERNAL_MODULE_SUPPRESS,
    plugins: [
      alias({
        entries: aliasEntries,
      }),
      resolve(),
      typescript(CONFIG_TYPESCRIPT),
      babel(CONFIG_BABEL),
      // tscAliasReplacer(),
    ],
    external: Object.keys(CONFIG_GLOBALS_MODULE),
    // Use manual chunking to handle the @shared alias
  },
  {
    input: "src/index.ts",
    output: [
      {
        file: createBuildPath(packageJson, FOLDERS.UMD),
        format: FOLDERS.UMD,
        globals: CONFIG_GLOBALS_UMD,
        strict: true,
        sourcemap: false,
        name: kebabToPascalCase(packageJson.name),
        plugins: [
          alias({
            entries: aliasEntries,
          }),
          resolve(),
          terser(),
        ],
      },
    ],
    onwarn: CONFIG_EXTERNAL_MODULE_SUPPRESS,
    plugins: [
      alias({
        entries: aliasEntries,
      }),
      resolve(),
      typescript(CONFIG_TYPESCRIPT),
      babel(CONFIG_BABEL),
      // tscAliasReplacer(),
      createNodeNextSupport(),
    ],
    external: Object.keys(CONFIG_GLOBALS_UMD),
    // Use manual chunking to handle the @shared alias
  },
]

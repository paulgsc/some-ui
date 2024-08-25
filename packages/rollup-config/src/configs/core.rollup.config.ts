import type { PackageJsonTypes } from "../types"
import {
  babel,
  CONFIG_BABEL,
  CONFIG_EXTERNAL_MODULE_SUPPRESS,
  CONFIG_EXTERNAL_MODULES,
  CONFIG_GLOBALS,
  createBuildPath,
  createNodeNextSupport,
  FOLDERS,
  kebabToPascalCase,
  resolve,
  terser,
  typescript,
} from "./base.rollup.config"

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
const creatRollupConfig = (packageJson: PackageJsonTypes, tsconfig: object) => {
  const CONFIG_GLOBALS_MODULE = {
    ...CONFIG_GLOBALS,
    react: "React",
    "react/jsx-runtime": "jsxRuntime",
  }

  const CONFIG_GLOBALS_UMD = {
    react: "React",
    "react/jsx-runtime": "jsxRuntime",
  }

  const CONFIG_TYPESCRIPT = {
    ...tsconfig,
  }

  return [
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
          plugins: [resolve(), terser()],
        },
      ],
      onwarn: CONFIG_EXTERNAL_MODULE_SUPPRESS,
      plugins: [
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
}

export default creatRollupConfig

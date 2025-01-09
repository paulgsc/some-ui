import type { PackageJsonTypes } from "../types"
import {
  alias,
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

type RollupConfigOptions = {
  packageJson: PackageJsonTypes
  tsconfig?: `${string}/tsconfig.build.json` | false
  aliasPath: {
    aliasKey: string
    pathVal: string
  }
}

export default function ({
  tsconfig = false,
  packageJson,
  aliasPath,
}: RollupConfigOptions) {
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
    tsconfig: tsconfig === false ? "./tsconfig.json" : (tsconfig as string),
  }

  const externalModules = [
    ...new Set([
      ...Object.keys(packageJson.dependencies ?? {}),
      ...Object.keys(packageJson.peerDependencies ?? {}),
      "react-router-dom",
      "next",
      "react/jsx-runtime",
    ]),
  ]

  const { aliasKey, pathVal } = aliasPath
  const entries = [{ find: aliasKey, replacement: pathVal }]
  const input = "src/index.ts"

  return [
    {
      input,
      output: [
        {
          file: createBuildPath(packageJson, FOLDERS.CJS),
          format: FOLDERS.CJS,
          globals: CONFIG_GLOBALS_MODULE,
          strict: true,
          sourcemap: true,
          exports: "auto",
          plugins: [
            alias({ entries: entries }),
            resolve(CONFIG_EXTERNAL_MODULES),
          ],
        },
        {
          file: createBuildPath(packageJson, FOLDERS.ESM),
          format: FOLDERS.ESM,
          globals: CONFIG_GLOBALS_MODULE,
          strict: true,
          sourcemap: true,
          plugins: [
            alias({ entries: entries }),
            resolve(CONFIG_EXTERNAL_MODULES),
          ],
        },
      ],
      onwarn: CONFIG_EXTERNAL_MODULE_SUPPRESS,
      plugins: [
        alias({ entries: entries }),
        resolve(),
        typescript(CONFIG_TYPESCRIPT),
        babel(CONFIG_BABEL),
        // tscAliasReplacer(),
      ],
      external: externalModules,
    },
    {
      input,
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
        alias({ entries: entries }),
        resolve(),
        typescript(CONFIG_TYPESCRIPT),
        babel(CONFIG_BABEL),
        // tscAliasReplacer(),
        createNodeNextSupport(),
      ],
      external: externalModules,
    },
  ]
}

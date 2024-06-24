import {
  babel,
  CONFIG_BABEL,
  CONFIG_GLOBALS,
  CONFIG_TYPESCRIPT,
  createBuildPath,
  createNodeNextSupport,
  FOLDERS,
  kebabToPascalCase,
  resolve,
  terser,
  typescript
} from '../../rollup.config'
import packageJson from './package.json'

export default [
  {
    input: 'src/index.ts',
    output: [
      {
        file: createBuildPath(packageJson, FOLDERS.CJS),
        format: FOLDERS.CJS,
        globals: CONFIG_GLOBALS,
        strict: true,
        sourcemap: true,
        exports: 'auto'
      },
      {
        file: createBuildPath(packageJson, FOLDERS.ESM),
        format: FOLDERS.ESM,
        globals: CONFIG_GLOBALS,
        strict: true,
        sourcemap: true
      },
      {
        file: createBuildPath(packageJson, FOLDERS.UMD),
        format: FOLDERS.UMD,
        globals: CONFIG_GLOBALS,
        strict: true,
        sourcemap: false,
        name: kebabToPascalCase(packageJson.name),
        plugins: [terser()]
      }
    ],
    external: Object.keys(CONFIG_GLOBALS),
    plugins: [
      resolve(),
      typescript(CONFIG_TYPESCRIPT),
      babel(CONFIG_BABEL),
      createNodeNextSupport()
    ]
  }
]

// Copies the sandbox runtime files and the theme fonts with their licences next to the bundle; sandbox.ts reads them via LIFEDASHBOARD_RUNTIME_DIR.
import { copyFileSync, mkdirSync, readdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'

const require = createRequire(import.meta.url)
const out = new URL('../dist-bundle/runtime/', import.meta.url)
mkdirSync(out, { recursive: true })
copyFileSync(require.resolve('vue/dist/vue.runtime.esm-browser.prod.js'), new URL('vue.js', out))
copyFileSync(join(dirname(require.resolve('@lifedashboard/widget-sdk/package.json')), 'dist', 'sandbox.js'), new URL('sdk.js', out))

const fontsSource = new URL('../../ui/app/theme/fonts/', import.meta.url)
const fontsOut = new URL('fonts/', out)
mkdirSync(fontsOut, { recursive: true })
for (const file of readdirSync(fontsSource)) {
  if (file.endsWith('.woff2') || file.endsWith('.OFL.txt')) copyFileSync(new URL(file, fontsSource), new URL(file, fontsOut))
}

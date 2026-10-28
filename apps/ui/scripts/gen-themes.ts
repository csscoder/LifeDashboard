import { writeFileSync } from 'node:fs'
import { generateThemesCss } from '../app/theme/generate.ts'

writeFileSync(new URL('../app/theme/styles/themes/generated.css', import.meta.url), generateThemesCss())

import { setMaxListeners } from 'node:events'
import * as reka from 'reka-ui'
import { afterEach, beforeEach, vi } from 'vitest'
import * as builtin from '../../app/theme/builtin'
import * as palettes from '../../app/theme/palettes'
import * as colorScheme from '../../app/theme/color-scheme'
import * as fonts from '../../app/theme/fonts'
import { compileSfc, unmountComponents } from './sfc-renderer'
import { UiSelect } from './ui-select-stub'

const testWindow = vi.hoisted(() => {
  vi.stubGlobal('document', { createElement: () => ({}) })
  const target = new EventTarget()
  vi.stubGlobal('window', target)
  return target
})
setMaxListeners(0, testWindow)
beforeEach(() => {
  vi.stubGlobal('window', testWindow)
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} })
  vi.stubGlobal('document', { activeElement: null, getElementById: () => null, querySelector: () => null, addEventListener() {}, removeEventListener() {} })
  vi.stubGlobal('Element', class { static [Symbol.hasInstance](value: any) { return !!value?.tag } })
})
afterEach(() => { unmountComponents(); vi.unstubAllGlobals() })
const Radio = compileSfc(new URL('../../app/ui/UiRadioGroup.vue', import.meta.url), { 'reka-ui': reka })
export const ThemePicker = compileSfc(new URL('../../app/theme/ThemePicker.vue', import.meta.url), {
  'reka-ui': reka, '../ui/UiRadioGroup.vue': Radio, '../ui/UiSelect.vue': UiSelect, './fonts': fonts, './palettes': palettes, './builtin': builtin, './color-scheme': colorScheme,
})
export const themeModules = { '../theme/ThemePicker.vue': ThemePicker, '../theme/builtin': builtin, '../theme/palettes': palettes }

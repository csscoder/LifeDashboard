import * as Vue from 'vue'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import * as grid from '@lifedashboard/contracts/grid'
import * as spaces from '@lifedashboard/contracts/space'
import type { ThemeChoice } from '@lifedashboard/contracts/theme'
import * as fonts from '../app/theme/fonts'
import * as appearance from '../app/theme/appearance'
import * as builtin from '../app/theme/builtin'
import * as palettes from '../app/theme/palettes'
import * as resolve from '../app/theme/resolve'
import * as sync from '../app/board/space-sync'
import * as lastOpen from '../app/spaces/last-open'
import * as nav from '../app/spaces/nav'
import * as spaceFlow from '../app/spaces/space-flow'
import * as fan from '../app/spaces/fan-layout'
import { ThemePicker, themeModules } from './helpers/theme-picker'
import { compileSfc, mountComponent, unmountComponents } from './helpers/sfc-renderer'

const Empty = Vue.defineComponent({ setup: () => () => null })
const Settings = compileSfc(new URL('../app/SettingsPanel.vue', import.meta.url), {
  './theme/builtin': builtin, './theme/ThemePicker.vue': ThemePicker,
  '@lifedashboard/contracts/grid': grid, './ui/UiSelect.vue': Empty,
})
const SpacePicker = compileSfc(new URL('../app/spaces/SpacePicker.vue', import.meta.url), {
  ...themeModules, '@lifedashboard/contracts/space': spaces,
})
const scheme = Vue.ref<'dark' | 'light'>('dark')
const schemeModule = { useColorScheme: () => Vue.readonly(scheme) }
const Switcher = compileSfc(new URL('../app/spaces/SpaceSwitcher.vue', import.meta.url), {
  ...themeModules, '@lifedashboard/contracts/space': spaces, './fan-layout': fan,
  './SpacePicker.vue': SpacePicker, '../theme/resolve': resolve, '../theme/color-scheme': schemeModule,
})
const screenTheme = Vue.ref<ThemeChoice | null>(null)
const Board = Vue.defineComponent({
  props: ['themeId', 'themeChoice', 'spaceId'],
  setup(props, { expose }) {
    expose({ screenTheme, themeSpaceId: Vue.computed(() => props.spaceId), screens: ['screen'], loaded: true, rows: 12 })
    return () => Vue.h('div', { 'data-widget-theme': props.themeId })
  },
})
let stored = new Map<string, string>()
let space: spaces.SpaceSummary
const api = {
  spaces: vi.fn(async () => ({ ok: true, data: [space] })),
  updateSpace: vi.fn(async (_id: string, patch: spaces.SpacePatch) => ({ ok: true, data: space = { ...space, ...patch } })),
}
const App = compileSfc(new URL('../app/app.vue', import.meta.url), {
  '@lifedashboard/contracts/grid': grid, '@lifedashboard/contracts/space': spaces, './api': { api },
  './board/WidgetBoard.vue': Board, './SettingsPanel.vue': Settings, './spaces/SpaceSwitcher.vue': Switcher,
  './board/space-sync': sync, './spaces/last-open': lastOpen, './spaces/nav': nav, './spaces/space-flow': spaceFlow,
  './spaces/confirm-delete': { askDelete: vi.fn() }, './toasts': { toasts: Vue.ref([]) },
  './widgets/catalog': { installedPackages: Vue.ref([]), loadPackages: vi.fn(), pickerEntries: () => [] },
  './widgets/modals': { widgetModals: { activeModal: Vue.ref(null), error: Vue.ref(null), retryVersion: Vue.ref(0), context: () => null, cancelAll() {}, dispose() {} } },
  './theme/appearance': appearance, './theme/builtin': builtin, './theme/palettes': palettes,
  './theme/resolve': resolve, './theme/color-scheme': schemeModule, './theme/fonts': fonts,
  ...Object.fromEntries(['widgets/WidgetModal', 'widgets/SandboxWidget', 'background/PixiBackground', 'PairingForm', 'ConfirmDialog', 'spaces/ConfirmDelete', 'spaces/ScreenDots', 'spaces/SpaceTitle', 'widgets/PackagesDialog'].map(path => [`./${path}.vue`, Empty])),
})
beforeEach(() => {
  stored = new Map()
  vi.stubGlobal('localStorage', { getItem: (key: string) => stored.get(key) ?? null, setItem: (key: string, value: string) => stored.set(key, value) })
  screenTheme.value = null
  scheme.value = 'dark'
  space = { id: 'space', title: 'Desk', icon: '🏠', color: 'violet', theme: null, revision: 1, position: 0 }
  api.updateSpace.mockClear()
})
afterEach(() => { unmountComponents(); vi.unstubAllGlobals() })
async function mount() {
  const ui = mountComponent(App, {}, [])
  for (let i = 0; i < 5; i++) await Vue.nextTick()
  return ui
}
const rootClass = (ui: ReturnType<typeof mountComponent>) => ui.nodes().find(n => String(n.props.class).startsWith('space '))!.props.class

it('opens fresh settings with an enabled default and persists a selected choice as schema 2', async () => {
  const ui = await mount()
  expect(rootClass(ui)).toBe('space space--theme-lifedashboard-dark-glass space--skin-glass')
  expect(ui.button('LifeDashboard').props['aria-checked']).toBe(true)
  expect(ui.nodes().filter(n => n.props.role === 'radiogroup').slice(1).every(n => n.props['data-disabled'] === undefined)).toBe(true)
  expect(stored.has(appearance.APPEARANCE_STORAGE_KEY)).toBe(false)
  ui.button('Gruvbox').click()
  await Vue.nextTick()
  expect(JSON.parse(stored.get(appearance.APPEARANCE_STORAGE_KEY)!)).toEqual({ schemaVersion: 2, theme: { palette: 'builtin:gruvbox', mode: 'dark', style: 'glass' } })
  expect(rootClass(ui)).toContain('space--theme-gruvbox-dark-glass')
})

it('keeps an unknown dashboard choice stored and warns until an explicit selection', async () => {
  const raw = JSON.stringify({ schemaVersion: 2, theme: { palette: 'builtin:nord', mode: 'auto', style: 'solid' } })
  stored.set(appearance.APPEARANCE_STORAGE_KEY, raw)
  const ui = await mount()
  expect(ui.text()).toContain('Theme not found, showing the default theme')
  expect(ui.button('LifeDashboard').props['aria-checked']).toBe(true)
  expect(stored.get(appearance.APPEARANCE_STORAGE_KEY)).toBe(raw)
  ui.button('Gruvbox').click()
  await Vue.nextTick()
  expect(ui.text()).not.toContain('Theme not found')
  expect(JSON.parse(stored.get(appearance.APPEARANCE_STORAGE_KEY)!).theme).toEqual({ palette: 'builtin:gruvbox', mode: 'dark', style: 'glass' })
})

it('inherits through an unknown space palette and sends only the changed icon to the API', async () => {
  const dashboard = { palette: 'builtin:gruvbox', mode: 'light', style: 'solid' }
  stored.set(appearance.APPEARANCE_STORAGE_KEY, JSON.stringify({ schemaVersion: 2, theme: dashboard }))
  space.theme = { palette: 'builtin:nord', mode: 'dark', style: 'glass' }
  const ui = await mount()
  expect(rootClass(ui)).toBe('space space--theme-gruvbox-light-solid space--skin-solid')
  ui.button('Edit board').props.onClick()
  await Vue.nextTick()
  ui.button('Icon and theme: Desk').props.onClick()
  await Vue.nextTick()
  expect(ui.button('Inherit').props['aria-checked']).toBe(true)
  const icon = spaces.SPACE_ICONS.find(value => value !== space.icon)!
  ui.button(icon).props.onClick()
  await Vue.nextTick()
  expect(api.updateSpace).toHaveBeenCalledWith('space', { icon })
  expect(space.theme.palette).toBe('builtin:nord')
})

it('uses screen choices before the space and dashboard and resolves automatic mode reactively', async () => {
  space.theme = { palette: 'builtin:catppuccin', mode: 'light', style: 'solid' }
  const ui = await mount()
  expect(rootClass(ui)).toContain('space--theme-catppuccin-light-solid')
  screenTheme.value = { palette: 'builtin:gruvbox', mode: 'auto', style: 'glass' }
  await Vue.nextTick()
  expect(rootClass(ui)).toContain('space--theme-gruvbox-dark-glass')
  scheme.value = 'light'
  await Vue.nextTick()
  expect(rootClass(ui)).toContain('space--theme-gruvbox-light-glass')
  expect(ui.nodes().find(n => n.props['data-widget-theme'])?.props['data-widget-theme']).toBe('builtin:gruvbox-light-glass')
})

it('applies the effective choice fonts as inline variables on the space root', async () => {
  space.theme = { palette: 'builtin:catppuccin', mode: 'light', style: 'solid', heading: 'lora' }
  const ui = await mount()
  const root = ui.nodes().find(n => String(n.props.class).startsWith('space '))!
  expect(root.props.style).toEqual({ '--ld-font-heading': "'Lora', system-ui, serif", '--ld-font-display': "'Lora', system-ui, serif" })
})

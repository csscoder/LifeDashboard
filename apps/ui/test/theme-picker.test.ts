import { setMaxListeners } from 'node:events'
import * as Vue from 'vue'
import * as reka from 'reka-ui'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { BUILTIN_PALETTES } from '../app/theme/palettes'
import * as builtin from '../app/theme/builtin'
import * as colorScheme from '../app/theme/color-scheme'
import { compileSfc, mountComponent, type HostNode } from './helpers/sfc-renderer'

const testWindow = vi.hoisted(() => {
  vi.stubGlobal('document', { createElement: () => ({}) })
  const target = new EventTarget()
  vi.stubGlobal('window', target)
  return target
})

setMaxListeners(0, testWindow)
const Radio = compileSfc(new URL('../app/ui/UiRadioGroup.vue', import.meta.url), { 'reka-ui': reka })
const Picker = compileSfc(new URL('../app/theme/ThemePicker.vue', import.meta.url), {
  'reka-ui': reka, '../ui/UiRadioGroup.vue': Radio, './palettes': { BUILTIN_PALETTES }, './builtin': builtin, './color-scheme': colorScheme,
})
beforeEach(() => {
  vi.stubGlobal('window', testWindow)
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} })
  vi.stubGlobal('document', { activeElement: null, getElementById: () => null, querySelector: () => null })
  vi.stubGlobal('Element', class { static [Symbol.hasInstance](value: any) { return !!value?.tag } })
})
afterEach(() => vi.unstubAllGlobals())
async function mount(props: Record<string, unknown> = {}) {
  const ui = mountComponent(Picker, { modelValue: null, ...props }, ['update:modelValue'])
  await Vue.nextTick(); await Vue.nextTick()
  return ui
}
async function click(el: HostNode) { el.click(); await Vue.nextTick() }
const choice = { palette: 'builtin:catppuccin', mode: 'dark', style: 'glass' }
it('renders eleven named palette previews in the resolved mode', async () => {
  const ui = await mount({ modelValue: choice })
  const tiles = ui.nodes().filter(n => n.props.role === 'radio' && n.props['aria-label'])
  expect(tiles.map(n => n.props['aria-label'])).toEqual(BUILTIN_PALETTES.map(p => p.name))
  expect(tiles).toHaveLength(11)
  for (const [i, tile] of tiles.entries()) expect(tile.props.class).toContain(`widget--theme-${BUILTIN_PALETTES[i]!.slug}-dark-solid`)
})
it('selects a palette using the inherited mode and style', async () => {
  const ui = await mount({ inherit: true, inherited: { palette: 'builtin:gruvbox', mode: 'light', style: 'solid' } })
  await click(ui.button('Catppuccin'))
  expect(ui.events).toEqual([['update:modelValue', { palette: 'builtin:catppuccin', mode: 'light', style: 'solid' }]])
})
it('changes style and mode while preserving the other dimensions', async () => {
  const ui = await mount({ modelValue: choice })
  const radio = (value: string) => ui.nodes().find(n => n.props.role === 'radio' && n.props.value === value)!
  await click(radio('solid'))
  await click(radio('auto'))
  expect(ui.events).toEqual([
    ['update:modelValue', { ...choice, style: 'solid' }],
    ['update:modelValue', { ...choice, mode: 'auto' }],
  ])
})
it('offers optional inheritance and no frame choices', async () => {
  const ui = await mount({ modelValue: choice, inherit: true, bare: true, unavailable: true })
  await click(ui.button('Inherit')); await click(ui.button('No frame'))
  expect(ui.events).toEqual([['update:modelValue', null], ['update:modelValue', 'bare']])
  expect(ui.text()).toContain('Theme unavailable — inherited')
  const plain = await mount()
  expect(plain.button('Inherit')).toBeUndefined(); expect(plain.button('No frame')).toBeUndefined()
})
it.each([null, 'bare'])('disables mode and style for %s', async modelValue => {
  const ui = await mount({ modelValue })
  const groups = ui.nodes().filter(n => n.props.role === 'radiogroup')
  expect(groups.slice(1).every(n => n.props['data-disabled'] !== undefined)).toBe(true)
})
it('disables all choices when disabled', async () => {
  const ui = await mount({ modelValue: choice, disabled: true })
  expect(ui.nodes().filter(n => n.props.role === 'radio').every(n => n.props.disabled !== undefined)).toBe(true)
})
it('selects the next palette with ArrowRight', async () => {
  const ui = await mount({ modelValue: { palette: 'builtin:lifedashboard', mode: 'dark', style: 'solid' } })
  const tile = ui.button('LifeDashboard')
  tile.focus()
  await Vue.nextTick()
  tile.dispatchEvent(Object.assign(new Event('keydown', { bubbles: true, cancelable: true }), { key: 'ArrowRight' }))
  await Vue.nextTick(); await new Promise(resolve => setTimeout(resolve, 10)); await Vue.nextTick()
  expect(ui.events.at(-1)).toEqual(['update:modelValue', { palette: 'builtin:catppuccin', mode: 'dark', style: 'solid' }])
})

it('resolves Auto previews using the shared color scheme', async () => {
  const ui = await mount({ modelValue: { ...choice, mode: 'auto' } })
  expect(ui.button('Catppuccin').props.class).toContain('widget--theme-catppuccin-dark-solid')
})
it('marks an unavailable stored palette as inherited', async () => {
  const ui = await mount({ modelValue: { ...choice, palette: 'builtin:missing' }, inherit: true, unavailable: true })
  expect(ui.button('Inherit').props['aria-checked']).toBe(true)
  expect(ui.nodes().filter(n => n.props.role === 'radiogroup').slice(1).every(n => n.props['data-disabled'] !== undefined)).toBe(true)
})

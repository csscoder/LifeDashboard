import { setMaxListeners } from 'node:events'
import * as Vue from 'vue'
import * as reka from 'reka-ui'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { BUILTIN_PALETTES } from '../app/theme/palettes'
import * as builtin from '../app/theme/builtin'
import * as colorScheme from '../app/theme/color-scheme'
import * as fonts from '../app/theme/fonts'
import { compileSfc, mountComponent, type HostNode } from './helpers/sfc-renderer'
import { UiSelect } from './helpers/ui-select-stub'

const testWindow = vi.hoisted(() => {
  vi.stubGlobal('document', { createElement: () => ({}) })
  const target = new EventTarget()
  vi.stubGlobal('window', target)
  return target
})

setMaxListeners(0, testWindow)
const Radio = compileSfc(new URL('../app/ui/UiRadioGroup.vue', import.meta.url), { 'reka-ui': reka })
const Picker = compileSfc(new URL('../app/theme/ThemePicker.vue', import.meta.url), {
  'reka-ui': reka, '../ui/UiRadioGroup.vue': Radio, '../ui/UiSelect.vue': UiSelect, './fonts': fonts, './palettes': { BUILTIN_PALETTES }, './builtin': builtin, './color-scheme': colorScheme,
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

it('shows the inherited palette while retaining inherited mode and style', async () => {
  const ui = await mount({ inherit: true, inherited: { palette: 'builtin:gruvbox', mode: 'light', style: 'glass' } })
  expect(ui.text()).toContain('Gruvbox')
  const inherit = ui.button('Inherit')
  expect(inherit.props['aria-checked']).toBe(true)
  expect(inherit.parent!.children.map(n => n.text).join(' ')).toContain('Gruvbox')
  for (const value of ['light', 'glass']) {
    const radio = ui.nodes().find(n => n.props.role === 'radio' && n.props.value === value)!
    expect(radio.props['aria-checked']).toBe(true)
    expect(radio.props['data-disabled']).toBeDefined()
  }
})

const unbounded = fonts.BUILTIN_FONTS.find(font => font.slug === 'unbounded')!
const textOf = (n: HostNode): string => n.text + n.children.map(textOf).join('')
const itemText = (item: HostNode) => textOf(item.children[0]!)
function fontSelect(ui: Awaited<ReturnType<typeof mount>>, label: string) {
  const forId = ui.nodes().find(n => n.tag === 'label' && n.text === label)!.props.for
  const trigger = ui.nodes().find(n => n.tag === 'SelectTrigger' && n.props.id === forId)!
  const root = trigger.parent!
  const items = root.children.flatMap(function walk(n): HostNode[] { return [n, ...n.children.flatMap(walk)] }).filter(n => n.tag === 'SelectItem')
  return { root, items, choose: async (name: string) => { root.props['onUpdate:modelValue'](items.find(n => itemText(n) === name)!.props.value); await Vue.nextTick() }, shown: () => (items.find(n => n.props.value === root.props['model-value']) && itemText(items.find(n => n.props.value === root.props['model-value'])!)) }
}
it('emits the chosen heading font after the style key', async () => {
  const ui = await mount({ modelValue: choice })
  await fontSelect(ui, 'Heading font').choose('Unbounded')
  const emitted = ui.events.at(-1)![1] as Record<string, string>
  expect(emitted).toEqual({ ...choice, heading: 'unbounded' })
  expect(Object.keys(emitted)).toEqual(['palette', 'mode', 'style', 'heading'])
})
it('removes the key for Theme default', async () => {
  const ui = await mount({ modelValue: { ...choice, heading: 'unbounded' } })
  await fontSelect(ui, 'Heading font').choose('Theme default')
  expect(ui.events.at(-1)).toEqual(['update:modelValue', choice])
})
it('lists Theme default and the catalog in order in both selects', async () => {
  const ui = await mount({ modelValue: choice })
  for (const label of ['Heading font', 'Body font']) {
    expect(fontSelect(ui, label).items.map(n => itemText(n))).toEqual(['Theme default', ...fonts.BUILTIN_FONTS.map(font => font.name)])
  }
})
it.each([null, 'bare'])('disables the font selects for %s', async modelValue => {
  const ui = await mount({ modelValue })
  for (const label of ['Heading font', 'Body font']) expect(fontSelect(ui, label).root.props.disabled).toBeTruthy()
})
it('shows Theme default for an unknown slug and keeps it when another key changes', async () => {
  const ui = await mount({ modelValue: { ...choice, heading: 'comic' } })
  expect(fontSelect(ui, 'Heading font').shown()).toBe('Theme default')
  await click(ui.nodes().find(n => n.props.role === 'radio' && n.props.value === 'solid')!)
  expect(ui.events.at(-1)).toEqual(['update:modelValue', { ...choice, style: 'solid', heading: 'comic' }])
})
it('copies the inherited fonts when a palette is chosen from Inherit', async () => {
  const ui = await mount({ inherit: true, inherited: { palette: 'builtin:gruvbox', mode: 'light', style: 'solid', heading: 'lora' } })
  await click(ui.button('Catppuccin'))
  expect(ui.events.at(-1)).toEqual(['update:modelValue', { palette: 'builtin:catppuccin', mode: 'light', style: 'solid', heading: 'lora' }])
})
it('samples the heading font of the effective choice', async () => {
  const known = await mount({ modelValue: { ...choice, heading: 'unbounded' } })
  expect(known.nodes().find(n => n.text === 'Heading Заголовок')!.props.style).toEqual({ fontFamily: fonts.fontStack(unbounded) })
  const none = await mount({ modelValue: choice })
  expect(none.nodes().find(n => n.text === 'Heading Заголовок')!.props.style).toEqual({ fontFamily: 'system-ui, sans-serif' })
  expect(none.nodes().find(n => n.text === 'Body text Текст 123')).toBeDefined()
})

import * as Vue from 'vue'
import * as reka from 'reka-ui'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as variantsModule from '@lifedashboard/contracts/widget-variants'
import * as board from '@lifedashboard/contracts/board'
import { SCALE_LIMITS } from '@lifedashboard/contracts/board'
import { themeModules } from './helpers/theme-picker'
import * as widgetSettings from '../app/board/widget-settings'
import { compileSfc, mountComponent, type HostNode } from './helpers/sfc-renderer'

// The custom test renderer has no DOM; Reka only needs the class for instanceof checks, and TabsContent waits a frame.
beforeEach(() => {
  vi.stubGlobal('Element', class {})
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { callback(0); return 0 })
})

const GenericForm = Vue.defineComponent({ name: 'GenericForm', setup: () => () => Vue.h('generic-form') })
const Editor = Vue.defineComponent({
  props: { schema: Object, config: Object },
  emits: ['change'],
  setup: (props, { emit }) => () => Vue.h('own-editor', { config: props.config, onPick: (next: unknown) => emit('change', next) }),
})
const UiSelect = Vue.defineComponent({
  props: { modelValue: String, options: Array },
  emits: ['update:modelValue'],
  setup: (props, { attrs, emit }) => () => Vue.h('ui-select', { ...attrs, modelValue: props.modelValue, options: props.options, pick: (value: string) => emit('update:modelValue', value) }),
})
const control = (tag: string) => Vue.defineComponent({
  props: ['modelValue', 'options', 'disabled'], emits: ['update:modelValue'],
  setup: (props, { attrs, emit, slots }) => () => Vue.h(tag, { ...attrs, ...props, pick: (value: unknown) => emit('update:modelValue', value) }, slots.default?.()),
})
const Row = Vue.defineComponent({ props: ['label', 'value'], setup: (props, { slots }) => () => Vue.h('settings-row', [String(props.label), slots.default?.(), props.value]) })
const component = compileSfc(new URL('../app/board/WidgetSettings.vue', import.meta.url), {
  '@lifedashboard/contracts/board': board,
  ...themeModules,
  './widget-settings': widgetSettings,
  './WidgetConfigForm.vue': GenericForm,
  '../ui/UiSelect.vue': UiSelect,
  '../ui/UiNumberField.vue': control('ui-numberfield'),
  '@lifedashboard/contracts/widget-variants': variantsModule,
  './SettingsRow.vue': Row,
  'reka-ui': { ...reka, Separator: control('separator') },
  ...Object.fromEntries(['Switch', 'Slider', 'ColorField', 'Button'].map(name => [`../ui/Ui${name}.vue`, control(name === 'Button' ? 'button' : `ui-${name.toLowerCase()}`)])),
})
const schema = { type: 'object', properties: { zone: { type: 'string', title: 'Zone', default: 'UTC' } } }

function mount(editor?: Vue.Component, overrides: Record<string, unknown> = {}) {
  return mountComponent(component, {
    inherited: { palette: 'builtin:lifedashboard', mode: 'dark', style: 'glass' }, appearance: undefined, schema, config: { zone: 'Asia/Tokyo' }, widgetId: 'w1', secrets: new Set(), version: '', versions: [],
    ...(editor ? { editor } : {}), ...overrides,
  }, ['config', 'change', 'version', 'reset'])
}

const textOf = (n: HostNode): string => n.text + n.children.map(textOf).join('')
const tabs = (ui: ReturnType<typeof mount>) => ui.nodes().filter((el) => el.props.role === 'tab')
// Reka ids a panel by its value: «…-content-display».
const tabPanel = (ui: ReturnType<typeof mount>, label: string) =>
  ui.nodes().find((el) => el.props.role === 'tabpanel' && String(el.props.id).endsWith(`-content-${label.toLowerCase()}`))!
// Reka switches tabs on mousedown; the trigger merges its handlers into an array.
const press = (tab: HostNode) => [tab.props.onMousedown].flat().forEach((handler) => handler({ button: 0, ctrlKey: false, preventDefault() {} }))
const inPanel = (node: HostNode | null): boolean => !!node && (node.props.role === 'tabpanel' || inPanel(node.parent))

describe('widget settings panel', () => {
  it('opens on the Widget tab, then Style, Display and Package, with reset below the tabs', () => {
    const ui = mount(undefined, { versions: ['1'], appearance: { shadow: board.DEFAULT_SHADOW } })
    expect(tabs(ui).map(textOf)).toEqual(['Widget', 'Style', 'Display', 'Package'])
    expect(tabs(ui).map((el) => el.props['aria-selected'])).toEqual(['true', 'false', 'false', 'false'])
    expect(textOf(tabPanel(ui, 'Widget'))).toBe('')
    expect(ui.nodes().some((el) => el.tag === 'generic-form' && inPanel(el))).toBe(true)
    expect(textOf(tabPanel(ui, 'Style'))).toContain('Inherit')
    for (const label of ['Text size, %', 'Shadow', 'Blur']) expect(textOf(tabPanel(ui, 'Display'))).toContain(label)
    expect(textOf(tabPanel(ui, 'Package'))).toContain('Apply version')
    expect(inPanel(ui.button('Reset to defaults'))).toBe(false)
    expect(tabs(mount()).map(textOf)).toEqual(['Widget', 'Style', 'Display'])
  })
  it('focuses the open tab when opened', async () => {
    const ui = mount()
    await Vue.nextTick()
    ui.panel().props.onToggle({ newState: 'open' })
    expect(tabs(ui)[0]!.focused).toBe(true)
  })
  it('sets the text size as an integer within SCALE_LIMITS, framed or bare', () => {
    for (const theme of [null, 'bare'] as const) {
      const appearance = { theme, shadow: null, variant: null, scale: 25 }
      const ui = mount(undefined, { appearance })
      expect(ui.text()).toContain('Text size, %')
      const field = ui.nodes().find((el) => el.tag === 'ui-numberfield')!
      expect('integer' in field.props).toBe(true)
      expect('stepper' in field.props).toBe(true)
      expect(field.props.min).toBe(SCALE_LIMITS[0])
      expect(field.props.max).toBe(SCALE_LIMITS[1])
      expect(field.props.modelValue).toBe(25)
      field.props.pick(-10)
      expect(ui.events.at(-1)).toEqual(['change', { theme, shadow: null, variant: null, scale: -10 }])
      field.props.pick(0)
      expect(ui.events.at(-1)).toEqual(['change', { theme, shadow: null, variant: null, scale: null }])
    }
  })
  it('shows 0 for a widget without a stored text size', () => {
    const field = mount(undefined, { appearance: undefined }).nodes().find((el) => el.tag === 'ui-numberfield')!
    expect(field.props.modelValue).toBe(0)
  })
  it('hides Look without variants', () => { expect(mount().text()).not.toContain('Look') })
  it('resolves missing looks and preserves style and shadow when picking a look', () => {
    const variants = { default: 'plain', items: [{ id: 'plain', title: 'Plain' }, { id: 'roman', title: 'Roman numerals' }] }
    const appearance = { theme: { palette: 'builtin:nord', mode: 'dark', style: 'solid' }, shadow: board.DEFAULT_SHADOW, variant: 'gone', scale: null }
    const ui = mount(undefined, { variants, appearance })
    expect(ui.text()).toContain('Look')
    const look = ui.nodes().filter(el => el.tag === 'ui-select')[0]!
    expect(look.props.modelValue).toBe('plain')
    expect(look.props.options).toEqual([{ value: 'plain', label: 'Plain' }, { value: 'roman', label: 'Roman numerals' }])
    look.props.pick('roman')
    expect(ui.events).toEqual([['change', { ...appearance, variant: 'roman', scale: null }]])
  })
  it('uses themed shadow controls without native inputs', () => {
    const ui = mount(undefined, { versions: ['1'], appearance: { shadow: board.DEFAULT_SHADOW } })
    expect(ui.nodes().filter(el => el.tag === 'input')).toHaveLength(0)
    expect(ui.nodes().filter(el => el.tag === 'ui-switch')).toHaveLength(1)
    expect(ui.nodes().filter(el => el.tag === 'ui-slider')).toHaveLength(3)
    expect(ui.nodes().filter(el => el.tag === 'ui-colorfield')).toHaveLength(1)
  })
  it('leaves out the Widget tab when the widget has no settings and opens on Style', () => {
    for (const empty of [undefined, { type: 'object', properties: {} }]) {
      const ui = mount(undefined, { schema: empty })
      expect(tabs(ui).map(textOf)).toEqual(['Style', 'Display'])
      expect(tabs(ui)[0]!.props['aria-selected']).toBe('true')
      expect(ui.button('Reset to defaults')).toBeDefined()
    }
  })
  it('opens the next widget on its first tab', async () => {
    const ui = mount()
    press(tabs(ui)[2]!)
    await Vue.nextTick()
    expect(tabs(ui)[2]!.props['aria-selected']).toBe('true')
    ui.props.widgetId = 'w2'
    await Vue.nextTick()
    expect(tabs(ui)[0]!.props['aria-selected']).toBe('true')
  })
  it('takes the focus of a click on its text, so the board main never gets it and closes the panel', () => {
    const panel = mount().nodes().find((el) => el.props.role === 'dialog')!
    expect(panel.props.tabindex).toBe('-1')
  })

  it('uses the generic form when the widget has no editor of its own', () => {
    const ui = mount()
    expect(ui.nodes().some((el) => el.tag === 'generic-form')).toBe(true)
    expect(ui.nodes().some((el) => el.tag === 'own-editor')).toBe(false)
  })

  it('shows the widget’s own editor instead and passes its changes on as config', () => {
    const ui = mount(Editor)
    expect(ui.nodes().some((el) => el.tag === 'generic-form')).toBe(false)
    const editor = ui.nodes().find((el) => el.tag === 'own-editor')!
    expect(editor.props.config).toEqual({ zone: 'Asia/Tokyo' })
    editor.props.onPick({ zone: 'UTC' })
    expect(ui.events).toEqual([['config', { zone: 'UTC' }]])
  })

  it('shows the widget’s own editor without a schema', () => {
    const ui = mount(Editor, { schema: undefined })
    expect(ui.nodes().some((el) => el.tag === 'own-editor')).toBe(true)
    expect(tabs(ui).map(textOf)[0]).toBe('Widget')
  })

  it('picks a palette or no frame while keeping the shadow', async () => {
    const ui = mount(undefined, { appearance: { theme: null, shadow: board.DEFAULT_SHADOW, variant: null, scale: null }, inherited: { palette: 'builtin:gruvbox', mode: 'light', style: 'solid' } })
    await Vue.nextTick()
    expect(ui.panel().props['aria-label']).toBe('Widget settings')
    for (const label of ['Style', 'Shadow', 'Blur', 'Color', 'Reset to defaults']) expect(ui.text()).toContain(label)
    expect(ui.button('Inherit').props['aria-checked']).toBe(true)
    ui.button('Catppuccin').click()
    expect(ui.events).toEqual([['change', { theme: { palette: 'builtin:catppuccin', mode: 'light', style: 'solid' }, shadow: board.DEFAULT_SHADOW, variant: null, scale: null }]])
    ui.button('No frame').click()
    expect(ui.events.at(-1)).toEqual(['change', { theme: 'bare', shadow: board.DEFAULT_SHADOW, variant: null, scale: null }])
  })

  it('applies a version picked in the themed select', async () => {
    const ui = mount(undefined, { version: '1.0.0', versions: ['1.0.0', '2.0.0'] })
    const version = ui.nodes().find((el) => el.tag === 'ui-select')!
    expect(version.props.options).toEqual([{ value: '1.0.0', label: '1.0.0' }, { value: '2.0.0', label: '2.0.0' }])
    expect(ui.button('Apply version').props.disabled).toBe(true)
    version.props.pick('2.0.0')
    await Vue.nextTick()
    ui.button('Apply version').props.onClick()
    expect(ui.events).toEqual([['version', '2.0.0']])
  })

  it('shows the shadow controls only while the shadow is on', async () => {
    const ui = mount(undefined, { appearance: { theme: null, shadow: null, variant: null, scale: null } })
    const sliders = () => ui.nodes().filter((el) => el.tag === 'ui-slider')
    const colour = () => ui.nodes().find((el) => el.tag === 'ui-colorfield')
    expect(sliders()).toHaveLength(0)
    expect(colour()).toBeUndefined()
    expect(ui.text()).not.toContain('Blur')
    expect(ui.button('Reset to defaults')).toBeDefined()
    ui.props.appearance = { theme: null, shadow: board.DEFAULT_SHADOW, variant: null, scale: null }
    await Vue.nextTick()
    expect(sliders().map((el) => el.props.modelValue)).toEqual([board.DEFAULT_SHADOW.x, board.DEFAULT_SHADOW.y, board.DEFAULT_SHADOW.blur])
    expect(sliders().every((el) => !el.props.disabled)).toBe(true)
    expect(colour()?.props.modelValue).toBe(board.DEFAULT_SHADOW.color)
    expect(colour()?.props.alpha).toBe(board.DEFAULT_SHADOW.opacity)
    expect(ui.text()).not.toContain('Opacity')
    colour()!.props['onUpdate:alpha'](0.25)
    expect(ui.events.at(-1)).toEqual(['change', { theme: null, shadow: { ...board.DEFAULT_SHADOW, opacity: 0.25 }, variant: null, scale: null }])
  })

  it('resets the whole widget from one button below every setting', () => {
    const ui = mount(Editor, { appearance: { theme: null, shadow: board.DEFAULT_SHADOW, variant: null, scale: null } })
    expect(ui.button('Reset')).toBeUndefined()
    const reset = ui.button('Reset to defaults')
    const all = ui.nodes()
    expect(all.indexOf(reset)).toBeGreaterThan(all.findIndex((el) => el.tag === 'own-editor'))
    reset.props.onClick()
    expect(ui.events).toEqual([['reset']])
  })
})

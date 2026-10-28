import * as Vue from 'vue'
import { describe, expect, it } from 'vitest'
import * as variantsModule from '@lifedashboard/contracts/widget-variants'
import * as board from '@lifedashboard/contracts/board'
import { BUILTIN_THEMES } from '../app/theme/builtin'
import * as widgetSettings from '../app/board/widget-settings'
import { compileSfc, mountComponent } from './helpers/sfc-renderer'

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
  '../theme/builtin': { BUILTIN_THEMES },
  './widget-settings': widgetSettings,
  './WidgetConfigForm.vue': GenericForm,
  '../ui/UiSelect.vue': UiSelect,
  '@lifedashboard/contracts/widget-variants': variantsModule,
  './SettingsRow.vue': Row,
  'reka-ui': { Separator: control('separator') },
  ...Object.fromEntries(['Switch', 'Slider', 'ColorField', 'Button'].map(name => [`../ui/Ui${name}.vue`, control(name === 'Button' ? 'button' : `ui-${name.toLowerCase()}`)])),
})
const schema = { type: 'object', properties: { zone: { type: 'string', title: 'Zone', default: 'UTC' } } }

function mount(editor?: Vue.Component, overrides: Record<string, unknown> = {}) {
  return mountComponent(component, {
    appearance: undefined, schema, config: { zone: 'Asia/Tokyo' }, widgetId: 'w1', secrets: new Set(), version: '', versions: [],
    ...(editor ? { editor } : {}), ...overrides,
  }, ['config', 'change', 'version', 'reset'])
}

describe('widget settings panel', () => {
  it('hides Look without variants', () => { expect(mount().text()).not.toContain('Look') })
  it('resolves missing looks and preserves style and shadow when picking a look', () => {
    const variants = { default: 'plain', items: [{ id: 'plain', title: 'Plain' }, { id: 'roman', title: 'Roman numerals' }] }
    const appearance = { themeId: 'foreign', shadow: board.DEFAULT_SHADOW, variant: 'gone' }
    const ui = mount(undefined, { variants, appearance })
    expect(ui.text()).toContain('Look')
    const look = ui.nodes().filter(el => el.tag === 'ui-select')[1]!
    expect(look.props.modelValue).toBe('plain')
    expect(look.props.options).toEqual([{ value: 'plain', label: 'Plain' }, { value: 'roman', label: 'Roman numerals' }])
    look.props.pick('roman')
    expect(ui.events).toEqual([['change', { ...appearance, variant: 'roman' }]])
  })
  it('orders separated blocks and uses themed shadow controls without native inputs', () => {
    const ui = mount(undefined, { versions: ['1'], appearance: { shadow: board.DEFAULT_SHADOW } })
    const text = ui.text()
    expect(text.indexOf('Package')).toBeLessThan(text.indexOf('Appearance'))
    expect(text.indexOf('Appearance')).toBeLessThan(text.indexOf('Widget'))
    expect(ui.nodes().filter(el => el.tag === 'separator')).toHaveLength(3)
    expect(mount().text()).not.toContain('Package')
    expect(mount().nodes().filter(el => el.tag === 'separator')).toHaveLength(2)
    expect(ui.nodes().filter(el => el.tag === 'input')).toHaveLength(0)
    expect(ui.nodes().filter(el => el.tag === 'ui-switch')).toHaveLength(1)
    expect(ui.nodes().filter(el => el.tag === 'ui-slider')).toHaveLength(4)
    expect(ui.nodes().filter(el => el.tag === 'ui-colorfield')).toHaveLength(1)
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

  it('speaks English and picks the style through the themed select', () => {
    const ui = mount(undefined, { appearance: { themeId: null, shadow: board.DEFAULT_SHADOW, variant: null } })
    expect(ui.panel().props['aria-label']).toBe('Widget settings')
    for (const label of ['Style', 'Shadow', 'Blur', 'Color', 'Opacity', 'Reset to defaults']) expect(ui.text()).toContain(label)
    const style = ui.nodes().find((el) => el.tag === 'ui-select')!
    expect(style.props.modelValue).toBe('')
    expect(style.props.options).toEqual([
      { value: '', label: 'Same as board' },
      { value: 'builtin:glass', label: 'Glass' },
      { value: 'builtin:obsidian', label: 'Obsidian' },
      { value: 'builtin:paper', label: 'Paper' },
      { value: board.BARE_THEME_ID, label: 'No frame' },
    ])
    style.props.pick('builtin:paper')
    expect(ui.events).toEqual([['change', { themeId: 'builtin:paper', shadow: board.DEFAULT_SHADOW, variant: null }]])
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
    const ui = mount(undefined, { appearance: { themeId: null, shadow: null, variant: null } })
    const sliders = () => ui.nodes().filter((el) => el.tag === 'ui-slider')
    const colour = () => ui.nodes().find((el) => el.tag === 'ui-colorfield')
    expect(sliders()).toHaveLength(0)
    expect(colour()).toBeUndefined()
    expect(ui.text()).not.toContain('Blur')
    expect(ui.button('Reset to defaults')).toBeDefined()
    ui.props.appearance = { themeId: null, shadow: board.DEFAULT_SHADOW, variant: null }
    await Vue.nextTick()
    expect(sliders().map((el) => el.props.modelValue)).toEqual([board.DEFAULT_SHADOW.x, board.DEFAULT_SHADOW.y, board.DEFAULT_SHADOW.blur, Math.round(board.DEFAULT_SHADOW.opacity * 100)])
    expect(sliders().every((el) => !el.props.disabled)).toBe(true)
    expect(colour()?.props.modelValue).toBe(board.DEFAULT_SHADOW.color)
  })

  it('resets the whole widget from one button below every setting', () => {
    const ui = mount(Editor, { appearance: { themeId: null, shadow: board.DEFAULT_SHADOW, variant: null } })
    expect(ui.button('Reset')).toBeUndefined()
    const reset = ui.button('Reset to defaults')
    const all = ui.nodes()
    expect(all.indexOf(reset)).toBeGreaterThan(all.findIndex((el) => el.tag === 'own-editor'))
    reset.props.onClick()
    expect(ui.events).toEqual([['reset']])
  })
})

import * as Vue from 'vue'
import { describe, expect, it } from 'vitest'
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
const component = compileSfc(new URL('../app/board/WidgetSettings.vue', import.meta.url), {
  '@lifedashboard/contracts/board': board,
  '../theme/builtin': { BUILTIN_THEMES },
  './widget-settings': widgetSettings,
  './WidgetConfigForm.vue': GenericForm,
  '../ui/UiSelect.vue': UiSelect,
})
const schema = { type: 'object', properties: { zone: { type: 'string', title: 'Zone', default: 'UTC' } } }

function mount(editor?: Vue.Component, overrides: Record<string, unknown> = {}) {
  return mountComponent(component, {
    appearance: undefined, schema, config: { zone: 'Asia/Tokyo' }, widgetId: 'w1', secrets: new Set(), version: '', versions: [],
    ...(editor ? { editor } : {}), ...overrides,
  }, ['config', 'change', 'version', 'reset'])
}

describe('widget settings panel', () => {
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
    for (const label of ['Style', 'Shadow', 'Blur', 'Color', 'Opacity', 'Reset widget settings']) expect(ui.text()).toContain(label)
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
    const sliders = () => ui.nodes().filter((el) => el.tag === 'input' && el.props.type === 'range')
    const colour = () => ui.nodes().find((el) => el.tag === 'input' && el.props.type === 'color')
    expect(sliders()).toHaveLength(0)
    expect(colour()).toBeUndefined()
    expect(ui.text()).not.toContain('Blur')
    expect(ui.button('Reset widget settings')).toBeDefined()
    ui.props.appearance = { themeId: null, shadow: board.DEFAULT_SHADOW, variant: null }
    await Vue.nextTick()
    expect(sliders().map((el) => el.props.value)).toEqual([board.DEFAULT_SHADOW.x, board.DEFAULT_SHADOW.y, board.DEFAULT_SHADOW.blur, Math.round(board.DEFAULT_SHADOW.opacity * 100)])
    expect(sliders().every((el) => !el.props.disabled)).toBe(true)
    expect(colour()?.props.value).toBe(board.DEFAULT_SHADOW.color)
  })

  it('resets the whole widget from one button below every setting', () => {
    const ui = mount(Editor, { appearance: { themeId: null, shadow: board.DEFAULT_SHADOW, variant: null } })
    expect(ui.button('Reset')).toBeUndefined()
    const reset = ui.button('Reset widget settings')
    const all = ui.nodes()
    expect(all.indexOf(reset)).toBeGreaterThan(all.findIndex((el) => el.tag === 'own-editor'))
    reset.props.onClick()
    expect(ui.events).toEqual([['reset']])
  })
})

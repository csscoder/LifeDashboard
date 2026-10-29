import * as Vue from 'vue'
import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_FOCUS_SETTINGS, FOCUS_LIMITS } from '@lifedashboard/contracts/focus'
import { compileSfc, mountComponent } from './helpers/sfc-renderer'

const control = (tag: string) => Vue.defineComponent({
  props: { modelValue: null, min: Number, max: Number, integer: Boolean }, emits: ['update:modelValue'],
  setup: (props, { attrs, emit }) => () => Vue.h(tag, { ...attrs, ...props, pick: (value: unknown) => emit('update:modelValue', value) }),
})
const Row = Vue.defineComponent({ props: ['label'], setup: (props, { slots }) => () => Vue.h('settings-row', { label: props.label }, slots.default?.()) })

function mount(saveResult: string | null = null, props: Record<string, unknown> = {}) {
  const store = { state: Vue.reactive({ settings: { ...DEFAULT_FOCUS_SETTINGS } }), saveSettings: vi.fn((): string | null => saveResult) }
  const component = compileSfc(new URL('../app/widgets/builtin/pomodoro/PomodoroSettings.vue', import.meta.url), {
    '@lifedashboard/contracts/focus': { FOCUS_LIMITS },
    '../../../focus/store': { focusStore: store },
    '../../../board/SettingsRow.vue': Row,
    '../../../ui/UiNumberField.vue': control('ui-number-field'),
    '../../../ui/UiSwitch.vue': control('ui-switch'),
  })
  const ui = mountComponent(component, props, ['change'])
  const field = (label: string) => ui.nodes().find((el) => el.tag === 'settings-row' && el.props.label === label)!.children[0]!
  return { store, ui, field }
}

describe('pomodoro settings', () => {
  it('fields and bounds', () => {
    const { ui, field } = mount()
    const numbers: [string, number, number][] = [['Focus, min', 1, 120], ['Short break, min', 1, 60], ['Long break, min', 1, 60], ['Long break after', 2, 12], ['Daily goal', 1, 24]]
    for (const [label, min, max] of numbers) {
      expect(field(label).tag).toBe('ui-number-field')
      expect([field(label).props.min, field(label).props.max, field(label).props.integer]).toEqual([min, max, true])
    }
    for (const label of ['Auto-start breaks', 'Auto-start focus', 'Sound']) expect(field(label).tag).toBe('ui-switch')
    expect(ui.text()).toContain('Shared by all Pomodoro widgets')
  })
  it('a change saves settings', () => {
    const { store, ui, field } = mount()
    field('Daily goal').props.pick(10)
    expect(store.saveSettings).toHaveBeenCalledWith({ ...DEFAULT_FOCUS_SETTINGS, dailyGoal: 10 })
    expect(ui.events).toEqual([])
  })
  it('the panel bindings never reach the root element', () => {
    // WidgetSettings binds schema, config and @change on every editor; a native change from a field must not become a config.
    const { ui, field } = mount(null, { schema: { fields: [] }, config: { a: 1 } })
    const root = ui.nodes().find((el) => el.props.class === 'pomodoro-settings')!
    expect([root.props.onChange, root.props.config, root.props.schema]).toEqual([undefined, undefined, undefined])
    field('Focus, min').dispatchEvent(new Event('change', { bubbles: true }))
    expect(ui.events).toEqual([])
  })
  it('shows a settings error', async () => {
    const { ui, field } = mount('focus must be between 1 and 120')
    field('Sound').props.pick(false)
    await Vue.nextTick()
    expect(ui.text()).toContain('focus must be between 1 and 120')
  })
})

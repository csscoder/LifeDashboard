import * as Vue from 'vue'
import { describe, expect, it, vi } from 'vitest'
import * as settings from '@lifedashboard/contracts/widget-settings'
import * as secrets from '@lifedashboard/contracts/widget-secrets'
import { api } from '../app/api'
import * as logic from '../app/board/config-form'
import { compileSfc, mountComponent } from './helpers/sfc-renderer'

const part = (name: string) => Vue.defineComponent({ name, setup: (_, { attrs, slots }) => () => Vue.h(name, attrs, slots.default?.()) })
const modules = Object.fromEntries(['UiTextField', 'UiSelect', 'UiSwitch', 'UiNumberField', 'UiButton'].map(name => [`../ui/${name}.vue`, part(name)]))
const mount = () => mountComponent(compileSfc(new URL('../app/board/WidgetConfigForm.vue', import.meta.url), {
  ...modules, './SettingsRow.vue': part('SettingsRow'),
  '@lifedashboard/contracts/widget-settings': settings, '@lifedashboard/contracts/widget-secrets': secrets,
  '../api': { api }, '../widgets/secret-flags': { refreshSecretFlags: vi.fn() }, './config-form': logic,
}), { schema: { type: 'object', properties: {
  city: { type: 'string', title: 'City', default: 'Paris' }, mode: { type: 'string', title: 'Mode', default: 'a', enum: ['a', 'b'] },
  enabled: { type: 'boolean', title: 'Enabled', default: false }, count: { type: 'integer', title: 'Count', default: 1 },
  scale: { type: 'number', title: 'Scale', default: 1 }, token: { type: 'secret', title: 'Token', bind: { origin: 'https://example.com', header: 'Authorization' } },
} }, config: {}, widgetId: 'widget', secrets: new Set() }, ['change'])

describe('WidgetConfigForm controls', () => {
  it('uses typed UI controls without native inputs', () => {
    const ui = mount()
    expect(ui.nodes().filter(n => /^Ui/.test(n.tag)).map(n => n.tag)).toEqual(['UiTextField', 'UiSelect', 'UiSwitch', 'UiNumberField', 'UiNumberField', 'UiTextField', 'UiButton', 'UiButton'])
    expect(ui.nodes().filter(n => n.tag === 'input')).toHaveLength(0)
    expect(ui.nodes().filter(n => n.tag === 'UiNumberField').map(n => n.props.integer)).toEqual([true, false])
    expect(ui.nodes().filter(n => n.tag === 'UiTextField')[1]!.props.type).toBe('password')
  })
  it('initializes and resets the password model to an empty string', async () => {
    const ui = mount()
    const password = () => ui.nodes().find(n => n.tag === 'UiTextField' && n.props.type === 'password')!
    expect(password().props['model-value'] ?? password().props.modelValue).toBe('')
    password().props['onUpdate:modelValue']('draft secret')
    await Vue.nextTick()
    ui.props.widgetId = 'another-widget'
    await Vue.nextTick()
    expect(password().props['model-value'] ?? password().props.modelValue).toBe('')
  })
  it('marks only required unset secret status as a warning', async () => {
    const ui = mount()
    ui.props.schema.required = ['token']
    await Vue.nextTick()
    const row = () => ui.nodes().find(n => n.tag === 'SettingsRow' && n.props.label === 'Token')!
    expect(row().props.warning).toBe(true)
    expect(row().props.value).toBe('not set')
    ui.props.secrets.add('token')
    await Vue.nextTick()
    expect(row().props.warning).toBe(false)
    expect(row().props.value).toBe('set')
  })
  it('merges switch updates and text commits, preserving consecutive edits', () => {
    const ui = mount()
    ui.nodes().find(n => n.tag === 'UiSwitch')!.props['onUpdate:modelValue'](true)
    ui.nodes().find(n => n.tag === 'UiTextField')!.props.onCommit('Berlin')
    expect(ui.events).toEqual([
      ['change', { city: 'Paris', mode: 'a', enabled: true, count: 1, scale: 1 }],
      ['change', { city: 'Berlin', mode: 'a', enabled: true, count: 1, scale: 1 }],
    ])
  })
  it('resets the draft on config replacement and emits plain cloneable objects', async () => {
    const ui = mount()
    ui.nodes().find(n => n.tag === 'UiTextField')!.props.onCommit('Berlin')
    ui.props.config = { city: 'London', enabled: false, count: 2 }
    await Vue.nextTick()
    ui.nodes().find(n => n.tag === 'UiSwitch')!.props['onUpdate:modelValue'](true)
    expect(ui.events.at(-1)).toEqual(['change', { city: 'London', mode: 'a', enabled: true, count: 2, scale: 1 }])
    for (const [, config] of ui.events) {
      expect(Vue.isProxy(config)).toBe(false)
      expect(structuredClone(config)).toEqual(config)
    }
  })
  it('shows the minimum hint only for a nonempty short password', async () => {
    const ui = mount()
    const hint = `At least ${secrets.SECRET_MIN_LENGTH} characters`
    const password = () => ui.nodes().filter(n => n.tag === 'UiTextField')[1]!
    expect(password().props.minlength).toBe(secrets.SECRET_MIN_LENGTH)
    for (const length of [1, secrets.SECRET_MIN_LENGTH - 1, secrets.SECRET_MIN_LENGTH, 0]) {
      password().props['onUpdate:modelValue']('x'.repeat(length))
      await Vue.nextTick()
      expect(ui.text().includes(hint)).toBe(length > 0 && length < secrets.SECRET_MIN_LENGTH)
    }
  })
  it('remounts text controls after rejecting invalid commits to restore stored input', async () => {
    const ui = mount()
    const before = ui.nodes().find(n => n.tag === 'UiTextField')!
    before.props.onCommit('x'.repeat(settings.SETTINGS_LIMITS.maxLength + 1))
    await Vue.nextTick()
    expect(ui.nodes().find(n => n.tag === 'UiTextField')).not.toBe(before)
    expect(ui.nodes().find(n => n.tag === 'UiTextField')!.props['model-value']).toBe('Paris')
    expect(ui.events).toEqual([])
  })
  it('enables Set on password model updates without requiring commit', async () => {
    const spy = vi.spyOn(api, 'setWidgetSecret').mockResolvedValue({ ok: true, data: {} })
    try {
      const ui = mount()
      const set = () => ui.nodes().find(n => n.tag === 'UiButton' && n.children.some(c => c.text === 'Set'))!
      expect(set().props.disabled).toBe(true)
      const password = 'x'.repeat(secrets.SECRET_MIN_LENGTH)
      ui.nodes().filter(n => n.tag === 'UiTextField')[1]!.props['onUpdate:modelValue'](password)
      await Vue.nextTick()
      expect(set().props.disabled).toBe(false)
      await set().props.onClick()
      expect(spy).toHaveBeenCalledWith('widget', 'token', password)
    } finally { spy.mockRestore() }
  })
})

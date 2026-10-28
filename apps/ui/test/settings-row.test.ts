import { useFieldBridge } from '../app/ui/field-bridge'
import * as Vue from 'vue'
import { afterEach, expect, it, vi } from 'vitest'
import { compileSfc, mountComponent } from './helpers/sfc-renderer'

it('groups label, required marker, control, value, description and error in one FieldRoot', () => {
  const reka = Object.fromEntries(['FieldRoot', 'FieldLabel', 'FieldDescription', 'FieldError'].map(name => [name, Vue.defineComponent({ setup: (_, { attrs, slots }) => () => Vue.h(name, attrs, slots.default?.()) })]))
  const Row = compileSfc(new URL('../app/board/SettingsRow.vue', import.meta.url), { 'reka-ui': reka })
  const ui = mountComponent(Vue.defineComponent({ setup: () => () => Vue.h(Row, { label: 'Size', required: true, description: 'Choose size', error: 'Invalid size', value: '12 px' }, () => Vue.h('control')) }), {}, [])
  const root = ui.nodes().find(n => n.tag === 'FieldRoot')!
  expect(root).toBeDefined()
  expect(ui.nodes().filter(n => n.tag === 'FieldRoot')).toHaveLength(1)
  expect(root.children.filter(n => n.tag !== '#text' && n.tag !== '#comment').map(n => n.tag)).toEqual(['FieldLabel', 'control', 'FieldDescription', 'FieldDescription', 'FieldError'])
  expect(ui.text()).toContain('Size')
  expect(ui.text()).toContain('*')
  expect(ui.text()).toContain('required')
  expect(ui.nodes().find(n => n.tag === 'FieldDescription' && !n.props.as)!.children.map(n => n.text).join('')).toBe('Choose size')
  expect(ui.nodes().find(n => n.tag === 'FieldError')!.children.map(n => n.text).join('')).toBe('Invalid size')
})

afterEach(() => vi.unstubAllGlobals())

it.each([false, true])('associates real Reka fields and secret status, consumer attrs=%s', async (consumerAttrs) => {
  vi.stubGlobal('document', { getElementById: () => null, querySelector: () => null })
  vi.stubGlobal('Element', class { static [Symbol.hasInstance](value: any) { return !!value?.tag } })
  const reka = await import('reka-ui')
  const { numberFormatOptions } = await import('../app/ui/number-format')
  const Row = compileSfc(new URL('../app/board/SettingsRow.vue', import.meta.url), { 'reka-ui': reka })
  const compile = (name: string) => compileSfc(new URL(`../app/ui/${name}.vue`, import.meta.url), { 'reka-ui': reka, './field-bridge': { useFieldBridge }, './number-format': { numberFormatOptions } })
  const controls = [compile('UiSwitch'), compile('UiNumberField'), compile('UiTextField')]
  const ui = mountComponent(Vue.defineComponent({ setup: (_, { attrs }) => () => Vue.h('div', controls.map((Control, index) => Vue.h(Row, {
    label: ['Enabled', 'Count', 'Token'][index], description: 'Help text', required: true,
    ...(index === 2 ? { value: attrs.saved ? 'set' : 'not set', warning: !attrs.saved } : {}),
  }, () => Vue.h(Control, { ...(consumerAttrs ? { id: `consumer-${index}`, 'aria-labelledby': 'consumer-label', 'aria-describedby': 'consumer-help' } : {}), modelValue: index === 0 ? false : index === 1 ? 2 : '', integer: true, ...(index === 2 ? { type: 'password' } : {}) })))) }), { saved: false }, [])
  await Vue.nextTick()
  const labels = ui.nodes().filter(n => n.tag === 'label')
  const inputs = ui.nodes().filter(n => n.tag === 'button' && n.props.role === 'switch' || n.tag === 'input' && n.props.type !== 'hidden')
  expect(inputs).toHaveLength(3)
  for (const [index, control] of inputs.entries()) {
    expect(control.props.id).toBe(labels[index]!.props.for)
    expect(String(control.props['aria-labelledby']).split(' ')).toContain(labels[index]!.props.id)
    const ids = String(control.props['aria-describedby']).split(' ')
    if (consumerAttrs) {
      expect(ui.nodes().filter(n => n.props.id === `consumer-${index}`)).toEqual([control])
      expect(String(control.props['aria-labelledby']).split(' ')).toContain('consumer-label')
      expect(ids).toContain('consumer-help')
    }
    expect(ui.nodes().some(n => ids.includes(n.props.id) && n.children.some(c => c.text === 'Help text'))).toBe(true)
  }
  const password = inputs[2]!
  const status = ui.nodes().find(n => n.tag === 'output')!
  expect(String(password.props['aria-describedby']).split(' ')).toContain(status.props.id)
  expect(status.children.map(n => n.text).join('')).toBe('not set')
  expect(status.props.class).toContain('settings-row__warning')
  ui.props.saved = true
  await Vue.nextTick()
  expect(status.props.class).not.toContain('settings-row__warning')
  expect(status.children.map(n => n.text).join('')).toBe('set')
})

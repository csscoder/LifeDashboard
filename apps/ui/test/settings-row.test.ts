import * as Vue from 'vue'
import { expect, it } from 'vitest'
import { compileSfc, mountComponent } from './helpers/sfc-renderer'

it('groups label, required marker, control, value, description and error in one FieldRoot', () => {
  const reka = Object.fromEntries(['FieldRoot', 'FieldLabel', 'FieldDescription', 'FieldError'].map(name => [name, Vue.defineComponent({ setup: (_, { attrs, slots }) => () => Vue.h(name, attrs, slots.default?.()) })]))
  const Row = compileSfc(new URL('../app/board/SettingsRow.vue', import.meta.url), { 'reka-ui': reka })
  const ui = mountComponent(Vue.defineComponent({ setup: () => () => Vue.h(Row, { label: 'Size', required: true, description: 'Choose size', error: 'Invalid size', value: '12 px' }, () => Vue.h('control')) }), {}, [])
  const root = ui.nodes().find(n => n.tag === 'FieldRoot')!
  expect(root).toBeDefined()
  expect(ui.nodes().filter(n => n.tag === 'FieldRoot')).toHaveLength(1)
  expect(root.children.filter(n => n.tag !== '#text' && n.tag !== '#comment').map(n => n.tag)).toEqual(['FieldLabel', 'control', 'output', 'FieldDescription', 'FieldError'])
  expect(ui.text()).toContain('Size')
  expect(ui.text()).toContain('*')
  expect(ui.text()).toContain('required')
  expect(ui.nodes().find(n => n.tag === 'FieldDescription')!.children.map(n => n.text).join('')).toBe('Choose size')
  expect(ui.nodes().find(n => n.tag === 'FieldError')!.children.map(n => n.text).join('')).toBe('Invalid size')
})

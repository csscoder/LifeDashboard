import * as Vue from 'vue'
import * as reka from 'reka-ui'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useFieldBridge } from '../app/ui/field-bridge'
import { numberFormatOptions } from '../app/ui/number-format'
import { compileSfc, mountComponent, type HostNode } from './helpers/sfc-renderer'

const compile = (name: string) => compileSfc(new URL(`../app/ui/${name}.vue`, import.meta.url), {
  'reka-ui': reka, './field-bridge': { useFieldBridge }, './number-format': { numberFormatOptions },
})
const Row = compileSfc(new URL('../app/board/SettingsRow.vue', import.meta.url), { 'reka-ui': reka })

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} })
  vi.stubGlobal('document', { getElementById: () => null, querySelector: () => null })
  vi.stubGlobal('Element', class { static [Symbol.hasInstance](value: any) { return !!value?.tag } })
})
afterEach(() => vi.unstubAllGlobals())

// Run the actual listeners rendered by Reka, in DOM capture/bubble order.
function dispatch(node: HostNode, name: string, detail: Record<string, unknown> = {}) {
  const event = { target: node, preventDefault() {}, ...detail }
  for (const prop of [`on${name}Capture`, `on${name}`]) {
    const listeners = node.props[prop]
    for (const listener of Array.isArray(listeners) ? listeners : listeners ? [listeners] : []) listener(event)
  }
}
function inputElement(node: HostNode) {
  Object.defineProperty(node, 'value', { configurable: true, get: () => node.props.value, set: value => { node.props.value = value } })
  return node as HostNode & { value: string }
}

async function mountControl(name: string, props: Record<string, unknown>) {
  const Control = compile(name)
  const value = Vue.ref(props.modelValue)
  const changes: unknown[] = []
  const ui = mountComponent(Vue.defineComponent({ setup: () => () => Vue.h(Control, {
    ...props, modelValue: value.value, 'onUpdate:modelValue': (next: unknown) => { changes.push(next); value.value = next },
  }) }), {}, [])
  await Vue.nextTick()
  const input = inputElement(ui.nodes().find(n => n.tag === 'input')!)
  return { ui, input, changes, value }
}

async function typeAndCommit(input: HostNode & { value: string }, text: string) {
  input.value = text
  dispatch(input, 'Input')
  dispatch(input, 'Blur')
  await Vue.nextTick()
}

describe('UiNumberField with real Reka', () => {
  it.each([
    { min: 0.5, max: 5, text: '2', expected: 2 },
    { min: -4.5, max: -0.5, text: '-2', expected: -2 },
    { min: 0.5, max: 4.5, text: '0', expected: 1 },
    { min: 0.5, max: 4.5, text: '9', expected: 4 },
  ])('commits $text with min=$min and max=$max as $expected', async ({ min, max, text, expected }) => {
    const { input, changes } = await mountControl('UiNumberField', { modelValue: 3, integer: true, min, max })
    await typeAndCommit(input, text)
    expect(changes).toEqual([expected])
    expect(input.props.value).toBe(String(expected))
  })
  it('steps and uses Home/End within the permitted integer bounds', async () => {
    const { input, changes } = await mountControl('UiNumberField', { modelValue: 2, integer: true, min: 0.5, max: 4.5 })
    for (const key of ['ArrowUp', 'ArrowDown', 'Home', 'End']) {
      dispatch(input, 'Keydown', { key })
      await Vue.nextTick()
    }
    expect(changes).toEqual([3, 2, 1, 4])
  })
})

describe('UiColorField with real Reka', () => {
  it.each([
    ['ArrowUp', '#123457'], ['ArrowDown', '#123455'], ['PageUp', '#123460'],
    ['PageDown', '#12344c'], ['Home', '#000000'], ['End', '#ffffff'],
  ])('accepts %s on an untouched input', async (key, expected) => {
    const { input, changes } = await mountControl('UiColorField', { modelValue: '#123456' })
    dispatch(input, 'Focus')
    dispatch(input, 'Keydown', { key })
    await Vue.nextTick()
    expect(changes).toEqual([expected])
    expect(input.props.value).toBe(expected)
  })
  it.each(['#11223380', '#112233ff'])('rejects typed alpha %s without poisoning later keyboard/wheel steps', async raw => {
    const { input, changes } = await mountControl('UiColorField', { modelValue: '#123456' })
    await typeAndCommit(input, raw)
    expect(changes).toEqual([])
    expect(input.props.value).toBe('#123456')
    dispatch(input, 'Focus')
    dispatch(input, 'Keydown', { key: 'ArrowUp' })
    await Vue.nextTick()
    dispatch(input, 'Wheel', { deltaY: -1 })
    await Vue.nextTick()
    expect(changes).toEqual(['#123457', '#123458'])
  })
  it('accepts a focused wheel step before typing', async () => {
    const { input, changes } = await mountControl('UiColorField', { modelValue: '#123456' })
    dispatch(input, 'Focus')
    dispatch(input, 'Wheel', { deltaY: 1 })
    await Vue.nextTick()
    expect(changes).toEqual(['#123455'])
  })
  it('accepts six-digit text and rejects alpha committed with Enter', async () => {
    const { input, changes } = await mountControl('UiColorField', { modelValue: '#000000' })
    await typeAndCommit(input, '#11AA33')
    expect(changes).toEqual(['#11aa33'])
    input.value = '#112233ff'
    dispatch(input, 'Input')
    dispatch(input, 'Keydown', { key: 'Enter' })
    await Vue.nextTick()
    expect(changes).toEqual(['#11aa33'])
  })
})

it.each([
  { name: 'UiColorField', consumerAttrs: false }, { name: 'UiColorField', consumerAttrs: true },
  { name: 'UiSlider', consumerAttrs: false }, { name: 'UiSlider', consumerAttrs: true },
])('associates $name with its real label, description and error (consumer attrs=$consumerAttrs)', async ({ name, consumerAttrs }) => {
  const Control = compile(name)
  const ui = mountComponent(Vue.defineComponent({ setup: () => () => Vue.h(Row, {
    label: 'Shadow', description: 'Help text', error: 'Invalid value', nativeLabel: name !== 'UiSlider',
  }, () => Vue.h(Control, { ...(consumerAttrs ? { id: 'custom-id', 'aria-labelledby': 'custom-label', 'aria-describedby': 'custom-help' } : {}), modelValue: name === 'UiSlider' ? 2 : '#123456', min: 0, max: 10 })) }), {}, [])
  await Vue.nextTick()
  const label = ui.nodes().find(n => n.tag === 'label')!
  const control = ui.nodes().find(n => n.tag === 'input' || n.props.role === 'slider')!
  expect(control.props.id).toBeTruthy()
  expect(String(control.props['aria-labelledby']).split(' ')).toContain(label.props.id)
  const descriptions = String(control.props['aria-describedby']).split(' ')
  for (const text of ['Help text', 'Invalid value']) {
    expect(ui.nodes().some(n => descriptions.includes(n.props.id) && n.children.some(c => c.text === text))).toBe(true)
  }
  expect(control.props['aria-invalid']).toBe(true)
  if (consumerAttrs) {
    expect(ui.nodes().filter(n => n.props.id === 'custom-id')).toEqual([control])
    expect(String(control.props['aria-labelledby']).split(' ')).toContain('custom-label')
    expect(descriptions).toContain('custom-help')
  }
  if (name === 'UiSlider') {
    expect(label.props.for).toBeUndefined()
    dispatch(label, 'Click')
    expect(control.focused).toBe(true)
  } else expect(label.props.for).toBe(control.props.id)
})

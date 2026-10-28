import * as Vue from 'vue'
import { numberFormatOptions } from '../app/ui/number-format'
import { DEFAULT_SHADOW, parseScreenBoard } from '@lifedashboard/contracts/board'
import { describe, expect, it } from 'vitest'
import { compileSfc, mountComponent } from './helpers/sfc-renderer'

const part = (name: string) => Vue.defineComponent({ name, setup: (_, { slots }) => () => Vue.h(name, null, slots.default?.()) })
const reka = Object.fromEntries([
  'SwitchRoot', 'SwitchThumb', 'SliderRoot', 'SliderTrack', 'SliderRange', 'SliderThumb',
  'RadioGroupRoot', 'RadioGroupItem', 'RadioGroupIndicator',
  'NumberFieldRoot', 'NumberFieldInput', 'ColorFieldRoot', 'ColorFieldInput', 'FieldControl',
].map(name => [name, part(name)]))
Object.assign(reka, { Primitive: Vue.defineComponent({ props: ['as'], setup: (props, { slots }) => () => Vue.h(props.as, null, slots.default?.()) }) })
const compile = (name: string) => compileSfc(new URL(`../app/ui/${name}.vue`, import.meta.url), { 'reka-ui': reka, './number-format': { numberFormatOptions } })
const attrs = { id: 'setting', 'aria-describedby': 'hint' }

for (const control of [
  { name: 'UiSwitch', root: 'SwitchRoot', focus: 'SwitchRoot', value: true, next: false, emitted: false, extra: {} },
  { name: 'UiSlider', root: 'SliderRoot', focus: 'SliderThumb', value: 8, next: [12], emitted: 12, extra: { min: 0, max: 20 } },
  { name: 'UiRadioGroup', root: 'RadioGroupRoot', focus: 'RadioGroupRoot', value: 'a', next: 'b', emitted: 'b', extra: { options: [{ value: 'a', label: 'Alpha' }, { value: 'b', label: 'Beta' }] } },
]) {
  describe(control.name, () => {
    it('forwards attributes only to its named focusable part and disabled to its root', () => {
      const ui = mountComponent(compile(control.name), { ...attrs, ...control.extra, modelValue: control.value, disabled: true }, [])
      expect(ui.nodes().filter(node => node.props.id === 'setting').map(node => node.tag)).toEqual([control.focus])
      expect(ui.nodes().find(node => node.tag === control.focus)?.props['aria-describedby']).toBe('hint')
      expect(ui.nodes().find(node => node.tag === control.root)?.props.disabled).toBe(true)
    })
    it('adapts the model and re-emits typed updates', () => {
      const ui = mountComponent(compile(control.name), { ...control.extra, modelValue: control.value }, ['update:modelValue'])
      const root = ui.nodes().find(node => node.tag === control.root)!
      expect(root.props['model-value']).toEqual(control.name === 'UiSlider' ? [control.value] : control.value)
      root.props['onUpdate:modelValue'](control.next)
      expect(ui.events).toEqual([['update:modelValue', control.emitted]])
      if (control.name === 'UiSlider') expect(root.props).toMatchObject({ min: 0, max: 20, step: 1 })
      if (control.name === 'UiRadioGroup') {
        expect(ui.nodes().filter(node => node.tag === 'RadioGroupItem').map(node => node.props.value)).toEqual(['a', 'b'])
        expect(ui.nodes().filter(node => node.tag === 'label').map(node => node.text)).toEqual(['Alpha', 'Beta'])
        expect(ui.nodes().filter(node => node.tag === 'RadioGroupIndicator')).toHaveLength(2)
      }
    })
  })
}

describe('UiButton', () => {
  it('renders a non-submit button and forwards attrs, disabled, click and slot', () => {
    const Button = compile('UiButton')
    const ui = mountComponent(Vue.defineComponent({ setup: (_, { attrs: passed }) => () => Vue.h(Button, passed, () => 'Save') }), { ...attrs, disabled: true }, ['click'])
    const button = ui.nodes().find(node => node.tag === 'button')!
    expect(button.props).toMatchObject({ ...attrs, type: 'button', disabled: true, class: 'ui-button' })
    expect(ui.text()).toContain('Save')
    const event = new Event('click')
    button.props.onClick(event)
    expect(ui.events).toEqual([['click', event]])
  })
})


describe('UiNumberField', () => {
  const mount = (integer = false) => mountComponent(compile('UiNumberField'), { ...attrs, modelValue: 2, integer, min: -5, max: 10, disabled: true }, ['update:modelValue'])
  it.each([false, true])('configures number formatting and bounds for integer=%s', integer => {
    const ui = mount(integer)
    expect(ui.nodes().find(n => n.tag === 'NumberFieldRoot')!.props).toMatchObject({
      'step-snapping': integer, step: integer ? 1 : undefined,
      'format-options': integer ? { useGrouping: false, maximumFractionDigits: 0 } : { useGrouping: false, maximumSignificantDigits: 17 }, min: -5, max: 10, disabled: true,
    })
    expect(ui.nodes().filter(n => n.props.id === 'setting').map(n => n.tag)).toEqual(['NumberFieldInput'])
  })
  it.each([1.25, 0.125, -5, 10])('preserves valid value %s', value => {
    const ui = mount()
    ui.nodes().find(n => n.tag === 'NumberFieldRoot')!.props['onUpdate:modelValue'](value)
    expect(ui.events).toEqual([['update:modelValue', value]])
  })
  it.each([NaN, null, 11, -6, Infinity])('does not emit invalid number %s', value => {
    const ui = mount()
    ui.nodes().find(n => n.tag === 'NumberFieldRoot')!.props['onUpdate:modelValue'](value)
    expect(ui.events).toEqual([])
  })
  it('rejects fractional integers', () => {
    const ui = mount(true)
    ui.nodes().find(n => n.tag === 'NumberFieldRoot')!.props['onUpdate:modelValue'](2.5)
    expect(ui.events).toEqual([])
  })
  it('restores the last value after an empty entry', async () => {
    const ui = mount()
    const before = ui.nodes().find(n => n.tag === 'NumberFieldRoot')!
    before.props['onUpdate:modelValue'](null)
    await Vue.nextTick()
    const after = ui.nodes().find(n => n.tag === 'NumberFieldRoot')!
    expect(after).not.toBe(before)
    expect(after.props['model-value']).toBe(2)
  })
})

describe('UiColorField', () => {
  it.each([
    ['#11AA33', '#11aa33', '#11aa33'], ['11AA33', '#11AA33', '#11aa33'],
    ['#11223380', '#11223380', null], ['#112233ff', '#112233', null],
  ])('validates raw input %s before accepting reka value %s', (raw, normalized, expected) => {
    const ui = mountComponent(compile('UiColorField'), { ...attrs, modelValue: '#000000', disabled: true }, ['update:modelValue'])
    const input = ui.nodes().find(n => n.tag === 'ColorFieldInput')!
    expect(ui.nodes().filter(n => n.props.id === 'setting').map(n => n.tag)).toEqual(['ColorFieldInput'])
    const root = ui.nodes().find(n => n.tag === 'ColorFieldRoot')!
    expect(root.props.disabled).toBe(true)
    input.props.onInputCapture({ target: { value: raw } })
    root.props['onUpdate:modelValue'](normalized)
    expect(ui.events).toEqual(expected ? [['update:modelValue', expected]] : [])
    if (expected) expect(parseScreenBoard({ id: '11111111-1111-4111-8111-111111111111', rows: 8, instances: [{ id: '22222222-2222-4222-8222-222222222222', source: { kind: 'builtin', type: 'clock' }, configVersion: 1, config: {}, appearance: { themeId: null, variant: null, shadow: { ...DEFAULT_SHADOW, color: ui.events[0]![1] } } }], layout: [{ instanceId: '22222222-2222-4222-8222-222222222222', x: 0, y: 0, w: 1, h: 1 }] }).ok).toBe(true)
  })
})

describe('UiTextField', () => {
  it('forwards attributes and text constraints to FieldControl', () => {
    const ui = mountComponent(compile('UiTextField'), { ...attrs, modelValue: '', type: 'password', minlength: 3, maxlength: 20, autocomplete: 'off', disabled: true }, [])
    expect(ui.nodes().find(n => n.tag === 'FieldControl')!.props).toMatchObject({ ...attrs, type: 'password', minlength: 3, maxlength: 20, autocomplete: 'off', disabled: true })
  })
  it('emits every input separately from change commits', () => {
    const ui = mountComponent(compile('UiTextField'), { modelValue: '' }, ['update:modelValue', 'commit'])
    const input = ui.nodes().find(n => n.tag === 'FieldControl')!
    input.props.onInput({ target: { value: 'abc' } })
    expect(ui.events).toEqual([['update:modelValue', 'abc']])
    input.props.onChange({ target: { value: 'Berlin' } })
    expect(ui.events).toEqual([['update:modelValue', 'abc'], ['commit', 'Berlin']])
  })
})

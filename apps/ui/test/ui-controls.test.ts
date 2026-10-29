import { useFieldBridge } from '../app/ui/field-bridge'
import * as Vue from 'vue'
import { numberFormatOptions } from '../app/ui/number-format'
import { DEFAULT_SHADOW, parseScreenBoard } from '@lifedashboard/contracts/board'
import { describe, expect, it } from 'vitest'
import { compileSfc, mountComponent } from './helpers/sfc-renderer'

const part = (name: string) => Vue.defineComponent({ name, setup: (_, { slots }) => () => Vue.h(name, null, slots.default?.({})) })
const reka = Object.fromEntries([
  'SwitchRoot', 'SwitchThumb', 'SliderRoot', 'SliderTrack', 'SliderRange', 'SliderThumb',
  'RadioGroupRoot', 'RadioGroupItem', 'RadioGroupIndicator',
  'NumberFieldRoot', 'NumberFieldInput', 'NumberFieldIncrement', 'NumberFieldDecrement', 'ColorFieldRoot', 'ColorFieldInput', 'FieldControl',
  'PopoverRoot', 'PopoverTrigger', 'PopoverContent', 'ColorSwatch',
  'ColorAreaRoot', 'ColorAreaArea', 'ColorAreaThumb', 'ColorSliderRoot', 'ColorSliderTrack', 'ColorSliderThumb',
].map(name => [name, part(name)]))
Object.assign(reka, { Primitive: Vue.defineComponent({ props: ['as'], setup: (props, { slots }) => () => Vue.h(props.as, null, slots.default?.()) }) })
const compile = (name: string) => compileSfc(new URL(`../app/ui/${name}.vue`, import.meta.url), { 'reka-ui': reka, './field-bridge': { useFieldBridge }, './number-format': { numberFormatOptions } })
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
  it('renders step buttons only with `stepper`', () => {
    const tags = (stepper: boolean) => mountComponent(compile('UiNumberField'), { modelValue: 2, integer: true, stepper }, ['update:modelValue']).nodes().map(n => n.tag)
    expect(tags(false)).not.toContain('NumberFieldIncrement')
    expect(tags(false)).not.toContain('NumberFieldDecrement')
    expect(tags(true)).toEqual(expect.arrayContaining(['NumberFieldDecrement', 'NumberFieldInput', 'NumberFieldIncrement']))
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
    if (expected) expect(parseScreenBoard({ id: '11111111-1111-4111-8111-111111111111', rows: 8, instances: [{ id: '22222222-2222-4222-8222-222222222222', source: { kind: 'builtin', type: 'clock' }, configVersion: 1, config: {}, appearance: { theme: null, variant: null, shadow: { ...DEFAULT_SHADOW, color: ui.events[0]![1] } } }], layout: [{ instanceId: '22222222-2222-4222-8222-222222222222', x: 0, y: 0, w: 1, h: 1 }] }).ok).toBe(true)
  })
})

describe('UiColorField picker', () => {
  it('opens a saturation and brightness area with a hue slider from the swatch', () => {
    const ui = mountComponent(compile('UiColorField'), { modelValue: '#2d6687', disabled: true }, [])
    const trigger = ui.nodes().find(n => n.tag === 'PopoverTrigger')!
    expect(trigger.props).toMatchObject({ 'aria-label': 'Pick color', disabled: true })
    expect(ui.nodes().find(n => n.tag === 'ColorSwatch')!.props.color).toBe('#2d6687')
    expect(ui.nodes().find(n => n.tag === 'ColorAreaRoot')!.props).toMatchObject({ 'model-value': '#2d6687', 'color-space': 'hsb', 'x-channel': 'saturation', 'y-channel': 'brightness' })
    expect(ui.nodes().find(n => n.tag === 'ColorSliderRoot')!.props).toMatchObject({ 'model-value': '#2d6687', 'color-space': 'hsb', channel: 'hue' })
    expect(ui.nodes().some(n => n.tag === 'ColorFieldInput')).toBe(true)
  })
  it('emits #rrggbb from the picker and keeps the picked hue on black', async () => {
    const ui = mountComponent(compile('UiColorField'), { modelValue: '#2d6687' }, ['update:modelValue'])
    const area = () => ui.nodes().find(n => n.tag === 'ColorAreaRoot')!
    const slider = () => ui.nodes().find(n => n.tag === 'ColorSliderRoot')!
    const black = { space: 'hsb', h: 200, s: 40, b: 0, alpha: 1 }
    area().props['onUpdate:modelValue']('#000000')
    area().props['onUpdate:color'](black)
    ui.props.modelValue = '#000000'
    await Vue.nextTick()
    expect(ui.events).toEqual([['update:modelValue', '#000000']])
    expect(area().props['model-value']).toEqual(black)
    expect(slider().props['model-value']).toEqual(black)
    slider().props['onUpdate:modelValue']('#11AA33')
    expect(ui.events.at(-1)).toEqual(['update:modelValue', '#11aa33'])
    ui.props.modelValue = '#ff0000'
    await Vue.nextTick()
    expect(area().props['model-value']).toBe('#ff0000')
  })
})

describe('UiColorField opacity', () => {
  const sliders = (ui: ReturnType<typeof mountComponent>) => ui.nodes().filter(n => n.tag === 'ColorSliderRoot')
  it('adds an opacity slider and a transparent swatch only with an alpha model', () => {
    expect(sliders(mountComponent(compile('UiColorField'), { modelValue: '#2d6687' }, [])).map(n => n.props.channel)).toEqual(['hue'])
    const ui = mountComponent(compile('UiColorField'), { modelValue: '#2d6687', alpha: 0.5 }, [])
    expect(sliders(ui).map(n => n.props.channel)).toEqual(['hue', 'alpha'])
    expect(ui.nodes().find(n => n.tag === 'ColorSwatch')!.props.color).toBe('#2d668780')
    expect(sliders(ui)[1]!.props['model-value']).toBe('#2d668780')
    expect(ui.nodes().filter(n => n.tag === 'ColorSliderThumb').map(n => n.props['aria-label'])).toEqual(['Hue', 'Opacity'])
  })
  it('emits opacity apart from the #rrggbb colour', () => {
    const ui = mountComponent(compile('UiColorField'), { modelValue: '#2d6687', alpha: 0.5 }, ['update:modelValue', 'update:alpha'])
    sliders(ui)[1]!.props['onUpdate:color']({ space: 'hsb', h: 200, s: 67, b: 53, alpha: 0.257 })
    expect(ui.events).toEqual([['update:alpha', 0.26]])
    ui.nodes().find(n => n.tag === 'ColorAreaRoot')!.props['onUpdate:modelValue']('#FF000080')
    expect(ui.events.at(-1)).toEqual(['update:modelValue', '#ff0000'])
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

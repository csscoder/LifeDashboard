import * as Vue from 'vue'
import { describe, expect, it } from 'vitest'
import { compileSfc, mountComponent } from './helpers/sfc-renderer'

const part = (name: string) => Vue.defineComponent({ name, setup: (_, { slots }) => () => Vue.h(name, null, slots.default?.()) })
const reka = Object.fromEntries([
  'SwitchRoot', 'SwitchThumb', 'SliderRoot', 'SliderTrack', 'SliderRange', 'SliderThumb',
  'RadioGroupRoot', 'RadioGroupItem', 'RadioGroupIndicator',
].map(name => [name, part(name)]))
Object.assign(reka, { Primitive: Vue.defineComponent({ props: ['as'], setup: (props, { slots }) => () => Vue.h(props.as, null, slots.default?.()) }) })
const compile = (name: string) => compileSfc(new URL(`../app/ui/${name}.vue`, import.meta.url), { 'reka-ui': reka })
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

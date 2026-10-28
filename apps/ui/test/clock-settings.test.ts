import * as Vue from 'vue'
import { describe, expect, it } from 'vitest'
import { findBuiltinWidget } from '@lifedashboard/contracts/builtin-widgets'
import * as settings from '@lifedashboard/contracts/widget-settings'
import * as timeZones from '../app/widgets/builtin/clocks/analog_1/time-zones'
import { compileSfc, mountComponent } from './helpers/sfc-renderer'

const UiSelect = Vue.defineComponent({
  props: { modelValue: String, options: Array },
  emits: ['update:modelValue'],
  setup: (props, { attrs, emit }) => () => Vue.h('ui-select', { ...attrs, modelValue: props.modelValue, options: props.options, pick: (value: string) => emit('update:modelValue', value) }),
})
const control = (tag: string) => Vue.defineComponent({ props: ['modelValue', 'options'], emits: ['update:modelValue'], setup: (props, { attrs, emit }) => () => Vue.h(tag, { ...attrs, ...props, pick: (value: unknown) => emit('update:modelValue', value) }) })
const Row = Vue.defineComponent({ props: ['label'], setup: (props, { slots }) => () => Vue.h('settings-row', [String(props.label), slots.default?.()]) })
const component = compileSfc(new URL('../app/widgets/builtin/clocks/analog_1/ClockAnalog1Settings.vue', import.meta.url), {
  '@lifedashboard/contracts/widget-settings': settings,
  '../../../../ui/UiSelect.vue': UiSelect,
  './time-zones': timeZones,
  '../../../../board/SettingsRow.vue': Row,
  '../../../../ui/UiSwitch.vue': control('ui-switch'),
  '../../../../ui/UiRadioGroup.vue': control('ui-radio-group'),
})
const schema = findBuiltinWidget('clock-analog-1')!.settings!
const groups = timeZones.offsetGroups(new Date())
const offsetOf = (zone: string) => groups.find((group) => group.zones.includes(zone))!.offset

function mount(config: Record<string, unknown> = {}) {
  const ui = mountComponent(component, { schema, config }, ['change'])
  const selects = () => ui.nodes().filter((el) => el.tag === 'ui-select')
  const input = (type: string) => ui.nodes().filter((el) => el.tag === 'input' && el.props.type === type)
  return { ...ui, selects, input }
}

describe('clock settings', () => {
  it('shows only the system time checkbox while it is on', () => {
    const ui = mount()
    expect(ui.text()).toContain('System time')
    expect(ui.nodes().find(el => el.tag === 'ui-switch')?.props.modelValue).toBe(true)
    expect(ui.selects()).toHaveLength(0)
    expect(ui.input('radio')).toHaveLength(0)
  })

  it('reveals the notation and both lists once the checkbox is cleared, keeping the other values', () => {
    const ui = mount({ systemTime: true, notation: 'GMT', zone: 'Asia/Tokyo' })
    ui.nodes().find(el => el.tag === 'ui-switch')!.props.pick(false)
    expect(ui.events).toEqual([['change', { systemTime: false, notation: 'GMT', zone: 'Asia/Tokyo' }]])
  })

  it('lists the offsets in the chosen notation and the zones of the stored zone’s offset', () => {
    const ui = mount({ systemTime: false, notation: 'GMT', zone: 'Asia/Tokyo' })
    expect(ui.text()).toContain('Notation')
    expect(ui.nodes().find(el => el.tag === 'ui-radio-group')!.props.modelValue).toBe('GMT')
    const [offsets, zones] = ui.selects()
    expect(offsets!.props.modelValue).toBe(String(offsetOf('Asia/Tokyo')))
    expect(offsets!.props.options).toContainEqual({ value: String(offsetOf('Asia/Tokyo')), label: 'GMT+9' })
    expect(zones!.props.modelValue).toBe('Asia/Tokyo')
    const zoneList = groups.find((group) => group.offset === offsetOf('Asia/Tokyo'))!.zones
    expect(zones!.props.options).toEqual(zoneList.map((zone) => ({ value: zone, label: zone })))
  })

  it('uses themed controls without native inputs', () => {
    const ui = mount({ systemTime: false })
    expect(ui.nodes().filter(el => el.tag === 'input')).toHaveLength(0)
    expect(ui.nodes().filter(el => el.tag === 'ui-switch')).toHaveLength(1)
    expect(ui.nodes().filter(el => el.tag === 'ui-radio-group')).toHaveLength(1)
    expect(ui.selects()).toHaveLength(2)
  })

  it('picks the first zone of a newly chosen offset', () => {
    const ui = mount({ systemTime: false, zone: 'Asia/Tokyo' })
    const target = groups.find((group) => group.offset !== offsetOf('Asia/Tokyo'))!
    ui.selects()[0]!.props.pick(String(target.offset))
    expect(ui.events).toEqual([['change', { systemTime: false, notation: 'UTC', zone: target.zones[0] }]])
  })

  it('stores a zone and a notation picked by the user', () => {
    const ui = mount({ systemTime: false, zone: 'Asia/Tokyo' })
    ui.selects()[1]!.props.pick('Asia/Seoul')
    ui.nodes().find(el => el.tag === 'ui-radio-group')!.props.pick('GMT')
    expect(ui.events).toEqual([
      ['change', { systemTime: false, notation: 'UTC', zone: 'Asia/Seoul' }],
      ['change', { systemTime: false, notation: 'GMT', zone: 'Asia/Tokyo' }],
    ])
  })
})

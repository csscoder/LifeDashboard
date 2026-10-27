import * as Vue from 'vue'
import { describe, expect, it } from 'vitest'
import { compileSfc, mountComponent } from './helpers/sfc-renderer'

// Each reka-ui part renders as a host node named after it, with its props and attrs.
const part = (name: string) => Vue.defineComponent({ name, setup: (_, { slots }) => () => Vue.h(name, null, slots.default?.()) })
const reka = Object.fromEntries([
  'SelectRoot', 'SelectTrigger', 'SelectValue', 'SelectIcon', 'SelectPortal', 'SelectContent', 'SelectViewport',
  'SelectItem', 'SelectItemText', 'SelectItemIndicator',
].map((name) => [name, part(name)]))
const component = compileSfc(new URL('../app/ui/UiSelect.vue', import.meta.url), { 'reka-ui': reka })
const options = [{ value: '', label: 'Same as board' }, { value: 'builtin:paper', label: 'Paper' }]

function mount(modelValue: string) {
  const ui = mountComponent(component, { modelValue, options, id: 'f-style', 'aria-required': 'true' }, ['update:modelValue'])
  const find = (tag: string) => ui.nodes().filter((el) => el.tag === tag)
  return { ...ui, find }
}

describe('UiSelect', () => {
  it('puts the label attributes on the trigger, not on the root', () => {
    const ui = mount('builtin:paper')
    expect(ui.find('SelectTrigger')[0]?.props).toMatchObject({ id: 'f-style', 'aria-required': 'true' })
    expect(ui.find('SelectRoot')[0]?.props.id).toBeUndefined()
  })

  it('keeps the trigger and the list in one element, so a grid row never gains a cell for the closed list', () => {
    const ui = mount('')
    const field = ui.nodes().find((el) => el.props.class === 'ui-select-field')!
    expect(field.parent?.tag).toBe('root')
    expect(field.parent!.children.filter((el) => !el.tag.startsWith('#'))).toEqual([field])
    const inside = [field, ...ui.nodes().filter((el) => { for (let p = el.parent; p; p = p.parent) if (p === field) return true; return false })]
    expect(inside.some((el) => el.tag === 'SelectTrigger')).toBe(true)
    expect(inside.some((el) => el.tag === 'SelectContent')).toBe(true)
  })

  it('shows the placeholder for an empty value that no option has', () => {
    const ui = mountComponent(component, { modelValue: '', options: [{ value: 'a', label: 'A' }], placeholder: '＋ Add widget…' }, ['update:modelValue'])
    const root = ui.nodes().find((el) => el.tag === 'SelectRoot')!
    expect(root.props['model-value']).toBe('')
    expect(ui.nodes().find((el) => el.tag === 'SelectValue')?.props.placeholder).toBe('＋ Add widget…')
  })

  it('renders the list in place, so it shows above a top-layer panel', () => {
    expect(mount('').find('SelectPortal')[0]?.props.disabled).toBe(true)
  })

  it('lists every option with its label, the empty value included', () => {
    const ui = mount('')
    const items = ui.find('SelectItem')
    expect(items).toHaveLength(2)
    expect(items.every((item) => item.props.value !== '')).toBe(true)
    expect(ui.find('SelectItemText').map((el) => el.children.map((child) => child.text).join('') || el.text)).toEqual(['Same as board', 'Paper'])
    expect(ui.find('SelectRoot')[0]?.props['model-value']).toBe(items[0]!.props.value)
  })

  it('closes only the list on Escape, so the panel around it stays open', async () => {
    const ui = mount('builtin:paper')
    ui.find('SelectRoot')[0]!.props['onUpdate:open'](true)
    await Vue.nextTick()
    expect(ui.find('SelectRoot')[0]!.props.open).toBe(true)
    const event = { defaultPrevented: false, preventDefault() { this.defaultPrevented = true } }
    ui.find('SelectContent')[0]!.props.onEscapeKeyDown(event)
    await Vue.nextTick()
    expect(event.defaultPrevented).toBe(true)
    expect(ui.find('SelectRoot')[0]!.props.open).toBe(false)
  })

  it('closes the list when the popover around it closes, so the page does not stay locked', async () => {
    const ui = mount('builtin:paper')
    const listeners: Record<string, (event: { newState: string }) => void> = {}
    const popover = {
      addEventListener: (type: string, listener: (event: { newState: string }) => void) => { listeners[type] = listener },
      removeEventListener: (type: string) => { delete listeners[type] },
    }
    Object.assign(ui.find('SelectTrigger')[0]!, { closest: (selector: string) => (selector === '[popover]' ? popover : null) })
    ui.find('SelectRoot')[0]!.props['onUpdate:open'](true)
    await Vue.nextTick()
    listeners.toggle!({ newState: 'closed' })
    await Vue.nextTick()
    expect(ui.find('SelectRoot')[0]!.props.open).toBe(false)
    expect(listeners.toggle).toBeUndefined()
  })

  it('emits the option value, mapping the empty one back', () => {
    const ui = mount('builtin:paper')
    const root = ui.find('SelectRoot')[0]!
    const empty = ui.find('SelectItem')[0]!.props.value
    root.props['onUpdate:modelValue'](empty)
    root.props['onUpdate:modelValue']('builtin:paper')
    expect(ui.events).toEqual([['update:modelValue', ''], ['update:modelValue', 'builtin:paper']])
  })
})

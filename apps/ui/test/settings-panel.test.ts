import * as Vue from 'vue'
import * as reka from 'reka-ui'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_THEME } from '../app/theme/builtin'
import { loadAppearance } from '../app/theme/appearance'
import { ThemePicker } from './helpers/theme-picker'
import { GRID_COLS } from '@lifedashboard/contracts/grid'
import { compileSfc, mountComponent, type HostNode } from './helpers/sfc-renderer'

// The custom test renderer has no DOM; Reka only needs the class for instanceof checks, and TabsContent waits a frame.
beforeEach(() => {
  vi.stubGlobal('Element', class {})
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { callback(0); return 0 })
})

const UiSelect = Vue.defineComponent({
  props: { modelValue: String, options: Array, placeholder: String, disabled: Boolean },
  emits: ['update:modelValue'],
  setup: (props, { attrs, emit }) => () => Vue.h('ui-select', { ...attrs, ...props, pick: (value: string) => emit('update:modelValue', value) }),
})
const component = compileSfc(new URL('../app/SettingsPanel.vue', import.meta.url), {
  './theme/builtin': { DEFAULT_THEME }, './theme/ThemePicker.vue': ThemePicker, '@lifedashboard/contracts/grid': { GRID_COLS }, './ui/UiSelect.vue': UiSelect, 'reka-ui': reka,
})
const picker = (ui: ReturnType<typeof mount>) => ui.nodes().find((el) => el.tag === 'ui-select')
function mount(overrides: Record<string, unknown> = {}) {
  return mountComponent(component, {
    entries: [{ key: 'builtin:placeholder', title: 'Placeholder', source: { kind: 'builtin', type: 'placeholder' } }],
    loaded: true, viewing: true, spaceTitle: 'Garage', spaceIcon: '🧘', screenIndex: 1, screenCount: 3,
    rows: 12, theme: DEFAULT_THEME, apiLabel: 'API: running', apiDown: false, ...overrides,
  }, ['pick', 'edit', 'library', 'theme'])
}

describe('settings panel', () => {
  it('speaks English', () => {
    const ui = mount()
    expect(ui.button('Board settings')?.props.title).toBe('Board settings')
    expect(ui.button('Close settings')).toBeDefined()
    expect(picker(ui)?.props['aria-label']).toBe('Add widget')
    expect(picker(ui)?.props.placeholder).toBe('＋ Add')
    for (const text of ['Current space', 'Default dashboard theme']) expect(ui.text()).toContain(text)
    ui.props.spaceTitle = ''; ui.props.screenCount = 0
    return Vue.nextTick().then(() => {
      expect(ui.text()).toContain('No space selected')
      expect(ui.text()).toContain('Loading the board…')
    })
  })

  it('hands a selected widget to the board, keeps the picker on its placeholder, and closes the panel', async () => {
    const ui = mount()
    expect(picker(ui)?.props.options).toEqual([{ value: 'builtin:placeholder', label: 'Placeholder' }])
    const panel = ui.panel(); panel.open = true
    picker(ui)!.props.pick('builtin:placeholder')
    await Vue.nextTick()
    expect(ui.events).toEqual([['pick', 'builtin:placeholder']])
    expect(picker(ui)!.props.modelValue).toBe('')
    expect(panel.open).toBe(false)
  })

  it('ignores empty or unknown picker values', () => {
    const ui = mount()
    for (const value of ['', 'missing']) picker(ui)!.props.pick(value)
    expect(ui.events).toEqual([])
  })

  it.each([['Edit board', 'edit'], ['Widget library', 'library']])('closes before handing off %s', (label, event) => {
    const ui = mount()
    expect(ui.button(label)).toBeDefined()
    const panel = ui.panel(); panel.open = true
    ui.button(label).props.onClick()
    expect(ui.events).toEqual([[event]])
    expect(panel.open).toBe(false)
  })

  it.each([{ loaded: false }, { viewing: false }])('disables board actions when unavailable: %o', (props) => {
    const ui = mount(props)
    expect(picker(ui)?.props.disabled).toBe(true)
    expect(ui.button('Edit board')?.props.disabled).toBe(true)
  })

  it('shows the selected theme and emits a choice without closing settings', async () => {
    const ui = mount()
    await Vue.nextTick()
    expect(ui.button('LifeDashboard').props['aria-checked']).toBe(true)
    const panel = ui.panel(); panel.open = true
    ui.button('Gruvbox').click()
    expect(ui.events).toEqual([['theme', { palette: 'builtin:gruvbox', mode: 'dark', style: 'glass' }]])
    expect(panel.open).toBe(true)
  })

  it('opens a fresh profile with the default selected and Mode and Style enabled', async () => {
    const ui = mount({ theme: loadAppearance().theme ?? DEFAULT_THEME })
    await Vue.nextTick()
    expect(ui.button('LifeDashboard').props['aria-checked']).toBe(true)
    expect(ui.button('Inherit')).toBeUndefined()
    const groups = ui.nodes().filter(n => n.props.role === 'radiogroup')
    expect(groups).toHaveLength(3)
    expect(groups.slice(1).every(n => n.props['data-disabled'] === undefined)).toBe(true)
  })

  it.each(['Escape', 'ArrowRight', 'Enter'])('keeps %s inside open settings without preventing native keyboard behavior', async (key) => {
    const ui = mount({ viewing: false })
    ui.panel().props.onToggle({ newState: 'open' })
    await Vue.nextTick()
    const event = { key, cancelBubble: false, defaultPrevented: false,
      stopPropagation() { this.cancelBubble = true }, preventDefault() { this.defaultPrevented = true } }
    // Follow the rendered host ancestry as a keyboard event bubbles from an action button.
    for (let target: HostNode | null = ui.button('Close settings'); target && !event.cancelBubble; target = target.parent)
      target.props.onKeydown?.(event)
    expect(event.cancelBubble).toBe(true)
    expect(event.defaultPrevented).toBe(false)
  })

  it('renders actual space, screen, grid and changing API status', async () => {
    const ui = mount()
    expect(ui.text()).toContain('Garage')
    expect(ui.text()).toContain('Screen 2 of 3')
    expect(ui.text()).toContain('24 × 12')
    expect(ui.text()).toContain('API: running')
    ui.props.apiLabel = 'API: unavailable'; ui.props.apiDown = true
    await Vue.nextTick()
    expect(ui.text()).toContain('API: unavailable')
    expect(ui.text()).not.toContain('API: running')
  })
})


it('keeps the board actions above two tabs: General with the space, Theme with the default theme', async () => {
  const ui = mount()
  const panelOf = (node: HostNode | null): HostNode | null => node && (node.props.role === 'tabpanel' ? node : panelOf(node.parent))
  const textOf = (n: HostNode): string => n.text + n.children.map(textOf).join('')
  for (const action of [picker(ui)!, ui.button('Edit board'), ui.button('Widget library')]) expect(panelOf(action)).toBeNull()
  const tabs = ui.nodes().filter((el) => el.props.role === 'tab')
  expect(tabs.map(textOf)).toEqual(['General', 'Theme'])
  expect(tabs.map((tab) => tab.props['aria-selected'])).toEqual(['true', 'false'])
  const panels = ui.nodes().filter((el) => el.props.role === 'tabpanel')
  expect(panels.map((panel) => textOf(panel).includes('Current space'))).toEqual([true, false])
  expect(panels.map((panel) => textOf(panel).includes('Default dashboard theme'))).toEqual([false, true])
  expect(textOf(ui.nodes().find((el) => el.tag === 'footer')!)).toContain('API: running')
})

it('keeps screen-specific controls out of dashboard settings', () => {
  const ui = mount()
  expect(ui.nodes().some(el => el.props['aria-label'] === 'Screen theme')).toBe(false)
})

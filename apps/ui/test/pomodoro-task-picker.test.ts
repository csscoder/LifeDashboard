import * as Vue from 'vue'
import { describe, expect, it, vi } from 'vitest'
import { nextColor, SPACE_COLORS } from '@lifedashboard/contracts/space'
import * as viewModule from '../app/widgets/builtin/pomodoro/view'
import { compileSfc, mountComponent } from './helpers/sfc-renderer'

const pass = (tag: string) => Vue.defineComponent({ setup: (_, { slots }) => () => Vue.h(tag, null, slots.default?.()) })
const TextField = Vue.defineComponent({
  props: ['modelValue', 'maxlength'], emits: ['update:modelValue'],
  setup: (props, { attrs, emit }) => () => Vue.h('input', { ...attrs, value: props.modelValue, maxlength: props.maxlength, onInput: (event: any) => emit('update:modelValue', event.target.value) }),
})
const Button = Vue.defineComponent({ props: ['disabled'], setup: (props, { attrs, slots }) => () => Vue.h('button', { ...attrs, disabled: props.disabled }, slots.default?.()) })
// Combobox parts: the root exposes `pick` to stand in for choosing an item; the input is a plain input.
const highlightFirstItem = vi.fn()
const ComboboxRoot = Vue.defineComponent({
  emits: ['update:modelValue'],
  setup: (_, { attrs, emit, expose, slots }) => {
    expose({ highlightFirstItem })
    return () => Vue.h('combobox', { ...attrs, pick: (value: string) => emit('update:modelValue', value) }, slots.default?.())
  },
})
const ComboboxInput = Vue.defineComponent({
  props: ['modelValue', 'maxlength'], emits: ['update:modelValue'],
  setup: (props, { attrs, emit }) => () => Vue.h('input', { ...attrs, value: props.modelValue, maxlength: props.maxlength, onInput: (event: any) => emit('update:modelValue', event.target.value) }),
})
const ComboboxItem = Vue.defineComponent({ props: ['value'], setup: (props, { slots }) => () => Vue.h('option', { value: props.value }, slots.default?.()) })
const passAttrs = (tag: string) => Vue.defineComponent({ setup: (_, { attrs, slots }) => () => Vue.h(tag, attrs, slots.default?.()) })
const Select = Vue.defineComponent({ props: ['modelValue', 'options'], setup: (props, { attrs }) => () => Vue.h('ui-select', { ...attrs, options: props.options }) })
const component = compileSfc(new URL('../app/widgets/builtin/pomodoro/TaskPicker.vue', import.meta.url), {
  'reka-ui': {
    FieldRoot: pass('field'),
    PopoverRoot: Vue.defineComponent({ emits: ['update:open'], setup: (_, { emit, slots }) => () => Vue.h('popover', { show: () => emit('update:open', true) }, slots.default?.()) }),
    PopoverTrigger: pass('trigger'),
    PopoverPortal: Vue.defineComponent({ props: ['to', 'disabled'], setup: (props, { slots }) => () => Vue.h('portal', { ...props }, slots.default?.()) }),
    PopoverContent: pass('content'),
    ComboboxRoot, ComboboxInput, ComboboxItem,
    ComboboxAnchor: passAttrs('anchor'), ComboboxPortal: pass('combobox-portal'), ComboboxContent: pass('list'), ComboboxViewport: pass('viewport'),
  },
  '@lifedashboard/contracts/space': { nextColor, SPACE_COLORS },
  '../../../ui/UiButton.vue': Button,
  '../../../ui/UiSelect.vue': Select,
  './view': viewModule,
  '../../../ui/UiTextField.vue': TextField,
})

function mount(overrides: Record<string, unknown> = {}) {
  const store = {
    state: Vue.reactive({
      run: { label: null as string | null, projectId: 'p1' as string | null },
      projects: [{ id: 'p1', name: 'Home', color: 'violet', archivedAt: null }, { id: 'p2', name: 'Old', color: 'blue', archivedAt: 5 }],
      recentLabels: ['Write spec', 'Review', ...Array.from({ length: 10 }, (_, i) => `task ${i}`), 'Rewrite docs'],
    }),
    setTask: vi.fn((): string | null => null),
    createProject: vi.fn(async (_name: string, _color: string): Promise<any> => ({ ok: true, project: { id: 'new' } })),
    ...overrides,
  }
  const ui = mountComponent(component, { store }, ['close'])
  const input = (placeholder: string) => ui.nodes().find((el) => el.tag === 'input' && el.props.placeholder === placeholder)!
  const type = (placeholder: string, value: string) => input(placeholder).props.onInput({ target: { value } })
  const anchor = () => ui.nodes().find((el) => el.tag === 'anchor')!
  const options = () => ui.nodes().filter((el) => el.tag === 'option').map((el) => el.props.value)
  return { store, ui, input, type, anchor, options }
}
const enter = (el: { props: Record<string, any> }) => el.props.onKeydown({ key: 'Enter', preventDefault() {} })

describe('pomodoro task picker', () => {
  it('opens in the space, which carries the theme tokens, above the tiles and not in the body', async () => {
    const store = { state: Vue.reactive({ run: { label: null, projectId: null }, projects: [], recentLabels: [] }), setTask: vi.fn(), createProject: vi.fn() }
    const Space = Vue.defineComponent({ setup: () => () => Vue.h('div', { class: 'space space--theme-x' }, [
      Vue.h('div', { class: 'widget widget--theme-x' }, [Vue.h('div', { class: 'widget__body' }, [Vue.h(component, { store })])]),
    ]) })
    const ui = mountComponent(Space, {}, [])
    ui.nodes().find((el) => el.tag === 'popover')!.props.show()
    await Vue.nextTick()
    const space = ui.nodes().find((el) => el.props.class === 'space space--theme-x')
    expect(ui.nodes().find((el) => el.tag === 'portal')!.props.to).toBe(space)
  })

  it('submits a trimmed label', async () => {
    // Enter reaches the anchor only when no list item is highlighted; Reka stops it otherwise.
    const { store, ui, anchor, type } = mount()
    type('What are you working on?', '  Refactor grid  ')
    await Vue.nextTick()
    enter(anchor())
    expect(store.setTask).toHaveBeenCalledWith('Refactor grid', 'p1')
    expect(ui.events).toEqual([['close']])
  })
  it('lists the 10 most recent tasks in the dropdown, not as buttons, and searches all of them', async () => {
    const { ui, type, options } = mount()
    expect(options()).toEqual(['Write spec', 'Review', ...Array.from({ length: 8 }, (_, i) => `task ${i}`)])
    expect(ui.button('Write spec')).toBeUndefined()
    type('What are you working on?', 'write')
    await Vue.nextTick()
    expect(options()).toEqual(['write', 'Write spec', 'Rewrite docs'])
  })
  it('opens with the current task first among the recent ones, searching only after typing', async () => {
    const { ui, store, type, options, input } = mount()
    store.state.run.label = 'Review'
    ui.nodes().find((el) => el.tag === 'popover')!.props.show()
    await Vue.nextTick()
    expect(input('What are you working on?').props.value).toBe('Review')
    expect(options().slice(0, 3)).toEqual(['Review', 'Write spec', 'task 0'])
    highlightFirstItem.mockClear()
    type('What are you working on?', 'rev')
    await Vue.nextTick()
    expect(options()).toEqual(['rev', 'Review'])
    // Reka highlights before the new list renders; the picker re-highlights the typed text once it has.
    expect(highlightFirstItem).toHaveBeenCalled()
  })
  it('applies a picked task', () => {
    const { store, ui } = mount()
    ui.nodes().find((el) => el.tag === 'combobox')!.props.pick('Review')
    expect(store.setTask).toHaveBeenCalledWith('Review', 'p1')
    expect(ui.events).toEqual([['close']])
  })
  it('creates a project in the next free colour and assigns it', async () => {
    const { store, ui, type } = mount()
    ui.button('+ New project').click()
    await Vue.nextTick()
    expect(ui.button('Add').props.disabled).toBe(true)
    type('Project name', ' LifeDashboard ')
    await Vue.nextTick()
    ui.button('Add').click()
    await vi.waitFor(() => expect(store.setTask).toHaveBeenCalledWith(null, 'new'))
    expect(store.createProject).toHaveBeenCalledWith('LifeDashboard', nextColor(['violet']))
  })
  it('creates a project once while the request runs (Enter, then clicks)', async () => {
    let finish!: (value: unknown) => void
    const { store, ui, input, type } = mount({ createProject: vi.fn(() => new Promise((resolve) => { finish = resolve })) })
    ui.button('+ New project').click()
    await Vue.nextTick()
    type('Project name', 'Work')
    await Vue.nextTick()
    enter(input('Project name'))
    ui.button('Add').click()
    ui.button('Add').click()
    await Vue.nextTick()
    expect(store.createProject).toHaveBeenCalledTimes(1)
    expect(ui.button('Add').props.disabled).toBe(true)
    finish({ ok: true, project: { id: 'new' } })
    await vi.waitFor(() => expect(store.setTask).toHaveBeenCalledWith(null, 'new'))
  })
  it('a rejected assignment after a create never creates the project again', async () => {
    const { store, ui, type } = mount({ setTask: vi.fn(() => 'label must not contain control or hidden characters') })
    ui.button('+ New project').click()
    await Vue.nextTick()
    type('Project name', 'Work')
    await Vue.nextTick()
    ui.button('Add').click()
    await vi.waitFor(() => expect(ui.text()).toContain('label must not contain control or hidden characters'))
    ui.button('Add')?.click()
    await Vue.nextTick()
    expect(store.createProject).toHaveBeenCalledTimes(1)
  })
  it('clears the task', () => {
    const { store, ui } = mount()
    ui.button('Clear').click()
    expect(store.setTask).toHaveBeenCalledWith(null, null)
  })
  it('limits the label and the project name', async () => {
    const { ui, input } = mount()
    expect(input('What are you working on?').props.maxlength).toBe(120)
    ui.button('+ New project').click()
    await Vue.nextTick()
    expect(input('Project name').props.maxlength).toBe(40)
  })
  it('lists only non-archived projects', () => {
    const { ui } = mount()
    expect(ui.nodes().find((el) => el.tag === 'ui-select')!.props.options.map((o: any) => o.label)).toEqual(['No project', 'Home'])
  })
  it('shows a rejected label and stays open', async () => {
    const { ui, anchor, type } = mount({ setTask: vi.fn(() => 'label must not contain control or hidden characters') })
    type('What are you working on?', 'x')
    enter(anchor())
    await Vue.nextTick()
    expect(ui.text()).toContain('label must not contain control or hidden characters')
    expect(ui.events).toEqual([])
  })
  it('shows a project error without assigning', async () => {
    const { store, ui, type } = mount({ createProject: vi.fn(async () => ({ ok: false, error: 'name must be 1..40 characters' })) })
    ui.button('+ New project').click()
    await Vue.nextTick()
    type('Project name', 'x')
    await Vue.nextTick()
    ui.button('Add').click()
    await vi.waitFor(() => expect(ui.text()).toContain('name must be 1..40 characters'))
    expect(store.setTask).not.toHaveBeenCalled()
  })
})

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
const Select = Vue.defineComponent({ props: ['modelValue', 'options'], setup: (props, { attrs }) => () => Vue.h('ui-select', { ...attrs, value: props.modelValue, options: props.options }) })
const component = compileSfc(new URL('../app/widgets/builtin/pomodoro/TaskPicker.vue', import.meta.url), {
  'reka-ui': {
    FieldRoot: pass('field'),
    PopoverRoot: Vue.defineComponent({ emits: ['update:open'], setup: (_, { emit, slots }) => () => Vue.h('popover', { show: () => emit('update:open', true), hide: () => emit('update:open', false) }, slots.default?.()) }),
    PopoverTrigger: pass('trigger'),
    PopoverPortal: Vue.defineComponent({ props: ['to', 'disabled'], setup: (props, { slots }) => () => Vue.h('portal', { ...props }, slots.default?.()) }),
    PopoverContent: passAttrs('content'),
    ComboboxRoot, ComboboxInput, ComboboxItem, ComboboxTrigger: passAttrs('combobox-trigger'),
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
  const select = () => ui.nodes().find((el) => el.tag === 'ui-select')!
  const popover = () => ui.nodes().find((el) => el.tag === 'popover')!
  const pick = (value: string) => ui.nodes().find((el) => el.tag === 'combobox')!.props.pick(value)
  return { store, ui, input, type, anchor, options, select, popover, pick }
}
const TASK = 'What are you working on?'
// A real mouse click has detail 1; a click from the keyboard (or the helper's click()) has none.
const mouseClick = (el: { dispatchEvent(event: Event): boolean }) => el.dispatchEvent(Object.assign(new Event('click', { bubbles: true }), { detail: 1 }))
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

  it('[EC-04][EC-07] Enter with nothing highlighted saves a trimmed label and closes', async () => {
    // Enter reaches the anchor only when no list item is highlighted; Reka stops it otherwise.
    const { store, ui, anchor, type } = mount()
    type(TASK, '  Refactor grid  ')
    await Vue.nextTick()
    enter(anchor())
    expect(store.setTask).toHaveBeenCalledWith('Refactor grid', 'p1')
    expect(ui.events).toEqual([['close']])
  })
  it('[EC-01] opens with the saved task and project without saving', async () => {
    const { store, ui, input, select, popover } = mount()
    store.state.run.label = 'Review'
    popover().props.show()
    await Vue.nextTick()
    expect(input(TASK).props.value).toBe('Review')
    expect(select().props.value).toBe('p1')
    expect(store.setTask).not.toHaveBeenCalled()
    expect(ui.events).toEqual([])
  })
  it('[EC-02] a picked task fills the field and keeps the picker open', async () => {
    const { store, ui, input, pick } = mount()
    pick('Review')
    await Vue.nextTick()
    expect(input(TASK).props.value).toBe('Review')
    expect(store.setTask).not.toHaveBeenCalled()
    expect(ui.events).toEqual([])
  })
  it('[EC-03] a chosen project changes the draft only', async () => {
    const { store, ui, select } = mount()
    select().props['onUpdate:modelValue']('')
    await Vue.nextTick()
    expect(select().props.value).toBe('')
    expect(store.setTask).not.toHaveBeenCalled()
    expect(ui.events).toEqual([])
  })
  it('[EC-04] Save applies the draft once and closes', async () => {
    const { store, ui, type, pick, select } = mount()
    type(TASK, 'x')
    pick('Review')
    select().props['onUpdate:modelValue']('')
    await Vue.nextTick()
    ui.button('Save').click()
    expect(store.setTask).toHaveBeenCalledTimes(1)
    expect(store.setTask).toHaveBeenCalledWith('Review', null)
    expect(ui.events).toEqual([['close']])
  })
  it('[EC-05] Save with a blank task saves no label', async () => {
    const { store, ui, type } = mount()
    type(TASK, '   ')
    await Vue.nextTick()
    ui.button('Save').click()
    expect(store.setTask).toHaveBeenCalledWith(null, 'p1')
  })
  it('[EC-08] Clear empties the form without saving; Save then clears the task', async () => {
    const { store, ui, input, select, type } = mount({ setTask: vi.fn().mockReturnValueOnce('label must not contain control or hidden characters').mockReturnValue(null) })
    type(TASK, 'x')
    await Vue.nextTick()
    ui.button('Save').click()
    await Vue.nextTick()
    expect(ui.text()).toContain('label must not contain control or hidden characters')
    ui.button('Clear').click()
    await Vue.nextTick()
    expect(input(TASK).props.value).toBe('')
    expect(select().props.value).toBe('')
    expect(ui.text()).not.toContain('label must not contain')
    expect(store.setTask).toHaveBeenCalledTimes(1)
    expect(ui.events).toEqual([])
    ui.button('Save').click()
    expect(store.setTask).toHaveBeenLastCalledWith(null, null)
  })
  it('[EC-09] closing without Save keeps nothing of the draft', async () => {
    const { store, ui, input, select, type, popover } = mount()
    store.state.run.label = 'Review'
    popover().props.show()
    await Vue.nextTick()
    type(TASK, 'Draft')
    select().props['onUpdate:modelValue']('')
    popover().props.hide()
    popover().props.show()
    await Vue.nextTick()
    expect(store.setTask).not.toHaveBeenCalled()
    expect(input(TASK).props.value).toBe('Review')
    expect(select().props.value).toBe('p1')
  })
  it('[EC-10] an arrow button opens the list of recent tasks', () => {
    const { ui } = mount()
    const trigger = ui.nodes().find((el) => el.tag === 'combobox-trigger')!
    expect(trigger.props['aria-label']).toBe('Show recent tasks')
    expect(trigger.parent!.tag).toBe('anchor')
  })
  it('[EC-11] a clear button shows for a non-empty field and empties it', async () => {
    const { ui, input, type } = mount()
    expect(ui.button('Clear task')).toBeUndefined()
    type(TASK, 'Draft')
    await Vue.nextTick()
    ui.button('Clear task').click()
    await Vue.nextTick()
    expect(input(TASK).props.value).toBe('')
    expect(ui.button('Clear task')).toBeUndefined()
  })
  it('[EC-14] Save waits while a project is created', async () => {
    let finish!: (value: unknown) => void
    const { store, ui, type } = mount({ createProject: vi.fn(() => new Promise((resolve) => { finish = resolve })) })
    ui.button('+ New project').click()
    await Vue.nextTick()
    type('Project name', 'Work')
    await Vue.nextTick()
    ui.button('Add').click()
    await Vue.nextTick()
    expect(ui.button('Save').props.disabled).toBe(true)
    finish({ ok: true, project: { id: 'new' } })
    await vi.waitFor(() => expect(ui.button('Save').props.disabled).toBe(false))
    expect(store.setTask).not.toHaveBeenCalled()
  })
  it('[EC-18] Save ignores a project name that was never added', async () => {
    const { store, ui, type } = mount()
    ui.button('+ New project').click()
    await Vue.nextTick()
    type('Project name', 'Work')
    await Vue.nextTick()
    ui.button('Save').click()
    expect(store.createProject).not.toHaveBeenCalled()
    expect(store.setTask).toHaveBeenCalledWith(null, 'p1')
  })
  it('[EC-19] a mouse Save leaves focus off the task button; Enter and Escape return it', async () => {
    const autoFocus = () => {
      const event = { preventDefault: vi.fn() }
      ui.nodes().find((el) => el.tag === 'content')!.props.onCloseAutoFocus(event)
      return event.preventDefault
    }
    const { ui, anchor, popover } = mount()
    popover().props.show()
    await Vue.nextTick()
    mouseClick(ui.button('Save'))
    expect(autoFocus()).toHaveBeenCalled()
    popover().props.show()
    await Vue.nextTick()
    enter(anchor())
    expect(autoFocus()).not.toHaveBeenCalled()
    popover().props.show()
    await Vue.nextTick()
    popover().props.hide()
    expect(autoFocus()).not.toHaveBeenCalled()
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
  it('[EC-12] creates a project in the next free colour and selects it, saving only on Save', async () => {
    const { store, ui, type, select } = mount()
    ui.button('+ New project').click()
    await Vue.nextTick()
    expect(ui.button('Add').props.disabled).toBe(true)
    type('Project name', ' LifeDashboard ')
    await Vue.nextTick()
    ui.button('Add').click()
    await vi.waitFor(() => expect(select().props.value).toBe('new'))
    expect(store.createProject).toHaveBeenCalledWith('LifeDashboard', nextColor(['violet']))
    expect(ui.button('+ New project')).toBeDefined()
    expect(store.setTask).not.toHaveBeenCalled()
    expect(ui.events).toEqual([])
    ui.button('Save').click()
    expect(store.setTask).toHaveBeenCalledWith(null, 'new')
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
    await vi.waitFor(() => expect(ui.button('+ New project')).toBeDefined())
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
  it('[EC-06] shows a rejected label and stays open', async () => {
    const { ui, anchor, type } = mount({ setTask: vi.fn(() => 'label must not contain control or hidden characters') })
    type('What are you working on?', 'x')
    enter(anchor())
    await Vue.nextTick()
    expect(ui.text()).toContain('label must not contain control or hidden characters')
    expect(ui.events).toEqual([])
  })
  it('[EC-13] shows a project error without changing the project', async () => {
    const { store, ui, type, select } = mount({ createProject: vi.fn(async () => ({ ok: false, error: 'name must be 1..40 characters' })) })
    ui.button('+ New project').click()
    await Vue.nextTick()
    type('Project name', 'x')
    await Vue.nextTick()
    ui.button('Add').click()
    await vi.waitFor(() => expect(ui.text()).toContain('name must be 1..40 characters'))
    expect(select().props.value).toBe('p1')
    expect(store.setTask).not.toHaveBeenCalled()
  })
})

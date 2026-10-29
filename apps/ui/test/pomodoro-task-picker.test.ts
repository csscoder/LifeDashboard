import * as Vue from 'vue'
import { describe, expect, it, vi } from 'vitest'
import { nextColor, SPACE_COLORS } from '@lifedashboard/contracts/space'
import { compileSfc, mountComponent } from './helpers/sfc-renderer'

const pass = (tag: string) => Vue.defineComponent({ setup: (_, { slots }) => () => Vue.h(tag, null, slots.default?.()) })
const TextField = Vue.defineComponent({
  props: ['modelValue', 'maxlength'], emits: ['update:modelValue'],
  setup: (props, { attrs, emit }) => () => Vue.h('input', { ...attrs, value: props.modelValue, maxlength: props.maxlength, onInput: (event: any) => emit('update:modelValue', event.target.value) }),
})
const Button = Vue.defineComponent({ props: ['disabled'], setup: (props, { attrs, slots }) => () => Vue.h('button', { ...attrs, disabled: props.disabled }, slots.default?.()) })
const Select = Vue.defineComponent({ props: ['modelValue', 'options'], setup: (props, { attrs }) => () => Vue.h('ui-select', { ...attrs, options: props.options }) })
const component = compileSfc(new URL('../app/widgets/builtin/pomodoro/TaskPicker.vue', import.meta.url), {
  'reka-ui': { FieldRoot: pass('field'), PopoverRoot: pass('popover'), PopoverTrigger: pass('trigger'), PopoverPortal: pass('portal'), PopoverContent: pass('content') },
  '@lifedashboard/contracts/space': { nextColor, SPACE_COLORS },
  '../../../ui/UiButton.vue': Button,
  '../../../ui/UiSelect.vue': Select,
  '../../../ui/UiTextField.vue': TextField,
})

function mount(overrides: Record<string, unknown> = {}) {
  const store = {
    state: Vue.reactive({
      run: { label: null as string | null, projectId: 'p1' as string | null },
      projects: [{ id: 'p1', name: 'Home', color: 'violet', archivedAt: null }, { id: 'p2', name: 'Old', color: 'blue', archivedAt: 5 }],
      recentLabels: ['Write spec'],
    }),
    setTask: vi.fn((): string | null => null),
    createProject: vi.fn(async (_name: string, _color: string): Promise<any> => ({ ok: true, project: { id: 'new' } })),
    ...overrides,
  }
  const ui = mountComponent(component, { store }, ['close'])
  const input = (placeholder: string) => ui.nodes().find((el) => el.tag === 'input' && el.props.placeholder === placeholder)!
  const type = (placeholder: string, value: string) => input(placeholder).props.onInput({ target: { value } })
  return { store, ui, input, type }
}
const enter = (el: { props: Record<string, any> }) => el.props.onKeydown({ key: 'Enter', preventDefault() {} })

describe('pomodoro task picker', () => {
  it('submits a trimmed label', async () => {
    const { store, ui, input, type } = mount()
    type('What are you working on?', '  Refactor grid  ')
    await Vue.nextTick()
    enter(input('What are you working on?'))
    expect(store.setTask).toHaveBeenCalledWith('Refactor grid', 'p1')
    expect(ui.events).toEqual([['close']])
  })
  it('applies a recent label', () => {
    const { store, ui } = mount()
    ui.button('Write spec').click()
    expect(store.setTask).toHaveBeenCalledWith('Write spec', 'p1')
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
    const { ui, input, type } = mount({ setTask: vi.fn(() => 'label must not contain control or hidden characters') })
    type('What are you working on?', 'x')
    enter(input('What are you working on?'))
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

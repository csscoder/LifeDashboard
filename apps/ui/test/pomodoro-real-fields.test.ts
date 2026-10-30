import * as Vue from 'vue'
import * as reka from 'reka-ui'
import { describe, expect, it, vi } from 'vitest'
import { nextColor, SPACE_COLORS } from '@lifedashboard/contracts/space'
import * as statsModule from '../app/widgets/builtin/pomodoro/stats'
import * as viewModule from '../app/widgets/builtin/pomodoro/view'
import { compileSfc, mountComponent } from './helpers/sfc-renderer'

// The custom test renderer has no DOM; Reka only needs the class for instanceof checks.
vi.stubGlobal('Element', class {})
vi.stubGlobal('window', { addEventListener: vi.fn(), removeEventListener: vi.fn() })

// Real UiTextField (Reka FieldControl needs a FieldRoot ancestor); only the popover parts are pass-through.
const pass = (tag: string) => Vue.defineComponent({ setup: (_, { slots }) => () => Vue.h(tag, null, slots.default?.()) })
const rekaModule = { ...reka, PopoverRoot: pass('popover'), PopoverTrigger: pass('trigger'), PopoverPortal: pass('portal'), PopoverContent: pass('content') }
const UiTextField = compileSfc(new URL('../app/ui/UiTextField.vue', import.meta.url), { 'reka-ui': reka })
const stub = (tag: string) => Vue.defineComponent({ setup: (_, { slots }) => () => Vue.h(tag, null, slots.default?.()) })
const TaskPicker = compileSfc(new URL('../app/widgets/builtin/pomodoro/TaskPicker.vue', import.meta.url), {
  'reka-ui': rekaModule,
  '@lifedashboard/contracts/space': { nextColor, SPACE_COLORS },
  '../../../ui/UiButton.vue': Vue.defineComponent({ setup: (_, { attrs, slots }) => () => Vue.h('button', { ...attrs, text: undefined }, slots.default?.()) }),
  '../../../ui/UiSelect.vue': stub('ui-select'),
  './view': viewModule,
  '../../../ui/UiTextField.vue': UiTextField,
})

describe('pomodoro text fields with the real UiTextField', () => {
  it('the task picker mounts its label and project name inputs', async () => {
    const store = { state: Vue.reactive({ run: { label: null, projectId: null }, projects: [], recentLabels: [] }), setTask: () => null, createProject: async () => ({ ok: true }) }
    const ui = mountComponent(TaskPicker, { store }, ['close'])
    const inputs = () => ui.nodes().filter((el) => el.tag === 'input').map((el) => el.props['aria-label'])
    expect(inputs()).toEqual(['Task'])
    ui.button('+ New project').click()
    await Vue.nextTick()
    expect(inputs()).toEqual(['Task', 'Project name'])
  })

  it('the statistics dialog mounts the project name inputs', async () => {
    const Dialog = compileSfc(new URL('../app/widgets/builtin/pomodoro/FocusStatsDialog.vue', import.meta.url), {
      'reka-ui': reka,
      '@lifedashboard/contracts/space': { nextColor, SPACE_COLORS },
      '../../../api': { api: {} },
      '../../../focus/engine': { dayKey: () => '2026-10-29' },
      '../../../focus/store': { focusStore: { state: Vue.reactive({ settings: { dailyGoal: 8 }, projects: [{ id: 'p1', name: 'Home', color: 'blue', archivedAt: null }] }), updateProject: async () => ({ ok: true }) } },
      '../../../ui/UiButton.vue': Vue.defineComponent({ setup: (_, { attrs, slots }) => () => Vue.h('button', attrs, slots.default?.()) }),
      '../../../ui/UiTextField.vue': UiTextField,
      './stats': statsModule,
      '../../widget-anchor': { anchoredBox: () => ({}) },
    })
    const ui = mountComponent(Dialog, { open: false }, [])
    ui.button('Projects').click()
    await Vue.nextTick()
    expect(ui.nodes().some((el) => el.tag === 'input' && el.props['aria-label'] === 'Name of Home')).toBe(true)
  })
})

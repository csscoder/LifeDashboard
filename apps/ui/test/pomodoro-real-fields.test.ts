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

const Dialog = compileSfc(new URL('../app/widgets/builtin/pomodoro/FocusStatsDialog.vue', import.meta.url), {
  'reka-ui': reka,
  '@lifedashboard/contracts/space': { nextColor, SPACE_COLORS },
  '../../../api': { api: { focusSessions: async () => ({ ok: true, data: [] }) } },
  '../../../focus/engine': { dayKey: () => '2026-10-29', focusZone: () => null },
  '../../../focus/store': { focusStore: { state: Vue.reactive({ settings: { dailyGoal: 8 }, projects: [{ id: 'p1', name: 'Home', color: 'blue', archivedAt: null }] }), updateProject: async () => ({ ok: true }) } },
  '../../../ui/UiButton.vue': Vue.defineComponent({ setup: (_, { attrs, slots }) => () => Vue.h('button', attrs, slots.default?.()) }),
  '../../../ui/UiTextField.vue': UiTextField,
  './stats': statsModule,
  '../../widget-anchor': { anchoredBox: () => ({}) },
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
    const ui = mountComponent(Dialog, { open: false }, [])
    ui.button('Projects').click()
    await Vue.nextTick()
    expect(ui.nodes().some((el) => el.tag === 'input' && el.props['aria-label'] === 'Name of Home')).toBe(true)
  })
})

describe('closing the pomodoro statistics dialog', () => {
  // WebKit hands focus back to the widget with a visible ring even after a mouse click; the ring keeps the corner buttons up.
  async function closeWith(detail: number) {
    vi.stubGlobal('document', { activeElement: null })
    const ui = mountComponent(Dialog, { open: false }, [])
    const box = ui.nodes().find((el) => el.tag === 'dialog')!
    const tile = box.parent!
    ui.props.open = true
    await Vue.nextTick()
    tile.focus() // what the browser restores on close
    ui.button('Close').dispatchEvent(Object.assign(new Event('click', { bubbles: true }), { detail }))
    await Vue.nextTick()
    return { box, tile }
  }

  it('a mouse click on Close leaves no focus inside the widget', async () => {
    const { box, tile } = await closeWith(1)
    expect(box.open).toBe(false)
    expect(tile.focused).toBe(false)
  })

  it('Close pressed from the keyboard keeps the restored focus', async () => {
    const { box, tile } = await closeWith(0)
    expect(box.open).toBe(false)
    expect(tile.focused).toBe(true)
  })
})


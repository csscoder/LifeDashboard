import { defineComponent, h, nextTick } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as catalog from '../app/widgets/catalog'
import * as secretBinding from '../app/widgets/secret-binding'
import * as starterPrompt from '../app/widgets/starter-prompt'
import * as secrets from '@lifedashboard/contracts/widget-secrets'
import { compileSfc, mountComponent, unmountComponents } from './helpers/sfc-renderer'

const pkg = {
  id: 'com.example.one', title: 'One', author: 'Author', origins: ['https://example.com'],
  versions: [{ version: '1.0.0', paths: { source: null } }],
  grants: [{ permission: 'network', mode: 'ask' }],
}
const api = { widgetPackages: vi.fn(), setGrantMode: vi.fn() }
const component = compileSfc(new URL('../app/widgets/PackagesDialog.vue', import.meta.url), {
  '../api': { api }, './catalog': catalog, './secret-binding': secretBinding, './starter-prompt': starterPrompt,
  '@lifedashboard/contracts/widget-secrets': secrets,
  '../ui/UiSelect.vue': defineComponent({
    props: { modelValue: String, options: Array, disabled: Boolean },
    emits: ['update:modelValue'],
    setup: (props, { attrs, emit }) => () => h('ui-select', { ...attrs, ...props, pick: (value: string) => emit('update:modelValue', value) }),
  }),
})
const settle = async () => { for (let i = 0; i < 6; i++) { await Promise.resolve(); await nextTick() } }
const select = (ui: ReturnType<typeof mountComponent>) => ui.nodes().find(node => node.tag === 'ui-select')!
async function mount() {
  const ui = mountComponent(component, { open: false }, ['update:open'])
  ui.props.open = true
  await settle()
  return ui
}

describe('package permission modes', () => {
  beforeEach(() => {
    vi.stubGlobal('document', { getElementById: (id: string) => elements[id] })
    api.widgetPackages.mockResolvedValue({ ok: true, data: [pkg] })
  })
  afterEach(() => { unmountComponents(); vi.unstubAllGlobals(); vi.clearAllMocks(); catalog.installedPackages.value = [] })
  const elements: Record<string, { focus: ReturnType<typeof vi.fn> }> = {}
  const focusable = (ui: Awaited<ReturnType<typeof mount>>) => {
    const focus = vi.fn()
    elements[select(ui).props.id] = { focus }
    return focus
  }

  it('offers both modes, saves the pick, reloads and returns focus to the select', async () => {
    const ui = await mount()
    expect(select(ui).props.modelValue).toBe('ask')
    expect(select(ui).props.options).toEqual([{ value: 'ask', label: 'Ask every time' }, { value: 'allow', label: 'Allow' }])
    expect(select(ui).props['aria-label']).toBe('Network access: mode')
    const focus = focusable(ui)
    let saved!: (value: unknown) => void
    api.setGrantMode.mockReturnValue(new Promise(resolve => { saved = resolve }))
    api.widgetPackages.mockResolvedValue({ ok: true, data: [{ ...pkg, grants: [{ permission: 'network', mode: 'allow' }] }] })
    select(ui).props.pick('allow')
    await settle()
    expect(select(ui).props.disabled).toBe(true)
    saved({ ok: true, data: null })
    await settle()
    expect(api.setGrantMode).toHaveBeenCalledWith(pkg.id, 'network', 'allow')
    expect(select(ui).props.modelValue).toBe('allow')
    expect(select(ui).props.disabled).toBe(false)
    expect(focus).toHaveBeenCalledTimes(1)
  })

  it('keeps showing the saved mode when saving fails', async () => {
    const ui = await mount()
    const focus = focusable(ui)
    api.setGrantMode.mockResolvedValue({ ok: false, error: { code: 'INTERNAL_ERROR', message: 'no' } })
    select(ui).props.pick('allow')
    await settle()
    expect(select(ui).props.modelValue).toBe('ask')
    expect(ui.text()).toContain('Could not save the mode')
    expect(focus).toHaveBeenCalledTimes(1)
  })
})

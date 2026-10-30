import { readFileSync } from 'node:fs'
import { nextTick } from 'vue'
import { parse } from 'vue/compiler-sfc'
import * as reka from 'reka-ui'
import * as boardContracts from '@lifedashboard/contracts/board'
import * as mediaApi from '../app/background/media-api'
import { probeMedia } from '../app/background/import-media'
import * as youtube from '../app/background/youtube'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { themeModules } from './helpers/theme-picker'
import { UiSelect } from './helpers/ui-select-stub'
import { withTheme } from '../app/board/edit-session'
import { compileSfc, mountComponent, unmountComponents, type HostNode } from './helpers/sfc-renderer'

const editor = compileSfc(new URL('../app/background/BackgroundEditor.vue', import.meta.url), {
  '@lifedashboard/contracts/board': boardContracts, './media-api': mediaApi, './import-media': { probeMedia }, './youtube': youtube, 'reka-ui': reka, '../ui/UiSelect.vue': UiSelect,
})
let resized: () => void
const component = compileSfc(new URL('../app/spaces/ScreenDots.vue', import.meta.url), {
  ...themeModules,
  'reka-ui': reka,
  '../ui/UiButton.vue': compileSfc(new URL('../app/ui/UiButton.vue', import.meta.url), { 'reka-ui': reka }),
  '../background/BackgroundEditor.vue': { __esModule: true, default: editor },
})
beforeEach(() => {
  vi.stubGlobal('window', { innerWidth: 1280, innerHeight: 800, addEventListener: vi.fn(), removeEventListener: vi.fn() })
  vi.stubGlobal('ResizeObserver', class { constructor(callback: () => void) { resized = callback } observe() {} disconnect() {} })
  vi.stubGlobal('fetch', async () => Response.json({ data: { id: 'id', name: 'Video.mp4', size: 128, mime: 'video/mp4' } }))
  // TabsContent waits a frame.
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { callback(0); return 0 })
})
afterEach(() => { unmountComponents(); vi.unstubAllGlobals() })
function mount(overrides: Record<string, unknown> = {}) {
  return mountComponent(component, { count: 3, index: 1, editing: true, disabled: false, canAdd: true, canRemove: true, removeTitle: '', theme: null, inherited: { palette: 'builtin:lifedashboard', mode: 'dark', style: 'glass' }, background: null, screenKey: 'space:screen', ...overrides }, ['go', 'add', 'remove', 'theme', 'background'])
}
function open(ui: ReturnType<typeof mount>) {
  const panel = ui.panel()
  expect(panel).toBeDefined()
  panel.open = true
  panel.rect = { left: 0, top: 0, width: 320, height: 200 }
  const active = ui.nodes().find(el => String(el.props.class).includes('dots__item--on'))!
  active.rect = { left: 400, top: 700, width: 40, height: 24 }
  panel.props.onToggle({ newState: 'open' })
  return panel
}

const textOf = (node: HostNode): string => [node.text, ...node.children.map(textOf)].join('')
const tabs = (ui: ReturnType<typeof mount>) => ui.nodes().filter(el => el.props.role === 'tab')
const tabPanel = (ui: ReturnType<typeof mount>, value: string) =>
  ui.nodes().find(el => el.props.role === 'tabpanel' && String(el.props.id).endsWith(`-content-${value}`))
// Reka switches tabs on mousedown; the trigger merges its handlers into an array.
const press = (tab: HostNode) => [tab.props.onMousedown].flat().forEach(handler => handler({ button: 0, ctrlKey: false, preventDefault() {} }))
const tab = (ui: ReturnType<typeof mount>, label: string) => tabs(ui).find(el => textOf(el) === label)!
const inTabPanel = (node: HostNode | null): boolean => !!node && (node.props.role === 'tabpanel' || inTabPanel(node.parent))
const video = { mediaId: '00000000-0000-4000-8000-000000000001', kind: 'video', opacity: 1, dim: .35, pattern: { shape: 'diagonal', color: '#000000', opacity: .25, scale: 1 } }

describe('screen settings tabs', () => {
  it('splits the panel into Theme, Background and Overlay and keeps deletion below the tabs', async () => {
    const ui = mount({ background: video }); await nextTick()
    expect(tabs(ui).map(textOf)).toEqual(['Theme', 'Background', 'Overlay'])
    expect(tabs(ui).map(el => el.props['aria-selected'])).toEqual(['true', 'false', 'false'])
    expect(textOf(tabPanel(ui, 'theme')!)).toContain('Inherit')
    const background = textOf(tabPanel(ui, 'background')!)
    for (const label of ['Replace background', 'YouTube background', 'Video opacity', 'Remove background']) expect(background).toContain(label)
    expect(background).not.toContain('Dimming')
    const overlay = textOf(tabPanel(ui, 'overlay')!)
    for (const label of ['Dimming', 'Pattern over the background', 'Pattern opacity', 'Pattern scale']) expect(overlay).toContain(label)
    expect(overlay).not.toContain('Video opacity')
    expect(inTabPanel(ui.button('Delete screen')!)).toBe(false)
    expect(ui.nodes().some(el => el.text === 'Screen background' || el.text.includes('Screen theme'))).toBe(false)
  })

  it('offers Overlay only with a background and returns to Background when it is removed', async () => {
    const ui = mount({ background: video }); await nextTick()
    press(tab(ui, 'Overlay')); await nextTick()
    expect(tab(ui, 'Overlay').props['aria-selected']).toBe('true')
    ui.props.background = null; await nextTick(); await nextTick()
    expect(tabs(ui).map(textOf)).toEqual(['Theme', 'Background'])
    expect(tab(ui, 'Background').props['aria-selected']).toBe('true')
    expect(tabPanel(ui, 'overlay')).toBeUndefined()
  })

  it('keeps the chosen tab between openings and focuses it instead of the hidden picker', async () => {
    const ui = mount({ background: video }); await nextTick()
    press(tab(ui, 'Background')); await nextTick()
    const panel = open(ui)
    expect(tab(ui, 'Background').focused).toBe(true)
    expect(ui.button('Inherit').focused).toBe(false)
    panel.props.onToggle({ newState: 'closed' }); await nextTick()
    expect(tab(ui, 'Background').props['aria-selected']).toBe('true')
  })

  it('saves by closing the panel and leaving the draft alone', async () => {
    const ui = mount({ background: video }), panel = open(ui)
    ui.props.background = { ...video, dim: .9 }; await nextTick()
    ui.button('Save').props.onClick()
    expect(panel.open).toBe(false)
    expect(ui.events).toEqual([])
  })

  it('cancels back to the theme and background the panel opened with', async () => {
    const theme = { palette: 'builtin:gruvbox', mode: 'dark', style: 'glass' }
    const ui = mount({ background: video, theme }), panel = open(ui)
    ui.props.theme = null
    ui.props.background = { ...video, dim: .9 }; await nextTick()
    ui.button('Cancel').props.onClick()
    expect(panel.open).toBe(false)
    expect(ui.events).toEqual([['theme', theme], ['background', video]])
  })

  it('restores a screen without a background and drops an import still running', async () => {
    const ui = mount(), panel = open(ui)
    const editor = () => ui.nodes().find(el => el.props['aria-label'] === 'Background file')!
    const before = editor()
    ui.props.background = video; await nextTick()
    ui.button('Cancel').props.onClick(); await nextTick()
    expect(ui.events).toEqual([['theme', null], ['background', null]])
    expect(panel.open).toBe(false)
    expect(editor()).not.toBe(before)
  })

  it('opens a fresh Cancel baseline each time', async () => {
    const ui = mount({ background: video }), panel = open(ui)
    panel.props.onToggle({ newState: 'closed' })
    ui.props.background = { ...video, dim: .5 }; await nextTick()
    panel.open = true
    panel.props.onToggle({ newState: 'open' })
    ui.props.background = { ...video, dim: .9 }; await nextTick()
    ui.button('Cancel').props.onClick()
    expect(ui.events.at(-1)).toEqual(['background', { ...video, dim: .5 }])
  })

  it('keeps the tab strip in place on a shorter tab, lifts for a taller one and re-anchors on opening', async () => {
    const ui = mount({ background: video }); await nextTick()
    const panel = open(ui)
    expect(panel.style.top).toBe('492px')
    panel.rect = { ...panel.rect, height: 100 }; resized()
    expect(panel.style.top).toBe('492px')
    panel.rect = { ...panel.rect, height: 300 }; resized()
    expect(panel.style.top).toBe('392px')
    panel.rect = { ...panel.rect, height: 100 }; resized()
    expect(panel.style.top).toBe('392px')
    panel.props.onToggle({ newState: 'closed' })
    panel.props.onToggle({ newState: 'open' })
    expect(panel.style.top).toBe('592px')
  })

  it('hides a form section despite its grid layout', () => {
    for (const url of ['../app/spaces/ScreenDots.vue', '../app/background/BackgroundEditor.vue']) {
      const { descriptor } = parse(readFileSync(new URL(url, import.meta.url), 'utf8'))
      expect(descriptor.styles[0]!.content).toMatch(/\[hidden\] \{ display: none; \}/)
    }
  })
})

describe('screen settings popover', () => {
  it('offers a gear only for the active screen in edit mode', async () => {
    const ui = mount()
    expect(ui.button('Screen 2 settings')).toBeDefined()
    expect(ui.button('Screen 1 settings')).toBeUndefined()
    ui.props.index = 0; await nextTick()
    expect(ui.button('Screen 1 settings')).toBeDefined()
    expect(ui.button('Screen 2 settings')).toBeUndefined()
    ui.props.editing = false; await nextTick()
    expect(ui.button('Screen 1 settings')).toBeUndefined()
  })

  it('anchors the panel above the active bullet and focuses its theme selector', () => {
    const ui = mount(), panel = open(ui)
    expect(panel.style.left).toBe('260px')
    expect(panel.style.top).toBe('492px')
    expect(ui.button('Inherit').focused).toBe(true)
  })

  it('shows inheritance and sends the selected theme into a draft', async () => {
    const ui = mount()
    await nextTick()
    expect(ui.button('Inherit').props['aria-checked']).toBe(true)
    ui.button('Gruvbox').click()
    const choice = { palette: 'builtin:gruvbox', mode: 'dark', style: 'glass' }
    expect(ui.events).toEqual([['theme', choice]])
    const draft = withTheme({ id: 'screen', rows: 12, instances: [], layout: [] }, ui.events[0]![1] as any)
    expect(draft.theme).toEqual(choice)
    ui.props.theme = choice
    await nextTick()
    ui.button('Inherit').click()
    expect(ui.events.at(-1)).toEqual(['theme', null])
  })

  it('closes the shared panel before requesting deletion', () => {
    const ui = mount(), panel = open(ui)
    ui.button('Delete screen').props.onClick()
    expect(panel.open).toBe(false)
    expect(ui.events).toEqual([['remove']])
  })

  it('protects the final space and explains the disabled delete', () => {
    const ui = mount({ count: 1, index: 0, canRemove: false, removeTitle: 'The last space cannot be deleted' })
    expect(ui.button('Screen 1 settings')).toBeDefined()
    expect(ui.button('Delete space')?.props.disabled).toBe(true)
    expect(ui.button('Delete space')?.props.title).toBe('The last space cannot be deleted')
  })

  it.each([{ editing: false }, { disabled: true }, { index: 2 }, { count: 4 }])('closes when its screen context changes: %o', async (change) => {
    const ui = mount(), panel = open(ui)
    Object.assign(ui.props, change); await nextTick()
    expect(panel.open).toBe(false)
  })

  it('stays open on any scroll or resize and follows its anchor', () => {
    const ui = mount(), panel = open(ui)
    const calls = vi.mocked(window.addEventListener).mock.calls
    const active = ui.nodes().find(el => String(el.props.class).includes('dots__item--on'))!
    const scroll = calls.find(([name]) => name === 'scroll')![1] as (event: { target: unknown }) => void
    for (const target of [panel, {}]) scroll({ target })
    expect(panel.open).toBe(true)
    active.rect = { ...active.rect, left: 500 }
    scroll({ target: {} })
    expect(panel.open).toBe(true)
    expect(panel.style.left).toBe('360px')
    active.rect = { ...active.rect, top: 900 }
    const resize = calls.find(([name]) => name === 'resize')![1] as () => void
    resize()
    expect(panel.open).toBe(true)
    expect(panel.style.top).toBe('692px')
  })

  it('keeps Escape on the gear from cancelling the board while its popover is open', () => {
    const ui = mount(); open(ui)
    const event = { key: 'Escape', cancelBubble: false, stopPropagation() { this.cancelBubble = true } }
    for (let target = ui.button('Screen 2 settings'); target && !event.cancelBubble; target = target.parent!)
      target.props.onKeydown?.(event)
    expect(event.cancelBubble).toBe(true)
  })

  it('routes independent background controls through the same screen panel', () => {
    const background = boardContracts.defaultBackground('00000000-0000-4000-8000-00000000000a')
    const ui = mount({ background })
    const videoOpacity = ui.nodes().find(el => el.props['aria-label'] === 'Video opacity')
    expect(videoOpacity).toBeDefined()
    videoOpacity!.props.onInput({ target: { value: '40' } })
    expect(ui.events).toEqual([['background', { ...background, opacity: 0.4 }]])
  })

  it('keeps a growing background editor above its anchor', () => {
    const ui = mount(), panel = open(ui)
    panel.rect.height = 400
    expect(resized).toBeTypeOf('function')
    resized()
    expect(panel.style.top).toBe('292px')
    expect(panel.style.left).toBe('260px')
  })

  it('keeps board shortcuts out of the popover without preventing native Escape', () => {
    const ui = mount(), panel = open(ui)
    const event = { stopPropagation: vi.fn(), preventDefault: vi.fn() }
    panel.props.onKeydown(event)
    expect(event.stopPropagation).toHaveBeenCalledOnce()
    expect(event.preventDefault).not.toHaveBeenCalled()
  })
})

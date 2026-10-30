import { readFileSync } from 'node:fs'
import * as reka from 'reka-ui'
import * as contracts from '@lifedashboard/contracts/space'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { parse } from 'vue/compiler-sfc'
import { themeModules } from './helpers/theme-picker'
import { compileSfc, mountComponent, type HostNode } from './helpers/sfc-renderer'

const url = new URL('../app/spaces/SpacePicker.vue', import.meta.url)
const Picker = compileSfc(url, { ...themeModules, 'reka-ui': reka, '@lifedashboard/contracts/space': contracts })
const space = { id: 'space', title: 'Desk', icon: '🏠', color: 'violet', theme: null, position: 0, revision: 1 }
const inherited = { palette: 'builtin:lifedashboard', mode: 'dark', style: 'glass' }
const mount = () => mountComponent(Picker, { space, disabled: false, inherited }, ['pick', 'close'])
const textOf = (node: HostNode): string => [node.text, ...node.children.map(textOf)].join('')
const tabPanel = (ui: ReturnType<typeof mount>, value: string) =>
  ui.nodes().find(el => el.props.role === 'tabpanel' && String(el.props.id).endsWith(`-content-${value}`))!

describe('space settings panel', () => {
  // TabsContent waits a frame.
  beforeEach(() => vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { callback(0); return 0 }))

  it('splits the icon and the theme into tabs, opening on the icon', () => {
    const ui = mount()
    const tabs = ui.nodes().filter(el => el.props.role === 'tab')
    expect(tabs.map(textOf)).toEqual(['Icon', 'Theme'])
    expect(tabs.map(el => el.props['aria-selected'])).toEqual(['true', 'false'])
    expect(textOf(tabPanel(ui, 'icon'))).toContain(contracts.SPACE_ICONS[0])
    expect(textOf(tabPanel(ui, 'theme'))).toContain('Inherit')
    expect(ui.nodes().some(el => el.text.includes('Space theme'))).toBe(false)
  })

  it('picks an icon from its tab', () => {
    const ui = mount()
    const icon = contracts.SPACE_ICONS.find(item => item !== space.icon)!
    ui.button(icon).props.onClick()
    expect(ui.events).toEqual([['pick', { icon }]])
  })

  it('is at most 400px tall, scrolls under the fixed tab strip and hides the other tab', () => {
    const css = parse(readFileSync(url, 'utf8')).descriptor.styles[0]!.content
    expect(css).toMatch(/\.space-picker \{[^}]*max-height: min\(400px, calc\(100vh - 3rem\)\);/)
    expect(css).toMatch(/\.space-picker__panel \{[^}]*min-height: 0;[^}]*overflow-y: auto;/)
    expect(css).toMatch(/\.space-picker__panel\[hidden\] \{ display: none; \}/)
  })
})

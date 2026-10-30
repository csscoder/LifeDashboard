import { readFileSync } from 'node:fs'
import { parse } from 'vue/compiler-sfc'
import { describe, expect, it, vi } from 'vitest'
import { resetWidget } from '../app/board/edit-session'
import { DEFAULT_SHADOW, type ScreenBoard } from '@lifedashboard/contracts/board'

const source = readFileSync(new URL('../app/board/WidgetBoard.vue', import.meta.url), 'utf8')
const confirmation = 'Style, shadow, look, text size and widget options return to their defaults. API keys stay set; use Clear to remove them.'

describe('board settings integration', () => {
  it('panel stays outside widget cards regardless of the instance appearance', () => {
    const root = parse(source).descriptor.template!.ast!
    let panels = 0
    function visit(node: any, inCard = false) {
      const card = inCard || node.props?.some((prop: any) => prop.name === 'class' && prop.value?.content.split(' ').includes('board__card'))
      if (node.tag === 'WidgetSettings') {
        panels++
        expect(card).toBe(false)
        const appearance = node.props.find((prop: any) => prop.arg?.content === 'appearance')
        expect(appearance.exp.content).toBe('settingsInstance?.appearance')
        // Theme cannot change ancestry: panel is a direct board-root child.
        expect(node.props.some((prop: any) => prop.name === 'v-if')).toBe(false)
      }
      for (const child of node.children ?? []) visit(child, card)
    }
    visit(root)
    expect(panels).toBe(1)
  })

  it('reset keeps secrets and returns the look to its defaults after confirming the exact copy', async () => {
    const working = { value: { id: 'screen', rows: 12, instances: [{ id: 'w1', source: { kind: 'builtin', type: 'clock-analog-1' }, config: { zone: 'UTC' }, appearance: { theme: 'bare', shadow: DEFAULT_SHADOW, variant: 'roman', scale: 40 } }], layout: [] } as ScreenBoard }
    const askDelete = vi.fn().mockResolvedValue(true)
    const api = { clearWidgetSecret: vi.fn() }
    const body = source.slice(source.indexOf('async function resetSettings()'), source.indexOf('\nconst settingsInstance'))
    const reset = new Function('settingsId', 'editing', 'saving', 'working', 'askDelete', 'resetWidget', 'gearOf', 'api', `${body}; return resetSettings`)(
      { value: 'w1' }, { value: true }, { value: false }, working, askDelete, resetWidget, () => undefined, api,
    )
    await reset()
    expect(askDelete).toHaveBeenCalledWith(confirmation, { confirm: 'Reset', cancel: 'Cancel' })
    expect(working.value.instances[0]!.appearance).toEqual({ theme: null, shadow: DEFAULT_SHADOW, variant: null, scale: null })
    expect(working.value.instances[0]!.config).toEqual({})
    expect(api.clearWidgetSecret).not.toHaveBeenCalled()
  })
})

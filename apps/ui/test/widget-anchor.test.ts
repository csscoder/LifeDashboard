import { describe, expect, it } from 'vitest'
import { anchoredBox } from '../app/widgets/widget-anchor'

const viewport = { width: 1600, height: 900 }

describe('anchoredBox', () => {
  it('centres on the widget and grows at most 20 %', () => {
    expect(anchoredBox({ left: 600, top: 300, width: 400, height: 300 }, viewport, 16)).toEqual({ x: 800, y: 450, maxWidth: 480, maxHeight: 360 })
  })
  it('keeps the box inside the viewport near an edge', () => {
    expect(anchoredBox({ left: 0, top: 0, width: 400, height: 300 }, viewport, 16)).toEqual({ x: 256, y: 196, maxWidth: 480, maxHeight: 360 })
    expect(anchoredBox({ left: 1300, top: 700, width: 300, height: 200 }, viewport, 16)).toEqual({ x: 1404, y: 764, maxWidth: 360, maxHeight: 240 })
  })
  it('never exceeds the viewport for a widget as large as the screen', () => {
    expect(anchoredBox({ left: 0, top: 0, width: 1600, height: 900 }, viewport, 16)).toEqual({ x: 800, y: 450, maxWidth: 1568, maxHeight: 868 })
  })
})

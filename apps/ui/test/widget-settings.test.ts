import { DEFAULT_SHADOW } from '@lifedashboard/contracts/board'
import { describe, expect, it } from 'vitest'
import { panelPosition, withShadow, withStyle, withVariant } from '../app/board/widget-settings'

const UNKNOWN = { palette: 'builtin:nord', mode: 'dark', style: 'solid' } as const

describe('withStyle', () => {
  it('sets bare without an existing appearance', () => {
    expect(withStyle(undefined, 'bare')).toEqual({ theme: 'bare', shadow: null, variant: null })
  })
  it('sets the theme and keeps the shadow', () => {
    expect(withStyle({ theme: null, shadow: DEFAULT_SHADOW, variant: null }, 'bare')).toEqual({ theme: 'bare', shadow: DEFAULT_SHADOW, variant: null })
  })

  it('maps «Same as board» to null', () => {
    expect(withStyle({ theme: { palette: 'builtin:gruvbox', mode: 'light', style: 'solid' }, shadow: null, variant: null }, null)).toEqual({ theme: null, shadow: null, variant: null })
    expect(withStyle(undefined, null)).toEqual({ theme: null, shadow: null, variant: null })
  })
})

describe('withShadow', () => {
  it('keeps a stored unknown theme id while the shadow changes', () => {
    const on = withShadow({ theme: UNKNOWN, shadow: null, variant: null }, DEFAULT_SHADOW)
    expect(on).toEqual({ theme: UNKNOWN, shadow: DEFAULT_SHADOW, variant: null })
    expect(withShadow(on, null)).toEqual({ theme: UNKNOWN, shadow: null, variant: null })
  })

  it('starts from an inherited theme without an appearance', () => {
    expect(withShadow(undefined, DEFAULT_SHADOW)).toEqual({ theme: null, shadow: DEFAULT_SHADOW, variant: null })
  })
})

describe('panelPosition', () => {
  const size = { width: 240, height: 300 }
  const viewport = { width: 1280, height: 800 }

  it('places the panel right of the widget, top-aligned', () => {
    expect(panelPosition({ left: 100, top: 50, right: 124 }, size, viewport)).toEqual({ left: 132, top: 50 })
  })

  it('flips left of the widget near the right edge', () => {
    expect(panelPosition({ left: 1200, top: 50, right: 1224 }, size, viewport)).toEqual({ left: 952, top: 50 })
  })

  it('keeps the panel inside the bottom edge', () => {
    expect(panelPosition({ left: 100, top: 700, right: 124 }, size, viewport)).toEqual({ left: 132, top: 492 })
  })

  it('pins a panel larger than the viewport to the margin', () => {
    expect(panelPosition({ left: 100, top: 50, right: 124 }, size, { width: 200, height: 200 })).toEqual({ left: 8, top: 8 })
  })
})

describe('withVariant', () => {
  it('starts with inherited appearance when absent', () => {
    expect(withVariant(undefined, 'roman')).toEqual({ theme: null, shadow: null, variant: 'roman' })
  })

  it('keeps theme and shadow when setting and clearing the variant', () => {
    const appearance = { theme: UNKNOWN, shadow: DEFAULT_SHADOW, variant: 'roman' }
    expect(withVariant(appearance, null)).toEqual({ ...appearance, variant: null })
    expect(withStyle(appearance, { palette: 'builtin:gruvbox', mode: 'light', style: 'solid' })).toEqual({ ...appearance, theme: { palette: 'builtin:gruvbox', mode: 'light', style: 'solid' } })
    expect(withShadow(appearance, null)).toEqual({ ...appearance, shadow: null })
  })
})

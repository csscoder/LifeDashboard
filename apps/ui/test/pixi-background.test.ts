import { readFileSync } from 'node:fs'
import { nextTick } from 'vue'
import { parse } from 'vue/compiler-sfc'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as youtube from '../app/background/youtube'
import { compileSfc, mountComponent, unmountComponents } from './helpers/sfc-renderer'

const background = { kind: 'video', mediaId: '00000000-0000-4000-8000-000000000001', opacity: 1, dim: .35, pattern: { shape: 'none', color: '#000000', opacity: .25, scale: 1 } }
const youtubeBackground = { kind: 'youtube', videoId: 'dQw4w9WgXcQ', opacity: .8, dim: .3, pattern: { shape: 'none', color: '#000000', opacity: .25, scale: 1 } }
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); await nextTick() }
function setup() {
  const renderer = { setBackground: vi.fn().mockResolvedValue(undefined), destroy: vi.fn() }
  const create = vi.fn().mockResolvedValue(renderer)
  const component = compileSfc(new URL('../app/background/PixiBackground.vue', import.meta.url), {
    './renderer': { createBackgroundRenderer: create },
    './youtube': youtube,
  })
  return { renderer, create, component }
}
let doc: EventTarget & { hidden: boolean }
let motion: EventTarget & { matches: boolean }
let view: EventTarget & { innerWidth: number; innerHeight: number; devicePixelRatio: number }
beforeEach(() => {
  doc = Object.assign(new EventTarget(), { hidden: false })
  motion = Object.assign(new EventTarget(), { matches: false })
  vi.stubGlobal('document', doc)
  vi.stubGlobal('matchMedia', () => motion)
  view = Object.assign(new EventTarget(), { innerWidth: 1626, innerHeight: 884, devicePixelRatio: 2 })
  vi.stubGlobal('window', view)
})
afterEach(() => { unmountComponents(); vi.unstubAllGlobals() })

describe('Pixi background host', () => {
  it('does not allocate Pixi for theme-only screens and forwards the latest background after initialization', async () => {
    const { component, create, renderer } = setup()
    let finish!: (value: typeof renderer) => void
    create.mockImplementation(() => new Promise(resolve => { finish = resolve }))
    const ui = mountComponent(component, { background: null }, ['error'])
    await flush(); expect(create).not.toHaveBeenCalled()
    ui.props.background = background; await flush()
    expect(create).toHaveBeenCalledTimes(1)
    ui.props.background = { ...background, kind: 'image', opacity: .2 }; await flush()
    finish(renderer); await flush()
    expect(renderer.setBackground).toHaveBeenCalledWith({ ...background, kind: 'image', opacity: .2 })
    expect(ui.nodes().find(node => node.props['aria-hidden'] === 'true')).toBeDefined()
    ui.props.background = null; await flush()
    expect(renderer.setBackground).toHaveBeenLastCalledWith(null)
  })

  it('switches screens immediately while the preceding video is still loading', async () => {
    const { component, renderer } = setup()
    let finish!: () => void
    renderer.setBackground.mockImplementationOnce(() => new Promise<void>(resolve => { finish = resolve }))
    const ui = mountComponent(component, { background }, ['error'])
    await flush()
    ui.props.background = { ...background, mediaId: '00000000-0000-4000-8000-000000000002' }
    await flush()
    expect(renderer.setBackground).toHaveBeenLastCalledWith(ui.props.background)
    finish(); await flush()
  })

  it('destroys an asynchronously initialized renderer when its component already unmounted', async () => {
    const { component, create, renderer } = setup()
    let finish!: (value: typeof renderer) => void
    create.mockImplementation(() => new Promise(resolve => { finish = resolve }))
    const ui = mountComponent(component, { background }, ['error'])
    await flush(); unmountComponents()
    finish(renderer); await flush()
    expect(renderer.destroy).toHaveBeenCalledTimes(1)
    expect(renderer.setBackground).not.toHaveBeenCalled()
    expect(ui.events).toEqual([])
  })

  it('emits a visible failure for rejected initialization, then retries on a later background', async () => {
    const { component, create, renderer } = setup()
    create.mockRejectedValueOnce(new Error('WebGL unavailable'))
    const ui = mountComponent(component, { background }, ['error'])
    await flush()
    expect(ui.events).toEqual([['error', expect.any(String)]])
    ui.props.background = { ...background, mediaId: '00000000-0000-4000-8000-000000000002' }
    await flush()
    expect(renderer.setBackground).toHaveBeenCalledWith(ui.props.background)
  })

  it('forwards runtime errors and releases the single renderer on unmount', async () => {
    const { component, create, renderer } = setup()
    const ui = mountComponent(component, { background }, ['error'])
    await flush()
    const report = create.mock.calls[0]![1] as (message: string | null) => void
    report('decode failed'); report(null)
    expect(ui.events).toEqual([['error', 'decode failed'], ['error', null]])
    unmountComponents(); report('late failure')
    expect(ui.events).toHaveLength(2)
    expect(renderer.destroy).toHaveBeenCalledTimes(1)
  })

  it('renders a muted looping youtube iframe under the overlays and keeps them in sync', async () => {
    const { component, renderer } = setup()
    const ui = mountComponent(component, { background: youtubeBackground }, ['error'])
    await flush()
    expect(renderer.setBackground).toHaveBeenCalledWith(youtubeBackground)
    const iframe = ui.nodes().find(node => node.tag === 'iframe')
    expect(iframe?.props.src).toBe('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?autoplay=1&mute=1&loop=1&playlist=dQw4w9WgXcQ&controls=0&playsinline=1&enablejsapi=1')
    expect(iframe?.props.style).toEqual({ opacity: .8 })
    ui.props.background = { ...youtubeBackground, opacity: .5 }; await flush()
    expect(ui.nodes().find(node => node.tag === 'iframe')?.props.style).toEqual({ opacity: .5 })
    ui.props.background = background; await flush()
    expect(ui.nodes().find(node => node.tag === 'iframe')).toBeUndefined()
  })

  it('stacks the overlay canvas over a youtube embed that covers the window', () => {
    const { descriptor } = parse(readFileSync(new URL('../app/background/PixiBackground.vue', import.meta.url), 'utf8'))
    const css = descriptor.styles[0]!.content
    // An in-flow canvas always paints under the absolutely positioned iframe, whatever the DOM order.
    expect(css).toMatch(/:deep\(canvas\) \{[^}]*position: absolute;[^}]*z-index: 1;/)
    expect(css).toMatch(/__youtube \{[^}]*width: max\(100vw, 177\.78vh\);[^}]*height: max\(100vh, 56\.25vw\);/)
  })

  it('pauses the youtube embed while the page is hidden or motion is reduced', async () => {
    const { component } = setup()
    const ui = mountComponent(component, { background: youtubeBackground }, ['error'])
    await flush()
    const postMessage = vi.fn()
    const iframe = ui.nodes().find(node => node.tag === 'iframe')! as unknown as { contentWindow: unknown; props: { onLoad(): void } }
    iframe.contentWindow = { postMessage }
    const last = () => [JSON.parse(postMessage.mock.lastCall![0]).func, postMessage.mock.lastCall![1]]
    doc.hidden = true; doc.dispatchEvent(new Event('visibilitychange'))
    expect(last()).toEqual(['pauseVideo', 'https://www.youtube-nocookie.com'])
    iframe.props.onLoad()
    expect(last()[0]).toBe('pauseVideo')
    doc.hidden = false; doc.dispatchEvent(new Event('visibilitychange'))
    expect(last()[0]).toBe('playVideo')
    motion.matches = true; motion.dispatchEvent(new Event('change'))
    expect(last()[0]).toBe('pauseVideo')
    motion.matches = false; motion.dispatchEvent(new Event('change'))
    expect(last()[0]).toBe('playVideo')
    const sent = postMessage.mock.calls.length
    unmountComponents()
    doc.dispatchEvent(new Event('visibilitychange')); motion.dispatchEvent(new Event('change'))
    expect(postMessage).toHaveBeenCalledTimes(sent)
  })

  it('caps the youtube player by size, follows the window and reloads on a quality change', async () => {
    const { component } = setup()
    const ui = mountComponent(component, { background: { ...youtubeBackground, quality: '720' } }, ['error'])
    await flush()
    const frame = () => ui.nodes().find(node => node.tag === 'iframe')!
    const capped = frame()
    expect(capped.props.style).toEqual({ opacity: .8, width: '640px', height: '360px', transform: 'translate(-50%, -50%) scale(2.540625)' })
    view.innerWidth = 1280; view.dispatchEvent(new Event('resize')); await flush()
    expect(frame().props.style.transform).toBe('translate(-50%, -50%) scale(2.4555555555555557)')
    expect(frame()).toBe(capped)
    ui.props.background = { ...youtubeBackground, quality: '720', opacity: .5 }; await flush()
    expect(frame()).toBe(capped)
    ui.props.background = { ...youtubeBackground, quality: '1080' }; await flush()
    expect(frame()).not.toBe(capped)
    expect(frame().props.style).toMatchObject({ width: '960px', height: '540px' })
    const sized = frame()
    ui.props.background = youtubeBackground; await flush()
    expect(frame()).not.toBe(sized)
    expect(frame().props.style).toEqual({ opacity: .8 })
    unmountComponents()
    view.innerWidth = 100; expect(() => view.dispatchEvent(new Event('resize'))).not.toThrow()
  })

  it('does not autoplay the youtube embed under reduced motion', async () => {
    motion.matches = true
    const { component } = setup()
    const ui = mountComponent(component, { background: youtubeBackground }, ['error'])
    await flush()
    expect(ui.nodes().find(node => node.tag === 'iframe')?.props.src).toContain('autoplay=0')
  })
})

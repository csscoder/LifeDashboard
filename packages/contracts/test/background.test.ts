import { describe, expect, it } from 'vitest'
import { defaultBackground, defaultYouTubeBackground, parseScreenBoard } from '../src/board.ts'
import * as board from '../src/board.ts'
const id = '00000000-0000-4000-8000-000000000001'
const background = { mediaId: id, kind: 'video', opacity: 1, dim: .35, pattern: { shape: 'circles', color: '#000000', opacity: .25, scale: 1 } }
const screen = { id, rows: 12, instances: [], layout: [] }
describe('screen backgrounds', () => {
  it('preserves canonical background before instances', () => {
    const parsed = parseScreenBoard({ ...screen, theme: { palette: 'builtin:lifedashboard', mode: 'dark', style: 'solid' }, background })
    expect(parsed).toEqual({ ok: true, value: { id, rows: 12, theme: { palette: 'builtin:lifedashboard', mode: 'dark', style: 'solid' }, background, instances: [], layout: [] } })
    if (parsed.ok) expect(Object.keys(parsed.value)).toEqual(['id', 'rows', 'theme', 'background', 'instances', 'layout'])
  })
  it('omits absent and null backgrounds', () => {
    expect(parseScreenBoard({ ...screen, background: null })).toEqual(parseScreenBoard(screen))
  })
  it.each([
    { ...background, mediaId: '../media' }, { ...background, kind: 'audio' }, { ...background, opacity: -1 }, { ...background, dim: Infinity },
    { ...background, pattern: { ...background.pattern, shape: 'random' } },
    { ...background, pattern: { ...background.pattern, color: 'red' } },
    { ...background, pattern: { ...background.pattern, opacity: 2 } },
    { ...background, pattern: { ...background.pattern, scale: .1 } },
  ])('rejects invalid background %j', (invalid) => expect(parseScreenBoard({ ...screen, background: invalid }).ok).toBe(false))
  it('normalizes legacy videoIds and creates independent image defaults', () => {
    const { mediaId, kind, ...settings } = background
    const parsed = parseScreenBoard({ ...screen, background: { videoId: mediaId, ...settings } })
    expect(parsed).toEqual({ ok: true, value: { ...screen, background } })
    if (parsed.ok) expect(Object.keys(parsed.value.background!)).toEqual(['mediaId', 'kind', 'opacity', 'dim', 'pattern'])
    expect(defaultBackground(id)).toEqual({ ...background, pattern: { ...background.pattern, shape: 'diagonal' } })
    expect(defaultBackground(id, 'image')).toEqual({ ...background, kind: 'image', pattern: { ...background.pattern, shape: 'diagonal' } })
    expect(parseScreenBoard({ ...screen, background: { ...background, kind: 'image' } }).ok).toBe(true)
  })

  const youtube = { videoId: 'dQw4w9WgXcQ', kind: 'youtube', opacity: 1, dim: .35, pattern: { shape: 'circles', color: '#000000', opacity: .25, scale: 1 } }
  it('accepts a youtube background with an eleven-character video id', () => {
    const parsed = parseScreenBoard({ ...screen, background: youtube })
    expect(parsed).toEqual({ ok: true, value: { ...screen, background: youtube } })
    if (parsed.ok) expect(Object.keys(parsed.value.background!)).toEqual(['videoId', 'kind', 'opacity', 'dim', 'pattern'])
  })
  it.each([
    { ...youtube, videoId: 'short' }, { ...youtube, videoId: 'dQw4w9WgXcQextra' }, { ...youtube, videoId: 'bad chars!!' },
    { ...youtube, videoId: id }, { ...youtube, mediaId: id }, { ...youtube, videoId: undefined },
    { ...youtube, quality: '480' }, { ...youtube, quality: 720 }, { ...youtube, quality: null },
  ])('rejects invalid youtube background %j', (invalid) => expect(parseScreenBoard({ ...screen, background: invalid }).ok).toBe(false))
  it.each(['720', '1080'])('keeps youtube quality %s as the last key, the order the editor writes', (quality) => {
    const parsed = parseScreenBoard({ ...screen, background: { quality, ...youtube } })
    if (!parsed.ok) throw new Error('expected a valid board')
    expect(parsed.value.background).toEqual({ ...youtube, quality })
    expect(Object.keys(parsed.value.background!).at(-1)).toBe('quality')
  })
  it('does not accept a quality on file backgrounds', () => {
    const parsed = parseScreenBoard({ ...screen, background: { ...background, quality: '720' } })
    expect(parsed).toEqual({ ok: true, value: { ...screen, background } })
  })
  it('creates youtube defaults sharing the media default style', () => {
    expect(defaultYouTubeBackground('dQw4w9WgXcQ')).toEqual({ videoId: 'dQw4w9WgXcQ', kind: 'youtube', opacity: 1, dim: 0.35, pattern: { shape: 'diagonal', color: '#000000', opacity: 0.25, scale: 1 } })
  })

  it.each(['none', 'diagonal', 'squares', 'crosses', 'circles', 'triangles', 'diamonds'])('accepts %s with legacy scale values', (shape) => {
    const settings = { ...background, pattern: { ...background.pattern, shape, scale: .25 } }
    const result = parseScreenBoard({ ...screen, background: settings })
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value.background).toEqual(settings)
  })

  it('publishes native pixel tile dimensions', () => {
    expect(board.BACKGROUND_PATTERN_SIZES).toEqual({
      diagonal: { width: 2, height: 2 }, squares: { width: 3, height: 3 }, crosses: { width: 3, height: 3 },
      circles: { width: 6, height: 6 }, triangles: { width: 3, height: 3 }, diamonds: { width: 3, height: 3 },
    })
  })

})

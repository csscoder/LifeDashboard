import { describe, expect, it } from 'vitest'
import { parseYouTubeUrl, youtubeEmbedUrl, youtubeFrameStyle } from '../app/background/youtube'

describe('youtube background urls', () => {
  it.each([
    ['https://www.youtube.com/watch?v=dQw4w9WgXcQ'],
    ['https://youtube.com/watch?v=dQw4w9WgXcQ&t=30s'],
    ['https://m.youtube.com/watch?v=dQw4w9WgXcQ'],
    ['https://youtu.be/dQw4w9WgXcQ?si=abc'],
    ['https://www.youtube.com/live/dQw4w9WgXcQ'],
    ['https://www.youtube.com/embed/dQw4w9WgXcQ'],
    ['https://www.youtube.com/shorts/dQw4w9WgXcQ'],
    ['dQw4w9WgXcQ'],
  ])('extracts the video id from %s', (input) => expect(parseYouTubeUrl(input)).toBe('dQw4w9WgXcQ'))
  it.each([
    'https://example.com/watch?v=dQw4w9WgXcQ',
    'https://vimeo.com/dQw4w9WgXcQ',
    'https://www.youtube.com/watch?v=short',
    'https://www.youtube.com/watch',
    'https://www.youtube.com/channel/UCxyz',
    'not a url at all',
    '',
  ])('rejects %s', (input) => expect(parseYouTubeUrl(input)).toBeNull())
  it('builds a muted looping embed url the page can pause', () => {
    expect(youtubeEmbedUrl('dQw4w9WgXcQ', true)).toBe('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?autoplay=1&mute=1&loop=1&playlist=dQw4w9WgXcQ&controls=0&playsinline=1&enablejsapi=1')
    expect(youtubeEmbedUrl('dQw4w9WgXcQ', false)).toContain('?autoplay=0&')
  })
  it.each([
    ['720', { width: 1626, height: 884, dpr: 2 }, '640px', '360px', 2.540625],
    ['1080', { width: 1626, height: 884, dpr: 2 }, '960px', '540px', 1.69375],
    ['1080', { width: 1000, height: 1000, dpr: 1 }, '1920px', '1080px', 1000 / 1080],
    ['720', { width: 800, height: 900, dpr: 1.5 }, '853.3333333333334px', '480px', 1.875],
  ] as const)('sizes the %s player by device pixels and scales it to cover %j', (quality, viewport, width, height, scale) => {
    expect(youtubeFrameStyle(quality, viewport)).toEqual({ width, height, transform: `translate(-50%, -50%) scale(${scale})` })
  })
})

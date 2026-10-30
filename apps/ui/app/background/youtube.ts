import type { YouTubeQuality } from '@lifedashboard/contracts/board'

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/
export const YOUTUBE_ORIGIN = 'https://www.youtube-nocookie.com'

/** Extracts a YouTube video id from a watch/share/live/embed/shorts URL or a bare id. */
export function parseYouTubeUrl(input: string): string | null {
  const value = input.trim()
  if (VIDEO_ID.test(value)) return value
  let url: URL
  try { url = new URL(value) } catch { return null }
  if (url.hostname === 'youtu.be') {
    const id = url.pathname.slice(1)
    return VIDEO_ID.test(id) ? id : null
  }
  if (!/(^|\.)youtube(-nocookie)?\.com$/.test(url.hostname)) return null
  const query = url.searchParams.get('v')
  if (query && VIDEO_ID.test(query)) return query
  const [segment, id] = url.pathname.split('/').filter(Boolean)
  return (segment === 'embed' || segment === 'live' || segment === 'shorts') && id !== undefined && VIDEO_ID.test(id) ? id : null
}

/** Muted, looping, chrome-less player URL for a screen background. */
export function youtubeEmbedUrl(videoId: string, autoplay: boolean): string {
  return `${YOUTUBE_ORIGIN}/embed/${videoId}?autoplay=${autoplay ? 1 : 0}&mute=1&loop=1&playlist=${videoId}&controls=0&playsinline=1&enablejsapi=1`
}

/**
 * The player ignores `vq` and quality commands and picks by its own device-pixel size, so a fixed-size
 * frame scaled to cover the window caps quality. A video without that size plays the best it has.
 */
export function youtubeFrameStyle(quality: YouTubeQuality, viewport: { width: number; height: number; dpr: number }) {
  const height = Number(quality) / viewport.dpr
  const width = height * 16 / 9
  const scale = Math.max(viewport.width / width, viewport.height / height)
  return { width: `${width}px`, height: `${height}px`, transform: `translate(-50%, -50%) scale(${scale})` }
}

import { mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import postcss from 'postcss'
import { describe, expect, it } from 'vitest'
import type { FontFamily } from '../app/theme/fonts'
import { fetchFonts } from '../scripts/fetch-fonts'

const one: FontFamily = { slug: 'one', name: 'One', fallback: 'sans-serif', weight: [100, 900] }
const two: FontFamily = { slug: 'two-two', name: 'Two Two', fallback: 'serif', weight: [400, 700] }

const face = (subset: string, url: string) => `/* ${subset} */
@font-face {
  font-family: 'X';
  font-style: normal;
  font-weight: 100 900;
  font-display: swap;
  src: url(${url}) format('woff2');
  unicode-range: U+0000-00FF;
}
`

function stub(options: { fail?: string; skipCyrillic?: string } = {}): typeof fetch {
  return (async (input: string | URL | Request) => {
    const url = String(input)
    if (options.fail && url.includes(options.fail)) return new Response('', { status: 500 })
    if (url.startsWith('https://fonts.googleapis.com/css2')) {
      const family = new URL(url).searchParams.get('family')!.split(':')[0]!.replaceAll(' ', '-').toLowerCase()
      const subsets = options.skipCyrillic === family ? ['latin'] : ['latin', 'cyrillic']
      return new Response(subsets.map((subset) => face(subset, `https://fonts.gstatic.com/${family}/${subset}.woff2`)).join(''))
    }
    return new Response(url.endsWith('OFL.txt') ? `licence ${url}` : new Uint8Array([1, 2, 3]))
  }) as typeof fetch
}

function setup() {
  const root = mkdtempSync(join(tmpdir(), 'fetch-fonts-'))
  const fontsDir = join(root, 'fonts')
  mkdirSync(fontsDir)
  writeFileSync(join(fontsDir, 'sentinel.woff2'), 'old')
  writeFileSync(join(root, 'fonts.css'), 'old css')
  return {
    fontsDir, cssPath: join(root, 'fonts.css'),
    options: (fetch: typeof globalThis.fetch, fonts: FontFamily[]) => ({
      fetch, fonts, fontsDir: pathToFileURL(`${fontsDir}/`), cssFile: pathToFileURL(join(root, 'fonts.css')),
    }),
  }
}

describe('fetchFonts', () => {
  it('writes nothing when a later family answers HTTP 500', async () => {
    const t = setup()
    await expect(fetchFonts(t.options(stub({ fail: 'two-two/latin' }), [one, two]))).rejects.toThrow('Two Two: HTTP 500 https://fonts.gstatic.com/two-two/latin.woff2')
    expect(readdirSync(t.fontsDir)).toEqual(['sentinel.woff2'])
    expect(readFileSync(t.cssPath, 'utf8')).toBe('old css')
  })

  it('writes nothing when a family lacks the cyrillic subset', async () => {
    const t = setup()
    await expect(fetchFonts(t.options(stub({ skipCyrillic: 'one' }), [one, two]))).rejects.toThrow('One: missing cyrillic subset')
    expect(readdirSync(t.fontsDir)).toEqual(['sentinel.woff2'])
    expect(readFileSync(t.cssPath, 'utf8')).toBe('old css')
  })

  it('replaces the files and the stylesheet after every family succeeded', async () => {
    const t = setup()
    await fetchFonts(t.options(stub(), [one, two]))
    expect(readdirSync(t.fontsDir).sort()).toEqual(['one-cyrillic.woff2', 'one-latin.woff2', 'one.OFL.txt', 'two-two-cyrillic.woff2', 'two-two-latin.woff2', 'two-two.OFL.txt'])
    const css = readFileSync(t.cssPath, 'utf8')
    expect(postcss.parse(css).nodes.filter((node) => node.type === 'atrule')).toHaveLength(4)
    expect(css).toContain("font-family: 'Two Two'")
    expect(css).toContain("src: url(../fonts/two-two-cyrillic.woff2) format('woff2')")
    expect(readFileSync(join(t.fontsDir, 'two-two.OFL.txt'), 'utf8')).toContain('/ofl/twotwo/OFL.txt')
  })
})

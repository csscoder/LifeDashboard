import { existsSync, readFileSync } from 'node:fs'
import { parse } from 'vue/compiler-sfc'
import postcss, { type Rule } from 'postcss'
import { expect, it } from 'vitest'
import { compileSfc, mountComponent } from './helpers/sfc-renderer'
import * as builtin from '../app/theme/builtin'
import * as resolve from '../app/theme/resolve'
import * as shadow from '../app/theme/shadow'
import * as boardSettings from '../app/board/widget-settings'

const contentUrl = new URL('../app/theme/styles/content.css', import.meta.url)
function content() {
  expect(existsSync(contentUrl), 'semantic content stylesheet exists').toBe(true)
  return postcss.parse(readFileSync(contentUrl, 'utf8'))
}
function declarations(selector: string) {
  let rule: Rule | undefined
  content().walkRules(candidate => { if (candidate.selectors.includes(selector)) rule = candidate })
  expect(rule, selector).toBeDefined()
  return Object.fromEntries(rule!.nodes.filter(node => node.type === 'decl').map(node => [node.prop, node.value]))
}

it('keeps every semantic content rule scoped inside the base layer', () => {
  const css = content()
  expect(css.nodes).toHaveLength(1)
  let count = 0
  css.walkRules(rule => {
    count++
    expect(rule.parent).toMatchObject({ type: 'atrule', name: 'layer', params: 'ld.base' })
    for (const selector of rule.selectors) expect(selector.startsWith(':where(.ld-content)')).toBe(true)
  })
  expect(count).toBeGreaterThan(0)
})
it('gives plain widget text the theme body typography and color', () => {
  expect(declarations(':where(.ld-content)')).toMatchObject({
    color: 'var(--ld-text-primary)', 'font-family': 'var(--ld-font-body)',
    'font-size': 'var(--ld-size-body)', 'line-height': 'var(--ld-leading)', 'letter-spacing': 'var(--ld-tracking)',
  })
})
it('makes widget text unselectable by default, except in editable controls', () => {
  expect(declarations(':where(.ld-content)')).toMatchObject({ 'user-select': 'none', '-webkit-user-select': 'none' })
  expect(declarations(':where(.ld-content) :where(input, textarea, [contenteditable])')).toMatchObject({ 'user-select': 'text', '-webkit-user-select': 'text' })
})
it('gives keyboard-focused links a visible theme focus ring', () => {
  expect(declarations(':where(.ld-content) :where(a):focus-visible')).toMatchObject({
    outline: '0.125rem solid var(--ld-focus-ring)', 'outline-offset': '0.125rem',
  })
})
it('keeps code inside pre at the enclosing code block size', () => {
  expect(declarations(':where(.ld-content) :where(pre code)')).toMatchObject({ 'font-size': 'inherit' })
})
it('loads content styles in the base layer before frame styles', () => {
  const css = postcss.parse(readFileSync(new URL('../app/theme/styles/layers.css', import.meta.url), 'utf8'))
  expect(css.nodes.find(node => node.type === 'atrule' && node.name === 'layer')).toMatchObject({
    params: 'ld.reset, ld.base, ld.frame, ld.skin, ld.theme, ld.utilities, ld.widget, ld.comfort',
  })
  expect(css.nodes.some(node => node.type === 'atrule' && node.name === 'import' && node.params === "'./content.css'")).toBe(true)
})
it('opts the mounted widget body into semantic content styling', () => {
  const component = compileSfc(new URL('../app/widgets/WidgetFrame.vue', import.meta.url), {
    '../theme/builtin': builtin, '../theme/resolve': resolve, '../theme/shadow': shadow, '../board/widget-settings': boardSettings,
  })
  const mounted = mountComponent(component, { themeId: 'builtin:gruvbox-light-solid' }, [])
  const body = mounted.nodes().find(node => String(node.props.class).split(' ').includes('widget__body'))
  expect(body).toBeDefined()
  expect(String(body!.props.class).split(' ')).toContain('ld-content')
})
it('applies the last-child bottom margin reset after every element margin, including hr', () => {
  const css = content()
  let lastChildReset = -1
  let lastElementMargin = -1
  let position = 0
  css.walkDecls(declaration => {
    const rule = declaration.parent as Rule
    if (rule.selector === ':where(.ld-content) :where(:last-child)' && declaration.prop === 'margin-bottom') {
      expect(declaration.value).toBe('0')
      lastChildReset = position
    } else if (declaration.prop === 'margin' || declaration.prop === 'margin-bottom') {
      lastElementMargin = position
    }
    position++
  })
  expect(declarations(':where(.ld-content) :where(hr)')).toMatchObject({ margin: '1em 0' })
  // All selectors here have zero specificity in the same layer. A later margin shorthand
  // would overwrite margin-bottom even on a final hr, so the reset must come last.
  expect(lastElementMargin).toBeGreaterThanOrEqual(0)
  expect(lastChildReset).toBeGreaterThan(lastElementMargin)
})

it('scales the widget body from the content scale variable', () => {
  const frame = postcss.parse(readFileSync(new URL('../app/theme/styles/frame.css', import.meta.url), 'utf8'))
  let fontSize: string | undefined
  frame.walkRules(rule => {
    if (rule.selectors.includes('.widget__body')) rule.walkDecls('font-size', decl => { fontSize = decl.value })
  })
  expect(fontSize).toBe('calc(var(--ld-font-scale) * var(--ld-content-scale, 1) * 1rem)')
})
it('sizes the placeholder text in em, not in rem-based utilities', () => {
  const sfc = parse(readFileSync(new URL('../app/widgets/builtin/PlaceholderWidget.vue', import.meta.url), 'utf8'))
  const { descriptor } = sfc
  expect(descriptor.template!.content).not.toContain('text-2xl')
  expect(descriptor.styles.some(style => style.scoped)).toBe(true)
  const css = postcss.parse(descriptor.styles.map(style => style.content).join('\n'))
  const declared: Record<string, string> = {}
  css.walkDecls(decl => { declared[decl.prop] = decl.value })
  expect(declared).toMatchObject({ 'font-size': '1.5em', 'line-height': 'calc(4 / 3)' })
})
it('sizes the Pomodoro text so it follows the text size setting', () => {
  const { descriptor } = parse(readFileSync(new URL('../app/widgets/builtin/pomodoro/Pomodoro.vue', import.meta.url), 'utf8'))
  const css = postcss.parse(descriptor.styles.map(style => style.content).join('\n'))
  const fontSizes: string[] = []
  css.walkDecls(decl => {
    if (decl.prop === 'font-size') fontSizes.push(decl.value)
    if (/^(font-size|width|height|min-width|gap|padding)$/.test(decl.prop)) expect(decl.value, `${decl.prop}: ${decl.value}`).not.toMatch(/\drem\b/)
  })
  expect(fontSizes.length).toBeGreaterThan(0)
  for (const value of fontSizes) expect(value).toMatch(/\dem\b|--ld-content-scale/)
})
it('keeps the Pomodoro statistics dialog at the dashboard text size, centred on the widget', () => {
  // The dialog lives inside the widget body, which the text size setting scales; anchoredBox gives its centre and limits.
  const { descriptor } = parse(readFileSync(new URL('../app/widgets/builtin/pomodoro/FocusStatsDialog.vue', import.meta.url), 'utf8'))
  const css = postcss.parse(descriptor.styles.map(style => style.content).join('\n'))
  const declared: Record<string, string> = {}
  css.walkRules('.focus-stats', rule => rule.walkDecls(decl => { declared[decl.prop] = decl.value }))
  expect(declared).toMatchObject({ 'font-size': '1rem', margin: '0', left: 'var(--x, 50%)', top: 'var(--y, 50%)', translate: '-50% -50%' })
})
it('keeps each Pomodoro session on one line in a narrow statistics dialog', () => {
  const { descriptor } = parse(readFileSync(new URL('../app/widgets/builtin/pomodoro/FocusStatsDialog.vue', import.meta.url), 'utf8'))
  expect(descriptor.template!.content).toContain('class="focus-stats__session"')
  const css = postcss.parse(descriptor.styles.map(style => style.content).join('\n'))
  const declared: Record<string, string> = {}
  css.walkRules('.focus-stats__list .focus-stats__session', rule => rule.walkDecls(decl => { declared[decl.prop] = decl.value }))
  expect(declared).toMatchObject({ display: 'grid', 'grid-template-columns': 'max-content minmax(0, 1fr) minmax(0, max-content) max-content max-content' })
})
it('keeps room for the focus ring of the Pomodoro corner buttons', () => {
  // The ring is 0.125rem wide at a 0.125rem offset; the widget card clips anything past its edge.
  const { descriptor } = parse(readFileSync(new URL('../app/widgets/builtin/pomodoro/Pomodoro.vue', import.meta.url), 'utf8'))
  const css = postcss.parse(descriptor.styles.map(style => style.content).join('\n'))
  const declared = (selector: string) => {
    const found: Record<string, string> = {}
    css.walkRules(selector, rule => rule.walkDecls(decl => { found[decl.prop] = decl.value }))
    return found
  }
  // The bottom controls mirror the statistics button: the same 0.25rem from the card's edges.
  expect(declared('.pomodoro__controls')).toMatchObject({ right: '0.25rem', bottom: '0.25rem' })
  // A child of the tile, beside the statistics button, not of the ring's box.
  expect(descriptor.template!.content).toMatch(/\n {6}<div class="pomodoro__controls">/)
  expect(declared('.pomodoro__stats')).toMatchObject({ top: '0.25rem', right: '0.25rem' })
})
it('fills the tile with the Pomodoro ring, the tomato close inside it', () => {
  const { descriptor } = parse(readFileSync(new URL('../app/widgets/builtin/pomodoro/Pomodoro.vue', import.meta.url), 'utf8'))
  const css = postcss.parse(descriptor.styles.map(style => style.content).join('\n'))
  const declared = (selector: string) => {
    const found: Record<string, string> = {}
    css.walkRules(selector, rule => rule.walkDecls(decl => { found[decl.prop] = decl.value }))
    return found
  }
  // All the height left after the top padding, the goal line and the gap, keeping the top padding free below the ring.
  expect(declared('.pomodoro')['--face']).toBe('min(100cqw, calc(100cqh - 17cqmin))')
  expect(declared('.pomodoro__tomato')).toMatchObject({ inset: '8.5%', width: '83%', height: '83%' })
})
it('keeps the Pomodoro clock centred whether or not the play button shows', () => {
  const { descriptor } = parse(readFileSync(new URL('../app/widgets/builtin/pomodoro/Pomodoro.vue', import.meta.url), 'utf8'))
  const css = postcss.parse(descriptor.styles.map(style => style.content).join('\n'))
  const declared = (selector: string) => {
    const found: Record<string, string> = {}
    css.walkRules(selector, rule => rule.walkDecls(decl => { found[decl.prop] = decl.value }))
    return found
  }
  // The top padding sets the centre on the tomato's body, below the stalk.
  expect(declared('.pomodoro__center')).toMatchObject({ display: 'grid', 'grid-template-rows': '1fr auto 1fr', 'padding-top': 'calc(var(--face) * 0.19)' })
  expect(declared('.pomodoro__clock')['grid-row']).toBe('2')
  expect(declared('.pomodoro__play')).toMatchObject({ 'grid-row': '3', 'align-self': 'start', 'margin-top': 'calc(var(--face) * 0.032)' })
})
it('stacks the Pomodoro goal, ring and task from the top, leaving the free space to the controls below', () => {
  const { descriptor } = parse(readFileSync(new URL('../app/widgets/builtin/pomodoro/Pomodoro.vue', import.meta.url), 'utf8'))
  const css = postcss.parse(descriptor.styles.map(style => style.content).join('\n'))
  const declared = (selector: string) => {
    const found: Record<string, string> = {}
    css.walkRules(selector, rule => rule.walkDecls(decl => { found[decl.prop] = decl.value }))
    return found
  }
  expect(declared('.pomodoro')).toMatchObject({ 'justify-content': 'flex-start', gap: '1cqmin', 'padding-top': '4cqmin' })
  expect(declared('.pomodoro__error')['margin-block']).toBe('auto')
})
it('puts the Pomodoro task on the tomato above the centred clock, with sleeping Zzz on its shoulder', () => {
  const { descriptor } = parse(readFileSync(new URL('../app/widgets/builtin/pomodoro/Pomodoro.vue', import.meta.url), 'utf8'))
  const css = postcss.parse(descriptor.styles.map(style => style.content).join('\n'))
  const declared = (selector: string) => {
    const found: Record<string, string> = {}
    css.walkRules(selector, rule => rule.walkDecls(decl => { found[decl.prop] = decl.value }))
    return found
  }
  expect(declared('.pomodoro__label')).toMatchObject({ 'grid-row': '1', 'align-self': 'end', 'pointer-events': 'auto' })
  expect(declared('.pomodoro__zzz')).toMatchObject({ position: 'absolute', 'pointer-events': 'none' })
  const template = descriptor.template!.content
  expect(template.indexOf('class="pomodoro__label"')).toBeGreaterThan(template.indexOf('class="pomodoro__center"'))
  expect(template).toContain('class="pomodoro__zzz" aria-hidden="true"')
})

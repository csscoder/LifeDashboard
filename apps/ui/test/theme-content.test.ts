import { existsSync, readFileSync } from 'node:fs'
import postcss, { type Rule } from 'postcss'
import { expect, it } from 'vitest'
import { compileSfc, mountComponent } from './helpers/sfc-renderer'
import * as builtin from '../app/theme/builtin'
import * as resolve from '../app/theme/resolve'
import * as shadow from '../app/theme/shadow'

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
    '../theme/builtin': builtin, '../theme/resolve': resolve, '../theme/shadow': shadow,
  })
  const mounted = mountComponent(component, { themeId: 'builtin:paper' }, [])
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
